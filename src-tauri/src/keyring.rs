use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use keyring::Entry;

const SERVICE_NAME: &str = "Codeoba";

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
    // atomic_write creates the parent directory and replaces the file via a temp-file rename, so
    // a crash mid-write can't truncate the config.
    if let Ok(json) = serde_json::to_string(config) {
        let _ = crate::fs_util::atomic_write(&path, json.as_bytes());
    }
}

pub fn is_keyring_disabled() -> bool {
    // 1. Check if premium is active. If not, keyring is disabled unconditionally for the free version.
    if !crate::premium::is_premium_active() {
        return true;
    }

    // 2. Check environment variable first
    if let Ok(val) = std::env::var("CODEOBA_NO_KEYRING") {
        if val == "true" {
            return true;
        }
    }
    
    // 3. Check local fallback config (always plaintext, never keyring)
    let path = get_fallback_file_path();
    if path.exists() {
        if let Ok(mut file) = File::open(&path) {
            let mut content = String::new();
            if file.read_to_string(&mut content).is_ok() {
                if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&content) {
                    if map.get("disable_keyring").map(|v| v == "true").unwrap_or(false) {
                        return true;
                    }
                }
            }
        }
    }

    let is_dev_mode = cfg!(debug_assertions) || 
        std::env::var("CODEOBA_APP_SIGNATURE_HASH").unwrap_or_else(|_| "DEVELOPMENT_ONLY".to_string()) == "DEVELOPMENT_ONLY";

    if is_dev_mode {
        // In development mode, keyring is disabled by default to prevent repeated keyring prompts on unsigned builds
        std::env::var("CODEOBA_NO_KEYRING").as_deref() != Ok("false")
    } else {
        // In signed production builds, keyring is enabled by default unless explicitly disabled
        false
    }
}

pub fn set_keyring_disabled(disabled: bool) {
    // If premium is inactive, do not allow toggling keyring
    if !crate::premium::is_premium_active() {
        return;
    }

    let key_name = "cache_encryption_key";
    let mut config = load_fallback_config();

    if disabled {
        // Migrating FROM Keyring TO Fallback plaintext file
        // Read key from keyring while it's still enabled
        if let Ok(entry) = Entry::new(SERVICE_NAME, key_name) {
            if let Ok(secret) = entry.get_password() {
                config.insert(key_name.to_string(), secret);
                let _ = entry.delete_credential();
            }
        }
        config.insert("disable_keyring".to_string(), "true".to_string());
    } else {
        // Migrating FROM Fallback plaintext file TO Keyring
        if let Some(secret) = config.remove(key_name) {
            if let Ok(entry) = Entry::new(SERVICE_NAME, key_name) {
                let _ = entry.set_password(&secret);
            }
        }
        config.remove("disable_keyring");
    }

    save_fallback_config(&config);

    if let Ok(mut guard) = CACHED_CACHE_KEY.lock() {
        *guard = None;
    }
}

/// Retrieves a secret value associated with the specified key.
pub fn get_secret(key: &str) -> Option<String> {
    if !is_keyring_disabled() {
        if let Ok(entry) = Entry::new(SERVICE_NAME, key) {
            if let Ok(secret) = entry.get_password() {
                return Some(secret);
            }
        }
    }
    // Fallback to local config file
    let config = load_fallback_config();
    config.get(key).cloned()
}

/// Stores a secret value associated with the specified key. If the value is None, the key is deleted.
pub fn put_secret(key: &str, value: Option<&str>) {
    if let Some(val) = value {
        if !is_keyring_disabled() {
            if let Ok(entry) = Entry::new(SERVICE_NAME, key) {
                if entry.set_password(val).is_ok() {
                    // Remove from fallback if successfully written to keyring
                    let mut config = load_fallback_config();
                    if config.remove(key).is_some() {
                        save_fallback_config(&config);
                    }
                    return;
                }
            }
        }
        // Fallback to local config file
        let mut config = load_fallback_config();
        config.insert(key.to_string(), val.to_string());
        save_fallback_config(&config);
    } else {
        delete_secret(key);
    }
}

/// Deletes a secret value associated with the specified key.
pub fn delete_secret(key: &str) {
    if !is_keyring_disabled() {
        if let Ok(entry) = Entry::new(SERVICE_NAME, key) {
            let _ = entry.delete_credential();
        }
    }
    // Delete from fallback
    let mut config = load_fallback_config();
    if config.remove(key).is_some() {
        save_fallback_config(&config);
    }
}

lazy_static::lazy_static! {
    static ref CACHED_CACHE_KEY: std::sync::Mutex<Option<[u8; 32]>> = std::sync::Mutex::new(None);
}

/// Thread-safe initialization of the encryption key to prevent keyring race conditions.
pub fn get_or_create_cache_key() -> [u8; 32] {
    if let Ok(guard) = CACHED_CACHE_KEY.lock() {
        if let Some(key) = *guard {
            return key;
        }
    }

    let key = {
        let key_name = "cache_encryption_key";
        if let Some(key_hex) = get_secret(key_name) {
            if let Ok(bytes) = hex::decode(key_hex) {
                if bytes.len() == 32 {
                    let mut key = [0u8; 32];
                    key.copy_from_slice(&bytes);
                    key
                } else {
                    generate_and_save_cache_key()
                }
            } else {
                generate_and_save_cache_key()
            }
        } else {
            generate_and_save_cache_key()
        }
    };

    if let Ok(mut guard) = CACHED_CACHE_KEY.lock() {
        *guard = Some(key);
    }
    key
}

fn generate_and_save_cache_key() -> [u8; 32] {
    let mut key_bytes = [0u8; 32];
    getrandom::fill(&mut key_bytes).expect("Failed to generate random key");
    let key_hex = hex::encode(key_bytes);
    put_secret("cache_encryption_key", Some(&key_hex));
    key_bytes
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

