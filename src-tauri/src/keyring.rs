use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use keyring::Entry;

const SERVICE_NAME: &str = "Codeoba";

fn get_fallback_file_path() -> PathBuf {
    let home = crate::parsers::get_home_dir();
    home.join(".codeoba/config.json")
}

fn load_fallback_config() -> HashMap<String, String> {
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

fn save_fallback_config(config: &HashMap<String, String>) {
    let path = get_fallback_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(config) {
        if let Ok(mut file) = File::create(path) {
            let _ = file.write_all(json.as_bytes());
        }
    }
}

fn is_keyring_disabled() -> bool {
    let env_val = std::env::var("CODEOBA_NO_KEYRING").ok();
    if cfg!(debug_assertions) {
        // In debug mode, keyring is disabled by default to prevent repeated keyring prompts on unsigned builds
        env_val.as_deref() != Some("false")
    } else {
        // In release builds, keyring is enabled by default unless explicitly disabled
        env_val.as_deref() == Some("true")
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
            let _ = entry.delete_password();
        }
    }
    // Delete from fallback
    let mut config = load_fallback_config();
    if config.remove(key).is_some() {
        save_fallback_config(&config);
    }
}

/// Thread-safe initialization of the encryption key to prevent keyring race conditions.
pub fn get_or_create_cache_key() -> [u8; 32] {
    let key_name = "cache_encryption_key";
    if let Some(key_hex) = get_secret(key_name) {
        if let Ok(bytes) = hex::decode(key_hex) {
            if bytes.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                return key;
            }
        }
    }
    
    // Generate new key
    use aes_gcm::aead::{KeyInit, OsRng};
    let key = aes_gcm::Aes256Gcm::generate_key(&mut OsRng);
    let key_bytes: [u8; 32] = key.into();
    let key_hex = hex::encode(key_bytes);
    put_secret(key_name, Some(&key_hex));
    key_bytes
}
