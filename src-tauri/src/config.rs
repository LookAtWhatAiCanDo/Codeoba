use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

fn get_fallback_file_path() -> PathBuf {
    let home = crate::parsers::get_home_dir();
    home.join(".codeoba/config.json")
}

pub fn load_fallback_config() -> HashMap<String, String> {
    let path = get_fallback_file_path();
    if !path.exists() {
        return HashMap::new();
    }
    if let Ok(mut file) = File::open(path) {
        let mut content = String::new();
        if file.read_to_string(&mut content).is_ok() {
            if let Ok(map) = serde_json::from_str(&content) {
                return map;
            }
        }
    }
    HashMap::new()
}

pub fn save_fallback_config(config: &HashMap<String, String>) {
    let path = get_fallback_file_path();
    if let Ok(json) = serde_json::to_string(config) {
        let _ = crate::fs_util::atomic_write(&path, json.as_bytes());
    }
}

/// Retrieves a setting value associated with the specified key.
pub fn get_secret(key: &str) -> Option<String> {
    let config = load_fallback_config();
    config.get(key).cloned()
}

/// Stores a setting value associated with the specified key. If value is None, key is deleted.
pub fn put_secret(key: &str, value: Option<&str>) {
    let mut config = load_fallback_config();
    if let Some(val) = value {
        config.insert(key.to_string(), val.to_string());
    } else {
        config.remove(key);
    }
    save_fallback_config(&config);
}

/// Deletes a setting value associated with the specified key.
pub fn delete_secret(key: &str) {
    let mut config = load_fallback_config();
    if config.remove(key).is_some() {
        save_fallback_config(&config);
    }
}

pub fn get_pinned_sessions() -> Vec<String> {
    let config = load_fallback_config();
    if let Some(val) = config.get("pinned_sessions") {
        if let Ok(ids) = serde_json::from_str::<Vec<String>>(val) {
            return ids;
        }
    }
    Vec::new()
}

pub fn save_pinned_sessions(ids: &[String]) {
    let mut config = load_fallback_config();
    if let Ok(json) = serde_json::to_string(ids) {
        config.insert("pinned_sessions".to_string(), json);
        save_fallback_config(&config);
    }
}

pub fn save_theme_settings(appearance: &str, dark_theme: &str, light_theme: &str) {
    let mut config = load_fallback_config();
    config.insert("appearance".to_string(), appearance.to_string());
    config.insert("dark_theme".to_string(), dark_theme.to_string());
    config.insert("light_theme".to_string(), light_theme.to_string());
    save_fallback_config(&config);
}

pub fn save_custom_theme_bg(mode: &str, h: i32, s: i32, l: i32) {
    let mut config = load_fallback_config();
    config.insert(format!("custom_{}_bg_h", mode), h.to_string());
    config.insert(format!("custom_{}_bg_s", mode), s.to_string());
    config.insert(format!("custom_{}_bg_l", mode), l.to_string());
    save_fallback_config(&config);
}

pub fn get_index_subagents_setting() -> bool {
    let config = load_fallback_config();
    config
        .get("index_subagents")
        .map(|val| val == "true")
        .unwrap_or(false)
}

pub fn save_index_subagents_setting(enabled: bool) {
    let mut config = load_fallback_config();
    config.insert("index_subagents".to_string(), enabled.to_string());
    save_fallback_config(&config);
}
