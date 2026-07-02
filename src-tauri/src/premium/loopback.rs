use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

lazy_static::lazy_static! {
    static ref SHUTDOWN_FLAG: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    static ref EXPECTED_STATE: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
}

pub fn start_server<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<u16, String> {
    // Stop any existing instance first
    stop_server();

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind loopback server: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let state = uuid::Uuid::new_v4().to_string();
    if let Ok(mut guard) = EXPECTED_STATE.lock() {
        *guard = Some(state.clone());
    }

    SHUTDOWN_FLAG.store(false, Ordering::Relaxed);
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let handle_clone = app_handle.clone();
    let shutdown_flag = SHUTDOWN_FLAG.clone();

    thread::spawn(move || {
        let start_time = Instant::now();
        let timeout = Duration::from_secs(5 * 60); // 5 minutes inactivity timeout

        while !shutdown_flag.load(Ordering::Relaxed) {
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

        // Cleanup expected state on exit
        if let Ok(mut guard) = EXPECTED_STATE.lock() {
            *guard = None;
        }
        crate::log_info!("LocalAuthServer: Thread exited");
    });

    crate::log_info!("LocalAuthServer: Started on port {}", port);
    Ok(port)
}

pub fn stop_server() {
    SHUTDOWN_FLAG.store(true, Ordering::Relaxed);
}

fn handle_connection<R: tauri::Runtime>(mut stream: TcpStream, app_handle: &tauri::AppHandle<R>) {
    let mut buffer = [0; 4096];
    let mut read_bytes = 0;
    stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();

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

    let origin_str = origin.as_deref().unwrap_or("");
    let is_origin_allowed = origin_str.is_empty() || allowed_origins.iter().any(|&o| origin_str == o);

    if !is_origin_allowed {
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

    // Parse parameters
    let mut params = std::collections::HashMap::new();

    // Query parameters parsing
    for pair in query.split('&') {
        let kv: Vec<&str> = pair.splitn(2, '=').collect();
        if kv.len() == 2 {
            if let Ok(decoded_val) = percent_encoding::percent_decode_str(kv[1]).decode_utf8() {
                params.insert(kv[0].to_string(), decoded_val.into_owned());
            }
        }
    }

    // JSON Body parsing for POST
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
                        params.insert(key.clone(), s.to_string());
                    }
                }
            }
        }
    }

    // Validate expected state to prevent CSRF
    let expected = {
        if let Ok(guard) = EXPECTED_STATE.lock() {
            guard.clone()
        } else {
            None
        }
    };

    let state_param = params.get("state").cloned();
    if expected.is_none() || state_param != expected {
        let err_json = r#"{"status":"error","message":"Invalid or missing state parameter"}"#;
        send_response(&mut stream, 403, err_json, "application/json", origin.as_deref());
        return;
    }

    let id_token = params.get("idToken");
    let refresh_token = params.get("refreshToken");
    let email = params.get("email").cloned().unwrap_or_default();
    let uid = params.get("uid").cloned().unwrap_or_default();

    if let (Some(id_t), Some(ref_t)) = (id_token, refresh_token) {
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
