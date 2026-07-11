use std::collections::HashMap;
use std::path::{Path, PathBuf};
use crate::keyring;
use crate::models::Session;
use crate::parsers::get_sources_list;
use crate::search::{SearchFilter, SearchResult, SearchIndexState};
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

// Sync/Licensing activation error codes.
// IMPORTANT: These codes must remain synchronized with the ones defined in the frontend at:
// `src/utils/errorHelper.ts`

// Authentication & Licensing (1000 - 1009)
pub const ERR_TOKEN_MISSING: u32 = 1001;
pub const ERR_LICENSE_INACTIVE: u32 = 1002;

// Network & Server Connections (1010 - 1029)
pub const ERR_CLIENT_BUILD: u32 = 1011;
pub const ERR_MANIFEST_FETCH_CONNECTION: u32 = 1012;
pub const ERR_MANIFEST_SERVER_ERROR: u32 = 1013;
pub const ERR_MANIFEST_PARSE: u32 = 1014;
pub const ERR_WASM_DOWNLOAD_CONNECTION: u32 = 1015;
pub const ERR_WASM_SERVER_ERROR: u32 = 1016;
pub const ERR_WASM_READ_BODY: u32 = 1017;

// Cryptography & Integrity (1030 - 1049)
pub const ERR_INTEGRITY_FAILED: u32 = 1031;
pub const ERR_SIGNATURE_FAILED: u32 = 1032;

// Local Filesystem & Storage (1050 - 1069)
pub const ERR_DIR_CREATE: u32 = 1051;
pub const ERR_FILE_WRITE: u32 = 1052;
pub const ERR_MANIFEST_SERIALIZE: u32 = 1053;
pub const ERR_MANIFEST_WRITE: u32 = 1054;

// General/Session Errors (2000 - 2099)
pub const ERR_SOURCE_NOT_FOUND: u32 = 2001;
pub const ERR_SESSION_READ_LOCK: u32 = 2002;

// Search & Index Errors (2100 - 2199)
pub const ERR_ONNX_NOT_FOUND: u32 = 2101;
pub const ERR_EMBEDDER_CREATION: u32 = 2102;
pub const ERR_EMBEDDINGS_GENERATION: u32 = 2103;
pub const ERR_INDEX_REBUILD_FAILED: u32 = 2104;

// File Preview & Permissions (2200 - 2299)
pub const ERR_FILE_TOO_LARGE: u32 = 2201;
pub const ERR_BINARY_FILE_PREVIEW: u32 = 2202;
pub const ERR_PERMISSION_DENIED: u32 = 2203;
pub const ERR_EXTERNAL_CONFIRMATION_REQUIRED: u32 = 2204;
pub const ERR_METADATA_READ: u32 = 2205;
pub const ERR_FILE_READ_FAILED: u32 = 2206;
pub const ERR_EXTERNAL_OPEN_FAILED: u32 = 2207;

// Group Management Errors (2300 - 2399)
pub const ERR_GROUP_LOCK: u32 = 2301;
pub const ERR_GROUP_DB_ERROR: u32 = 2302;

// Auth Server Errors (2400 - 2499)
pub const ERR_AUTH_SERVER_START: u32 = 2401;

// Generic Fallback (2999)
pub const ERR_GENERIC: u32 = 2999;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorPayload {
    pub code: u32,
    pub status: Option<u16>,
    pub message: Option<String>,
}

impl AppErrorPayload {
    pub fn new(code: u32) -> Self {
        Self { code, status: None, message: None }
    }

    pub fn with_status(code: u32, status: u16) -> Self {
        Self { code, status: Some(status), message: None }
    }

    pub fn with_msg(code: u32, msg: impl Into<String>) -> Self {
        Self { code, status: None, message: Some(msg.into()) }
    }

    pub fn with_all(code: u32, status: u16, msg: impl Into<String>) -> Self {
        Self { code, status: Some(status), message: Some(msg.into()) }
    }
}

impl std::fmt::Display for AppErrorPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "AppError Code: {}, Msg: {:?}", self.code, self.message)
    }
}

impl std::error::Error for AppErrorPayload {}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceMetadata {
    pub id: String,
    pub display_name: String,
    pub is_available: bool,
    pub is_app_installed: bool,
    pub product_url: Option<String>,
}

#[tauri::command]
pub fn get_sources() -> Vec<SourceMetadata> {
    let sources = get_sources_list();
    sources
        .iter()
        .map(|s| SourceMetadata {
            id: s.id().to_string(),
            display_name: s.display_name().to_string(),
            is_available: s.is_available(),
            is_app_installed: s.is_app_installed(),
            product_url: s.product_url(),
        })
        .collect()
}

#[tauri::command]
pub async fn get_all_sessions<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<Vec<Session>, AppErrorPayload> {
    let state = app_handle.state::<SearchIndexState>();

    // Copy the lightweight sessions out from under the read lock, then release it before doing
    // any filesystem work. resolve_workspace_name walks the filesystem and resolve_session_status
    // reads plan/task files, per session — holding the read lock across that I/O would block the
    // rebuild writer (and every other reader) for the whole scan on every load.
    let mut all_sessions: Vec<Session> = {
        let guard = state.sessions.read().map_err(|e| AppErrorPayload::with_msg(ERR_SESSION_READ_LOCK, e.to_string()))?;
        guard.values().map(|s| s.to_lightweight()).collect()
    };

    for session in &mut all_sessions {
        if session.workspace_name.is_none() && session.cwd.is_some() {
            session.workspace_name = crate::models::resolve_workspace_name(&session.cwd);
        }
        if session.status.is_none() {
            session.status = crate::models::resolve_session_status(&session.source_id, &session.id, &session.turns, &session.cwd);
        }
    }

    // Clean orphaned sessions from groups
    let all_valid_ids: std::collections::HashSet<String> = all_sessions.iter().map(|s| s.id.clone()).collect();
    let state_groups = app_handle.state::<crate::groups::GroupState>();
    if let Ok(_lock) = state_groups.lock.lock() {
        let _ = crate::groups::clean_orphaned_sessions(&all_valid_ids);
    }

    // Sort sessions by updated_at descending
    all_sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(all_sessions)
}

#[tauri::command]
pub async fn get_session<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    source_id: String,
    file_path: String,
) -> Result<Option<Session>, AppErrorPayload> {
    let start_time = std::time::Instant::now();
    crate::log_info!("[IPC] get_session: Started for source_id='{}', file_path='{}'", source_id, file_path);

    let state = app_handle.state::<SearchIndexState>();
    let in_memory_cached = {
        let guard = state.sessions.read().map_err(|e| AppErrorPayload::with_msg(ERR_SESSION_READ_LOCK, e.to_string()))?;
        guard.values().find(|s| s.source_id == source_id && s.file_path == file_path).cloned()
    };

    if let Some(mut session) = in_memory_cached {
        if session.workspace_name.is_none() && session.cwd.is_some() {
            session.workspace_name = crate::models::resolve_workspace_name(&session.cwd);
        }
        if session.status.is_none() {
            session.status = crate::models::resolve_session_status(&session.source_id, &session.id, &session.turns, &session.cwd);
        }
        let elapsed = start_time.elapsed();
        crate::log_info!(
            "[IPC] get_session: Completed in {:?} (loaded from SearchIndexState cache, turns: {})",
            elapsed,
            session.turns.len()
        );
        return Ok(Some(session));
    }

    // Not found in in-memory SearchIndexState. Fall back to parsing the file (which uses CacheManager cache checks internally)
    crate::log_info!("[IPC] get_session: Cache miss in SearchIndexState. Falling back to parsing file...");
    let sources = get_sources_list();
    let source = sources.iter().find(|s| s.id() == source_id);
    match source {
        Some(s) => {
            let session_opt = s.parse_session(&file_path).await;
            let elapsed = start_time.elapsed();
            match &session_opt {
                Some(session) => {
                    crate::log_info!(
                        "[IPC] get_session: Completed in {:?} (parsed via source adapter, turns: {})",
                        elapsed,
                        session.turns.len()
                    );
                }
                None => {
                    crate::log_info!("[IPC] get_session: Completed in {:?} (failed to parse file)", elapsed);
                }
            }
            Ok(session_opt.map(|mut session| {
                if session.workspace_name.is_none() && session.cwd.is_some() {
                    session.workspace_name = crate::models::resolve_workspace_name(&session.cwd);
                }
                if session.status.is_none() {
                    session.status = crate::models::resolve_session_status(&session.source_id, &session.id, &session.turns, &session.cwd);
                }
                session
            }))
        }
        None => {
            let elapsed = start_time.elapsed();
            crate::log_error!("[IPC] get_session: Completed with error in {:?}: Source adapter '{}' not found", elapsed, source_id);
            Err(AppErrorPayload::with_msg(ERR_SOURCE_NOT_FOUND, source_id))
        }
    }
}

#[tauri::command]
pub fn delete_source_data(source_id: String) -> Result<bool, AppErrorPayload> {
    let sources = get_sources_list();
    let source = sources.iter().find(|s| s.id() == source_id);
    match source {
        Some(s) => Ok(s.delete_data_paths()),
        None => Err(AppErrorPayload::with_msg(ERR_SOURCE_NOT_FOUND, source_id)),
    }
}

#[tauri::command]
pub fn get_credential(key: String) -> Option<String> {
    keyring::get_secret(&key)
}

#[tauri::command]
pub fn save_credential(key: String, value: Option<String>) {
    keyring::put_secret(&key, value.as_deref());
}

#[tauri::command]
pub fn is_keyring_disabled() -> bool {
    keyring::is_keyring_disabled()
}

#[tauri::command]
pub fn set_keyring_disabled(disabled: bool) {
    keyring::set_keyring_disabled(disabled);
}

#[tauri::command]
pub fn is_premium_active() -> bool {
    crate::premium::is_premium_active()
}

#[tauri::command]
pub async fn search_sessions<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    query: String,
    filter: SearchFilter,
    use_semantic: bool,
    similarity_threshold: Option<f64>,
) -> Result<Vec<SearchResult>, AppErrorPayload> {
    let state = app_handle.state::<SearchIndexState>();

    // First semantic search lazily builds the index, which needs the write lock — do it before
    // taking any read guard below.
    if use_semantic && !state.is_semantic_initialized.load(std::sync::atomic::Ordering::SeqCst) {
        state.is_semantic_initialized.store(true, std::sync::atomic::Ordering::SeqCst);
        state.rebuild(true, Some(app_handle.clone())).await
            .map_err(|e| AppErrorPayload::with_msg(ERR_INDEX_REBUILD_FAILED, e))?;
    }

    let mut results = if use_semantic {
        let (model_path, vocab_path) = crate::search::resolve_model_paths(Some(&app_handle));

        if !model_path.exists() || !vocab_path.exists() {
            return Err(AppErrorPayload::new(ERR_ONNX_NOT_FOUND));
        }
        let onnx_embedder = state.get_or_load_embedder(&model_path, &vocab_path)
            .map_err(|e| AppErrorPayload::with_msg(ERR_EMBEDDER_CREATION, e))?;
        // Embed the query before taking the read guards so the locks are held only for the scan.
        let query_vector = onnx_embedder.get_embeddings(&query)
            .map_err(|e| AppErrorPayload::with_msg(ERR_EMBEDDINGS_GENERATION, e.to_string()))?;
        let threshold = similarity_threshold.unwrap_or(0.35) as f32;

        // Search over the live index by reference — no full-corpus clone. Only matched sessions
        // are cloned inside semantic_search.
        let sessions_guard = state.sessions.read().map_err(|e| AppErrorPayload::with_msg(ERR_SESSION_READ_LOCK, e.to_string()))?;
        let embeddings_guard = state.embeddings.read().map_err(|e| AppErrorPayload::with_msg(ERR_SESSION_READ_LOCK, e.to_string()))?;
        crate::search::semantic::semantic_search(
            sessions_guard.values(),
            &embeddings_guard,
            &query_vector,
            threshold,
            &filter,
        )
    } else {
        let sessions_guard = state.sessions.read().map_err(|e| AppErrorPayload::with_msg(ERR_SESSION_READ_LOCK, e.to_string()))?;
        crate::search::lexical::lexical_search(sessions_guard.values(), &query, &filter)
    };

    for res in &mut results {
        res.session = res.session.to_lightweight();
    }
    Ok(results)
}

#[tauri::command]
pub async fn rebuild_index<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    bypass_cache: Option<bool>,
    is_startup: Option<bool>,
) -> Result<(), AppErrorPayload> {
    let state = app_handle.state::<SearchIndexState>();

    if is_startup == Some(true) && state.has_rebuilt.load(std::sync::atomic::Ordering::SeqCst) {
        crate::log_info!("[IPC] rebuild_index: Startup rebuild skipped since we already rebuilt.");
        return Ok(());
    }

    if bypass_cache == Some(true) {
        crate::log_info!("[IPC] rebuild_index: Bypassing and clearing cache!");
        crate::parsers::cache::get_cache_manager().clear_all_caches();

        // Also clear embedding cache
        let cache_mgr = crate::search::cache::EmbeddingCacheManager::new("all-MiniLM-L6-v2");
        cache_mgr.delete_cache_file();

        let mut embs_guard = state.embeddings.write();
        if let Ok(ref mut guard) = embs_guard {
            guard.clear();
        }
    }
    state.rebuild(true, Some(app_handle.clone())).await
        .map_err(|e| AppErrorPayload::with_msg(ERR_INDEX_REBUILD_FAILED, e))
}

#[tauri::command]
pub fn log_from_frontend(level: String, message: String) {
    let formatted = format!("[FE-{}] {}", level.to_uppercase(), message);
    if level == "error" {
        crate::log_error!("{}", formatted);
    } else if level == "warn" {
        crate::log_warn!("{}", formatted);
    } else if level == "debug" {
        crate::log_debug!("{}", formatted);
    } else if level == "trace" {
        crate::log_trace!("{}", formatted);
    } else {
        crate::log_info!("{}", formatted);
    }
}

#[tauri::command]
pub fn check_reset_window() -> bool {
    std::env::args().any(|arg| arg == "--reset-window" || arg == "--reset")
}

#[tauri::command]
pub fn get_indexing_progress<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> Result<Option<crate::search::IndexingProgress>, String> {
    let state = app_handle.state::<crate::search::SearchIndexState>();
    let guard = state.last_progress.read().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn is_updater_active<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> bool {
    let config = app_handle.config();
    if let Some(updater_config) = config.plugins.0.get("updater") {
        let active = updater_config.get("active").and_then(|v| v.as_bool()).unwrap_or(false);
        if active {
            let pubkey = updater_config.get("pubkey").and_then(|v| v.as_str()).unwrap_or("");
            let mut endpoints = Vec::new();
            if let Some(endpoints_val) = updater_config.get("endpoints") {
                if let Some(arr) = endpoints_val.as_array() {
                    for val in arr {
                        if let Some(s) = val.as_str() {
                            endpoints.push(s.to_string());
                        }
                    }
                }
            }
            crate::validate_updater_config(pubkey, &endpoints)
        } else {
            false
        }
    } else {
        false
    }
}

#[tauri::command]
pub fn get_resolved_updater_endpoints<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Vec<String> {
    let config = app_handle.config();
    let current_version = config.version.clone().unwrap_or_else(|| "0.1.0".to_string());
    
    // Resolve target and arch
    let target = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };

    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86"
    };

    if let Some(updater_config) = config.plugins.0.get("updater") {
        if let Some(endpoints) = updater_config.get("endpoints") {
            if let Some(arr) = endpoints.as_array() {
                return arr.iter()
                    .filter_map(|val| val.as_str())
                    .map(|s| {
                        s.replace("{{current_version}}", &current_version)
                         .replace("{{target}}", target)
                         .replace("{{arch}}", arch)
                    })
                    .collect();
            }
        }
    }
    Vec::new()
}

use crate::parsers::resolver::{resolve_local_file_link, LocalFileResolution};
use crate::parsers::permissions;

/// Validates a candidate trusted root before it is allowed to suppress the confirmation prompt.
///
/// `session_cwd` arrives over IPC, and the frontend in turn read it out of a parsed transcript
/// (see the `cwd` field handled in `parsers::claude`). A transcript declaring `"cwd": "/"` would
/// otherwise mark every file on the machine as trusted. Anything at or above the home directory
/// is rejected, which also covers `/`, `/Users`, `/home`, and `C:\`.
fn resolve_trusted_root(session_cwd: Option<&str>) -> Option<PathBuf> {
    let cwd = session_cwd?.trim();
    if cwd.is_empty() {
        return None;
    }

    let canonical = Path::new(cwd).canonicalize().ok()?;
    if !canonical.is_dir() {
        return None;
    }

    if canonical.parent().is_none() {
        crate::log_warn!("Refusing filesystem root as a trusted root: {:?}", canonical);
        return None;
    }

    if let Ok(home) = crate::parsers::get_home_dir().canonicalize() {
        if home.starts_with(&canonical) {
            crate::log_warn!(
                "Refusing trusted root at or above the home directory: {:?}",
                canonical
            );
            return None;
        }
    }

    Some(canonical)
}

/// Extensions the OS launches rather than displays.
///
/// Checked on every platform, not just the host: a repository is authored elsewhere and a
/// `.exe` sitting in a checkout is still a `.exe` when the file is handed to the shell.
const EXECUTABLE_EXTENSIONS: &[&str] = &[
    // Windows
    "bat", "cmd", "com", "cpl", "exe", "hta", "js", "jse", "lnk", "msc", "msi", "msp", "pif",
    "ps1", "reg", "scr", "vb", "vbe", "vbs", "wsf", "wsh",
    // macOS
    "app", "command", "dmg", "pkg", "scpt", "scptd", "terminal", "workflow",
    // Unix
    "appimage", "bash", "csh", "desktop", "fish", "ksh", "out", "run", "sh", "zsh",
    // Cross-platform runtimes
    "jar",
];

fn is_executable_target(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let lower = ext.to_lowercase();
        if EXECUTABLE_EXTENSIONS.iter().any(|known| *known == lower) {
            return true;
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = path.metadata() {
            if metadata.permissions().mode() & 0o111 != 0 {
                return true;
            }
        }
    }

    false
}

/// Returns the path only if the user has already consented to launching it.
///
/// The `Confirmation required:` prefix is load-bearing: `FileViewerDialog` matches on it to
/// decide whether to raise its prompt or surface a plain error.
fn require_external_open_permission(path: PathBuf, reason: &str) -> Result<PathBuf, AppErrorPayload> {
    let path_str = path.to_string_lossy().to_string();
    match permissions::check_permission(&path_str, "external_open").as_deref() {
        Some("allow") => Ok(path),
        Some("deny") => Err(AppErrorPayload::new(ERR_PERMISSION_DENIED)),
        _ => Err(AppErrorPayload::with_msg(ERR_EXTERNAL_CONFIRMATION_REQUIRED, reason)),
    }
}

#[derive(serde::Serialize)]
pub struct FileReadResponse {
    status: String, // "allowed" | "confirmation_required" | "denied" | "rejected"
    content: Option<String>,
    #[serde(rename = "canonicalPath")]
    canonical_path: Option<String>,
    reason: Option<String>,
}

#[tauri::command]
pub fn resolve_and_read_file(
    raw_path: String,
    session_cwd: Option<String>,
) -> Result<FileReadResponse, AppErrorPayload> {
    let base_dir = session_cwd.as_deref().map(Path::new);
    let trusted_root = resolve_trusted_root(session_cwd.as_deref());

    let resolution = resolve_local_file_link(&raw_path, base_dir, trusted_root.as_deref());

    match resolution {
        LocalFileResolution::Allowed(path) => {
            read_resolved_file(path)
        }
        LocalFileResolution::ConfirmationRequired(path, reason) => {
            let path_str = path.to_string_lossy().to_string();
            match permissions::check_permission(&path_str, "preview") {
                Some(ref dec) if dec == "allow" => read_resolved_file(path),
                Some(ref dec) if dec == "deny" => Err(AppErrorPayload::new(ERR_PERMISSION_DENIED)),
                _ => Ok(FileReadResponse {
                    status: "confirmation_required".to_string(),
                    content: None,
                    canonical_path: Some(path_str),
                    reason: Some(reason),
                }),
            }
        }
        LocalFileResolution::Rejected(reason) => {
            Err(AppErrorPayload::with_msg(ERR_PERMISSION_DENIED, reason))
        }
    }
}

fn read_resolved_file(path: std::path::PathBuf) -> Result<FileReadResponse, AppErrorPayload> {
    let metadata = std::fs::metadata(&path).map_err(|e| AppErrorPayload::with_msg(ERR_METADATA_READ, e.to_string()))?;
    if metadata.len() > 5_242_881 {
        return Err(AppErrorPayload::new(ERR_FILE_TOO_LARGE));
    }
    let bytes = std::fs::read(&path).map_err(|e| AppErrorPayload::with_msg(ERR_FILE_READ_FAILED, e.to_string()))?;
    
    // Check if the file contains null bytes (binary indicator)
    if bytes.contains(&0) {
        return Err(AppErrorPayload::new(ERR_BINARY_FILE_PREVIEW));
    }

    let content = String::from_utf8_lossy(&bytes).into_owned();
    Ok(FileReadResponse {
        status: "allowed".to_string(),
        content: Some(content),
        canonical_path: Some(path.to_string_lossy().to_string()),
        reason: None,
    })
}

#[tauri::command]
pub fn save_file_permission(canonical_path: String, action: String, decision: String) {
    permissions::add_permission(&canonical_path, &action, &decision);
}

#[tauri::command]
pub fn get_all_permissions() -> Vec<permissions::PermissionEntry> {
    permissions::load_permissions()
}

#[tauri::command]
pub fn delete_permission(canonical_path: String, action: Option<String>) {
    permissions::delete_permission(&canonical_path, action.as_deref());
}

#[tauri::command]
pub fn clear_all_permissions() {
    permissions::clear_all_permissions();
}

#[tauri::command]
pub fn open_file_externally<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    raw_path: String,
    session_cwd: Option<String>,
) -> Result<(), AppErrorPayload> {
    let base_dir = session_cwd.as_deref().map(Path::new);
    let trusted_root = resolve_trusted_root(session_cwd.as_deref());

    let resolution = resolve_local_file_link(&raw_path, base_dir, trusted_root.as_deref());

    let path = match resolution {
        // Living inside the trusted root is not enough to launch a file the OS would execute.
        // A workspace is full of files whose names and contents originated elsewhere — a cloned
        // repo, a build artifact — so these always fall through to explicit consent.
        LocalFileResolution::Allowed(path) if is_executable_target(&path) => {
            require_external_open_permission(
                path,
                "This file can be executed by the operating system.",
            )?
        }
        LocalFileResolution::Allowed(path) => path,
        LocalFileResolution::ConfirmationRequired(path, reason) => {
            require_external_open_permission(path, &reason)?
        }
        LocalFileResolution::Rejected(reason) => return Err(AppErrorPayload::with_msg(ERR_PERMISSION_DENIED, reason)),
    };

    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppErrorPayload::with_msg(ERR_EXTERNAL_OPEN_FAILED, e.to_string()))
}

#[tauri::command]
pub fn start_local_auth_server<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<u16, AppErrorPayload> {
    crate::premium::loopback::start_server(app_handle)
        .map_err(|e| AppErrorPayload::with_msg(ERR_AUTH_SERVER_START, e))
}

#[tauri::command]
pub fn stop_local_auth_server() {
    crate::premium::loopback::stop_server();
}

#[tauri::command]
pub fn get_source_decisions() -> HashMap<String, String> {
    crate::parsers::source_decisions::load_source_decisions()
}

#[tauri::command]
pub fn save_source_decision<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    source_id: String,
    decision: String,
) -> Result<(), String> {
    crate::parsers::source_decisions::save_source_decision(&source_id, &decision);
    
    let state = app_handle.state::<crate::watcher::WatcherState>();
    if let Ok(mut detected) = state.detected_sources.lock() {
        detected.remove(&source_id);
    }
    
    // Restart/reconfigure the watcher based on the new decision
    if let Err(e) = crate::watcher::start_watcher(app_handle) {
        crate::log_error!("Failed to restart watcher after source decision change: {}", e);
    }
    
    Ok(())
}

#[tauri::command]
pub fn reset_detected_sources<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> Result<(), String> {
    let state = app_handle.state::<crate::watcher::WatcherState>();
    if let Ok(mut detected) = state.detected_sources.lock() {
        detected.clear();
    }
    
    crate::watcher::check_and_restore_watched_paths(&app_handle);
    
    Ok(())
}

#[tauri::command]
pub fn get_groups(state: tauri::State<'_, crate::groups::GroupState>) -> Result<Vec<crate::groups::ConversationGroup>, AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    Ok(crate::groups::get_groups())
}

#[tauri::command]
pub fn add_group(state: tauri::State<'_, crate::groups::GroupState>, name: String) -> Result<bool, AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    crate::groups::add_group(&name).map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_DB_ERROR, e))
}

#[tauri::command]
pub fn delete_group(state: tauri::State<'_, crate::groups::GroupState>, name: String) -> Result<(), AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    crate::groups::delete_group(&name).map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_DB_ERROR, e))
}

#[tauri::command]
pub fn rename_group(state: tauri::State<'_, crate::groups::GroupState>, old_name: String, new_name: String) -> Result<bool, AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    crate::groups::rename_group(&old_name, &new_name).map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_DB_ERROR, e))
}

#[tauri::command]
pub fn assign_session_to_group(state: tauri::State<'_, crate::groups::GroupState>, session_id: String, group_name: String) -> Result<(), AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    crate::groups::assign_session_to_group(&session_id, &group_name).map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_DB_ERROR, e))
}

#[tauri::command]
pub fn remove_session_from_group(state: tauri::State<'_, crate::groups::GroupState>, session_id: String, group_name: String) -> Result<(), AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    crate::groups::remove_session_from_group(&session_id, &group_name).map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_DB_ERROR, e))
}

#[tauri::command]
pub fn set_group_pinned(state: tauri::State<'_, crate::groups::GroupState>, name: String, pinned: bool) -> Result<(), AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    crate::groups::set_group_pinned(&name, pinned).map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_DB_ERROR, e))
}

#[tauri::command]
pub fn update_group_details(
    state: tauri::State<'_, crate::groups::GroupState>,
    name: String,
    description: String,
    status: String,
    past_work_summary: String,
    tasks: Vec<crate::groups::GroupTask>,
) -> Result<(), AppErrorPayload> {
    let _lock = state.lock.lock().map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_LOCK, e.to_string()))?;
    crate::groups::update_group_details(&name, &description, &status, &past_work_summary, tasks)
        .map_err(|e| AppErrorPayload::with_msg(ERR_GROUP_DB_ERROR, e))
}

#[tauri::command]
pub fn get_pinned_sessions() -> Vec<String> {
    crate::keyring::get_pinned_sessions()
}

#[tauri::command]
pub fn save_pinned_sessions(ids: Vec<String>) {
    crate::keyring::save_pinned_sessions(&ids);
}

#[tauri::command]
pub fn save_theme_settings(appearance: String, dark_theme: String, light_theme: String) {
    crate::keyring::save_theme_settings(&appearance, &dark_theme, &light_theme);
}

#[tauri::command]
pub fn save_custom_theme_bg(mode: String, h: i32, s: i32, l: i32) {
    crate::keyring::save_custom_theme_bg(&mode, h, s, l);
}


#[tauri::command]
pub fn get_backend_base_url<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> String {
    get_backend_base_url_internal(&app_handle)
}

pub(crate) fn get_backend_base_url_internal<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) -> String {
    let url_opt = app_handle.config().plugins.0.get("updater")
        .and_then(|u| u.get("endpoints"))
        .and_then(|e| e.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .and_then(|s| url::Url::parse(s).ok());

    if let Some(parsed) = url_opt {
        if let Some(host) = parsed.host_str() {
            let scheme = parsed.scheme();
            return match parsed.port() {
                Some(port) => format!("{}://{}:{}", scheme, host, port),
                None => format!("{}://{}", scheme, host),
            };
        }
    }
    "https://codeoba.com".to_string()
}

#[tauri::command]
pub fn save_language_setting<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, lang: String) -> Result<(), String> {
    let mut config = crate::keyring::load_fallback_config();
    config.insert("language".to_string(), lang.clone());
    crate::keyring::save_fallback_config(&config);

    // Rebuild the menu bar in real-time
    if let Err(e) = crate::menu::setup_menu_internal(&app_handle, &lang) {
        return Err(format!("Failed to rebuild menu: {}", e));
    }
    Ok(())
}

#[tauri::command]
pub fn get_language_override() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|r| r == "--lang")
        .and_then(|idx| args.get(idx + 1).cloned())
}

#[cfg(test)]
mod trusted_root_tests {
    use super::*;

    /// A transcript controls `cwd`, so these rejections are the boundary that stops a
    /// hostile transcript from marking the whole filesystem as trusted.
    #[test]
    fn rejects_roots_at_or_above_home() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home/user");
        std::fs::create_dir_all(&home).unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", home.to_string_lossy().to_string());

        let repo = home.join("projects/repo");
        std::fs::create_dir_all(&repo).unwrap();

        assert!(resolve_trusted_root(None).is_none());
        assert!(resolve_trusted_root(Some("")).is_none());
        assert!(resolve_trusted_root(Some("   ")).is_none());

        // Filesystem root.
        assert!(resolve_trusted_root(Some("/")).is_none(), "filesystem root must be refused");

        // The home directory itself, and an ancestor of it.
        assert!(
            resolve_trusted_root(Some(&home.to_string_lossy())).is_none(),
            "home directory must be refused"
        );
        assert!(
            resolve_trusted_root(Some(&temp.path().join("home").to_string_lossy())).is_none(),
            "ancestor of home must be refused"
        );

        // A path that does not exist, and a path that is a file rather than a directory.
        assert!(resolve_trusted_root(Some(&repo.join("nope").to_string_lossy())).is_none());
        let file = repo.join("README.md");
        std::fs::write(&file, "hi").unwrap();
        assert!(resolve_trusted_root(Some(&file.to_string_lossy())).is_none());

        // An ordinary workspace is accepted.
        assert_eq!(
            resolve_trusted_root(Some(&repo.to_string_lossy())),
            Some(repo.canonicalize().unwrap())
        );

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    #[test]
    fn flags_launchable_files() {
        let temp = tempfile::tempdir().unwrap();

        for name in ["setup.exe", "Payload.APP", "run.Sh", "installer.msi", "a.jar"] {
            let p = temp.path().join(name);
            std::fs::write(&p, "x").unwrap();
            assert!(is_executable_target(&p), "{} should be treated as launchable", name);
        }

        for name in ["README.md", "notes.txt", "data.json", "image.png"] {
            let p = temp.path().join(name);
            std::fs::write(&p, "x").unwrap();
            assert!(!is_executable_target(&p), "{} should not be launchable", name);
        }
    }

    #[cfg(unix)]
    #[test]
    fn flags_extensionless_files_carrying_the_exec_bit() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();

        let plain = temp.path().join("Makefile");
        std::fs::write(&plain, "all:").unwrap();
        assert!(!is_executable_target(&plain));

        let script = temp.path().join("gradlew");
        std::fs::write(&script, "#!/bin/sh").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(is_executable_target(&script));
    }
}

#[cfg(test)]
mod get_all_sessions_tests {
    use super::*;
    use tauri::Manager;
    use crate::groups::GroupState;
    use crate::models::Turn;

    fn codex_session(id: &str, updated_at: i64) -> Session {
        Session {
            id: id.to_string(),
            source_id: "codex".to_string(),
            file_path: format!("/tmp/{id}.jsonl"),
            timestamp: 0,
            updated_at,
            cwd: None,
            thread_name: Some("t".to_string()),
            turns: vec![Turn {
                turn_id: format!("{id}_0"),
                user_message: "hi".to_string(),
                assistant_message: "yo".to_string(),
                timestamp: 0,
                input_tokens: None,
                output_tokens: None,
                extra_data: std::collections::HashMap::new(),
            }],
            is_archived: false,
            is_pinned: false,
            summary: None,
            snippet: None,
            workspace_name: None,
            status: None,
            is_deleted: false,
        }
    }

    /// Guards the lock-scope reorder: enrichment (status/workspace) must still run after the
    /// read lock is released, and results must stay sorted by updated_at descending.
    #[test]
    fn enriches_and_sorts_after_lock_release() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());

        let app = tauri::test::mock_app();
        let handle = app.handle().clone();
        handle.manage(SearchIndexState::new());
        handle.manage(GroupState::new());

        {
            let state = handle.state::<SearchIndexState>();
            let mut guard = state.sessions.write().unwrap();
            guard.insert("a".to_string(), codex_session("a", 100));
            guard.insert("b".to_string(), codex_session("b", 200));
        }

        let result = tauri::async_runtime::block_on(get_all_sessions(handle.clone())).unwrap();

        // Newest first.
        assert_eq!(result.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), vec!["b", "a"]);
        // Status was resolved during the post-lock enrichment pass.
        assert!(result.iter().all(|s| s.status.is_some()), "status should be enriched");
        // cwd is None, so workspace_name stays None.
        assert!(result.iter().all(|s| s.workspace_name.is_none()));

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}
