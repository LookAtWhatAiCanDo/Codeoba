use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PermissionEntry {
    pub canonical_path: String,
    pub action: String, // "preview" or "external_open"
    pub decision: String, // "allow" or "deny"
    pub timestamp: u64,
}

fn get_permissions_file() -> PathBuf {
    let home = crate::parsers::get_home_dir();
    let dir = home.join(".codeoba");
    let _ = fs::create_dir_all(&dir);
    dir.join("permissions.json")
}

pub fn load_permissions() -> Vec<PermissionEntry> {
    let file_path = get_permissions_file();
    if !file_path.exists() {
        return Vec::new();
    }
    match fs::read_to_string(&file_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| Vec::new()),
        Err(_) => Vec::new(),
    }
}

pub fn save_permissions(entries: &[PermissionEntry]) {
    let file_path = get_permissions_file();
    if let Ok(content) = serde_json::to_string_pretty(entries) {
        if let Err(e) = crate::fs_util::atomic_write(&file_path, content.as_bytes()) {
            crate::log_error!("Failed to write permissions file: {}", e);
        }
    }
}

pub fn check_permission(canonical_path: &str, action: &str) -> Option<String> {
    let entries = load_permissions();
    entries
        .iter()
        .find(|e| e.canonical_path == canonical_path && e.action == action)
        .map(|e| e.decision.clone())
}

pub fn add_permission(canonical_path: &str, action: &str, decision: &str) {
    let mut entries = load_permissions();
    
    // Remove duplicate first
    entries.retain(|e| !(e.canonical_path == canonical_path && e.action == action));
    
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    entries.push(PermissionEntry {
        canonical_path: canonical_path.to_string(),
        action: action.to_string(),
        decision: decision.to_string(),
        timestamp: now,
    });
    
    save_permissions(&entries);
}

pub fn delete_permission(canonical_path: &str, action: Option<&str>) {
    let mut entries = load_permissions();
    if let Some(act) = action {
        entries.retain(|e| !(e.canonical_path == canonical_path && e.action == act));
    } else {
        entries.retain(|e| e.canonical_path != canonical_path);
    }
    save_permissions(&entries);
}

pub fn clear_all_permissions() {
    save_permissions(&[]);
}
