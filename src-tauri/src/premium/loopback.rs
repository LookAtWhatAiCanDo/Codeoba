use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

// CSRF state (nonce) of the currently active server generation.
static EXPECTED_STATE: Mutex<Option<String>> = Mutex::new(None);
// Shutdown flag of the currently active generation. Each start_server installs its own flag here,
// so stopping one generation can never be undone by another resetting a single shared flag.
static CURRENT_SHUTDOWN: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
// Monotonic id of the active generation, so a superseded thread's cleanup does not wipe a newer
// generation's shared state.
static GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn start_server<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<u16, String> {
    // Signal any existing generation to stop.
    stop_server();

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind loopback server: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    // Claim a new generation with its own shutdown flag, so stopping this server is independent of
    // any previous generation that may still be winding down.
    let my_generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let shutdown = Arc::new(AtomicBool::new(false));

    let state = uuid::Uuid::new_v4().to_string();
    if let Ok(mut guard) = EXPECTED_STATE.lock() {
        *guard = Some(state);
    }
    if let Ok(mut guard) = CURRENT_SHUTDOWN.lock() {
        *guard = Some(shutdown.clone());
    }

    let handle_clone = app_handle.clone();

    thread::spawn(move || {
        let start_time = Instant::now();
        let timeout = Duration::from_secs(5 * 60); // 5 minutes inactivity timeout

        while !shutdown.load(Ordering::Relaxed) {
            if start_time.elapsed() > timeout {
                crate::log_info!("LocalAuthServer: Stopping due to 5-minute inactivity timeout");
                break;
            }

            match listener.accept() {
                Ok((stream, _)) => {
                    handle_connection(stream, &handle_clone);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50));
                }
                Err(_) => {
                    break;
                }
            }
        }

        // Clear the shared state only if this generation is still the active one — a newer
        // start_server may have taken over while we were shutting down and must not be disturbed.
        if GENERATION.load(Ordering::SeqCst) == my_generation {
            if let Ok(mut guard) = EXPECTED_STATE.lock() {
                *guard = None;
            }
            if let Ok(mut guard) = CURRENT_SHUTDOWN.lock() {
                *guard = None;
            }
        }
        crate::log_info!("LocalAuthServer: Thread exited");
    });

    crate::log_info!("LocalAuthServer: Started on port {}", port);
    Ok(port)
}

pub fn stop_server() {
    // Signal only the currently active generation's flag; its own thread performs cleanup.
    if let Ok(guard) = CURRENT_SHUTDOWN.lock() {
        if let Some(flag) = guard.as_ref() {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

/// Whether the request's `Origin` is acceptable for the token-bearing auth callback.
///
/// A present, allowlisted Origin is required. A missing or empty Origin is rejected: browsers
/// omit `Origin` on top-level navigations and image/subresource loads, so accepting an empty
/// Origin (the previous behavior) let any web page reach this endpoint. The legitimate client is
/// a CORS fetch from the login page, which always sends `Origin`.
fn is_origin_allowed(origin: Option<&str>, allowed_origins: &[&str]) -> bool {
    match origin {
        Some(o) if !o.is_empty() => allowed_origins.iter().any(|&a| a == o),
        _ => false,
    }
}

struct ResolvedAuth {
    state: Option<String>,
    id_token: Option<String>,
    refresh_token: Option<String>,
    email: String,
    uid: String,
}

/// Resolves the auth fields from the two request parameter sources.
///
/// Credentials (idToken/refreshToken/email/uid) are read from the POST body **only**, never from
/// the query string — a query string travels in the URL and leaks into browser history, server
/// logs, and Referer headers, which must never carry long-lived tokens. The CSRF `state` is not a
/// credential and may arrive in either source (body preferred).
fn resolve_auth_fields(
    query_params: &std::collections::HashMap<String, String>,
    body_params: &std::collections::HashMap<String, String>,
) -> ResolvedAuth {
    ResolvedAuth {
        state: body_params.get("state").or_else(|| query_params.get("state")).cloned(),
        id_token: body_params.get("idToken").cloned(),
        refresh_token: body_params.get("refreshToken").cloned(),
        email: body_params.get("email").cloned().unwrap_or_default(),
        uid: body_params.get("uid").cloned().unwrap_or_default(),
    }
}

fn handle_connection<R: tauri::Runtime>(mut stream: TcpStream, app_handle: &tauri::AppHandle<R>) {
    let mut buffer = [0; 4096];
    let mut read_bytes = 0;
    // Skip this connection rather than panicking the accept thread if the timeout can't be set.
    if stream.set_read_timeout(Some(Duration::from_secs(2))).is_err() {
        return;
    }

    loop {
        match stream.read(&mut buffer[read_bytes..]) {
            Ok(0) => break,
            Ok(n) => {
                read_bytes += n;
                if read_bytes >= buffer.len() || buffer[..read_bytes].windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            Err(_) => return,
        }
    }

    let req_str = String::from_utf8_lossy(&buffer[..read_bytes]);
    let mut lines = req_str.lines();
    let request_line = match lines.next() {
        Some(line) => line,
        None => return,
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let full_path = parts[1];

    // Extract headers for Origin checking
    let mut origin = None;
    let mut content_length = 0;
    for line in lines {
        if line.is_empty() {
            break;
        }
        let header_parts: Vec<&str> = line.splitn(2, ':').collect();
        if header_parts.len() == 2 {
            let key = header_parts[0].trim().to_lowercase();
            let val = header_parts[1].trim();
            if key == "origin" {
                origin = Some(val.to_string());
            } else if key == "content-length" {
                content_length = val.parse::<usize>().unwrap_or(0);
            }
        }
    }

    // CORS Origin gate (mirroring allowedOrigins in Kotlin)
    let allowed_origins = [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "https://codeoba-dev.web.app",
        "https://codeoba-prod.web.app",
        "https://codeoba.com",
        "https://codeoba.firebaseapp.com",
        "https://codeoba-dev.firebaseapp.com",
    ];

    if !is_origin_allowed(origin.as_deref(), &allowed_origins) {
        send_response(&mut stream, 403, "Unauthorized origin", "text/plain", None);
        return;
    }

    // Handle OPTIONS preflight request
    if method == "OPTIONS" {
        send_response(&mut stream, 204, "", "text/plain", origin.as_deref());
        return;
    }

    // Parse path and query params
    let url_parts: Vec<&str> = full_path.splitn(2, '?').collect();
    let path = url_parts[0];
    let query = url_parts.get(1).copied().unwrap_or("");

    if path != "/callback" {
        send_response(&mut stream, 404, "Not Found", "text/plain", origin.as_deref());
        return;
    }

    // Query parameters (non-secret only — the CSRF state may arrive here; credentials must not).
    let mut query_params = std::collections::HashMap::new();
    for pair in query.split('&') {
        let kv: Vec<&str> = pair.splitn(2, '=').collect();
        if kv.len() == 2 {
            if let Ok(decoded_val) = percent_encoding::percent_decode_str(kv[1]).decode_utf8() {
                query_params.insert(kv[0].to_string(), decoded_val.into_owned());
            }
        }
    }

    // JSON body parameters (POST). Credentials are read only from here (see resolve_auth_fields).
    let mut body_params = std::collections::HashMap::new();
    if method == "POST" && content_length > 0 {
        // Read remaining body bytes
        let header_end_idx = req_str.find("\r\n\r\n").map(|i| i + 4).unwrap_or(read_bytes);
        let mut body_bytes = req_str.as_bytes()[header_end_idx..].to_vec();

        let remaining = content_length.saturating_sub(body_bytes.len());
        if remaining > 0 {
            let mut extra_buf = vec![0; remaining];
            if stream.read_exact(&mut extra_buf).is_ok() {
                body_bytes.extend(extra_buf);
            }
        }

        if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
            if let Some(obj) = json_val.as_object() {
                for (key, val) in obj {
                    if let Some(s) = val.as_str() {
                        body_params.insert(key.clone(), s.to_string());
                    }
                }
            }
        }
    }

    let auth = resolve_auth_fields(&query_params, &body_params);

    // Validate expected state to prevent CSRF
    let expected = {
        if let Ok(guard) = EXPECTED_STATE.lock() {
            guard.clone()
        } else {
            None
        }
    };

    if expected.is_none() || auth.state != expected {
        let err_json = r#"{"status":"error","message":"Invalid or missing state parameter"}"#;
        send_response(&mut stream, 403, err_json, "application/json", origin.as_deref());
        return;
    }

    let email = auth.email;
    let uid = auth.uid;

    if let (Some(id_t), Some(ref_t)) = (auth.id_token.as_ref(), auth.refresh_token.as_ref()) {
        // Save tokens securely to keychain keyring
        crate::keyring::put_secret("ecosystem_id_token", Some(id_t));
        crate::keyring::put_secret("ecosystem_refresh_token", Some(ref_t));
        crate::keyring::put_secret("ecosystem_email", Some(&email));
        crate::keyring::put_secret("ecosystem_uid", Some(&uid));

        // Notify SolidJS frontend
        #[derive(serde::Serialize, Clone)]
        struct AuthSuccessPayload {
            email: String,
            uid: String,
        }
        let _ = app_handle.emit("local-auth-success", AuthSuccessPayload { email, uid });

        let resp_json = r#"{"status":"success","message":"Successfully authenticated"}"#;
        send_response(&mut stream, 200, resp_json, "application/json", origin.as_deref());

        // Stop server shortly after success
        thread::spawn(|| {
            thread::sleep(Duration::from_millis(500));
            stop_server();
        });
    } else {
        let err_json = r#"{"status":"error","message":"Missing authentication tokens"}"#;
        send_response(&mut stream, 400, err_json, "application/json", origin.as_deref());
    }
}

fn send_response(stream: &mut TcpStream, status_code: u16, body: &str, content_type: &str, cors_origin: Option<&str>) {
    let status_text = match status_code {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Internal Server Error",
    };

    let mut response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}; charset=UTF-8\r\nContent-Length: {}\r\n",
        status_code,
        status_text,
        content_type,
        body.len()
    );

    if let Some(origin) = cors_origin {
        response.push_str(&format!("Access-Control-Allow-Origin: {}\r\n", origin));
        response.push_str("Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n");
        response.push_str("Access-Control-Allow-Headers: Content-Type, Authorization\r\n");
    }

    response.push_str("\r\n");
    response.push_str(body);

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[cfg(test)]
mod origin_tests {
    use super::is_origin_allowed;

    const ALLOWED: &[&str] = &["https://codeoba.com", "http://127.0.0.1:5000"];

    #[test]
    fn rejects_missing_or_empty_origin() {
        // The bug: an absent or empty Origin used to be accepted, letting any page reach the
        // token-bearing callback via a top-level navigation or image load.
        assert!(!is_origin_allowed(None, ALLOWED));
        assert!(!is_origin_allowed(Some(""), ALLOWED));
    }

    #[test]
    fn accepts_only_allowlisted_origins() {
        assert!(is_origin_allowed(Some("https://codeoba.com"), ALLOWED));
        assert!(is_origin_allowed(Some("http://127.0.0.1:5000"), ALLOWED));

        assert!(!is_origin_allowed(Some("https://evil.example"), ALLOWED));
        // No substring / suffix leniency.
        assert!(!is_origin_allowed(Some("https://codeoba.com.evil.example"), ALLOWED));
        assert!(!is_origin_allowed(Some("https://codeoba.com "), ALLOWED));
    }
}

#[cfg(test)]
mod auth_field_tests {
    use super::resolve_auth_fields;
    use std::collections::HashMap;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    /// The fix: credentials must be read from the POST body, never the query string.
    #[test]
    fn credentials_come_from_body_not_query() {
        // Tokens supplied only via the query string are ignored.
        let query = map(&[("idToken", "Q"), ("refreshToken", "Q")]);
        let auth = resolve_auth_fields(&query, &HashMap::new());
        assert_eq!(auth.id_token, None);
        assert_eq!(auth.refresh_token, None);

        // From the body they are honored.
        let body = map(&[("idToken", "B1"), ("refreshToken", "B2"), ("email", "e"), ("uid", "u")]);
        let auth = resolve_auth_fields(&HashMap::new(), &body);
        assert_eq!(auth.id_token.as_deref(), Some("B1"));
        assert_eq!(auth.refresh_token.as_deref(), Some("B2"));
        assert_eq!(auth.email, "e");
        assert_eq!(auth.uid, "u");
    }

    #[test]
    fn query_cannot_override_body_credentials() {
        let auth = resolve_auth_fields(&map(&[("idToken", "ATTACKER")]), &map(&[("idToken", "REAL")]));
        assert_eq!(auth.id_token.as_deref(), Some("REAL"));
    }

    #[test]
    fn state_may_come_from_either_source_body_preferred() {
        let auth = resolve_auth_fields(&map(&[("state", "q")]), &HashMap::new());
        assert_eq!(auth.state.as_deref(), Some("q"));

        let auth = resolve_auth_fields(&map(&[("state", "q")]), &map(&[("state", "b")]));
        assert_eq!(auth.state.as_deref(), Some("b"));
    }
}
