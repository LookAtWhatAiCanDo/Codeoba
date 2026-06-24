use crate::models::Session;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::OnceLock;
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng, AeadCore},
    Aes256Gcm, Nonce,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub file_path: String,
    pub last_modified: i64,
    pub size: i64,
    pub hash: String,
    pub session: Session,
}

const CURRENT_CACHE_VERSION: &str = "v1";

fn default_cache_version() -> String {
    "v0".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SourceCache {
    #[serde(default = "default_cache_version")]
    pub version: String,
    pub entries: Vec<CacheEntry>,
}

pub struct SessionCacheManager {
    // source_id -> (file_path -> CacheEntry)
    active_caches: Mutex<HashMap<String, HashMap<String, CacheEntry>>>,
    // source_id -> seen file_paths
    seen_paths: Mutex<HashMap<String, HashSet<String>>>,
}

static CACHE_MANAGER: OnceLock<SessionCacheManager> = OnceLock::new();

pub fn get_cache_manager() -> &'static SessionCacheManager {
    CACHE_MANAGER.get_or_init(|| SessionCacheManager {
        active_caches: Mutex::new(HashMap::new()),
        seen_paths: Mutex::new(HashMap::new()),
    })
}

fn get_or_create_cache_key() -> [u8; 32] {
    let key_name = "cache_encryption_key";
    if let Some(key_hex) = crate::keyring::get_secret(key_name) {
        if let Ok(bytes) = hex::decode(key_hex) {
            if bytes.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                return key;
            }
        }
    }
    let key = Aes256Gcm::generate_key(&mut OsRng);
    let key_bytes: [u8; 32] = key.into();
    let key_hex = hex::encode(key_bytes);
    crate::keyring::put_secret(key_name, Some(&key_hex));
    key_bytes
}

impl SessionCacheManager {
    fn get_cache_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        let dir = home.join(".codeoba/cache");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn get_cache_file(&self, source_id: &str) -> PathBuf {
        self.get_cache_dir().join(format!("cache_{}.json", source_id))
    }

    fn load_cache(&self, source_id: &str) -> HashMap<String, CacheEntry> {
        let path = self.get_cache_file(source_id);
        if !path.exists() {
            return HashMap::new();
        }
        let mut file = match fs::File::open(&path) {
            Ok(f) => f,
            Err(_) => return HashMap::new(),
        };
        let mut encrypted_data = Vec::new();
        use std::io::Read;
        if file.read_to_end(&mut encrypted_data).is_err() {
            return HashMap::new();
        }

        if encrypted_data.len() < 12 {
            if let Ok(plaintext_str) = String::from_utf8(encrypted_data) {
                if let Ok(source_cache) = serde_json::from_str::<SourceCache>(&plaintext_str) {
                    if source_cache.version == CURRENT_CACHE_VERSION {
                        return source_cache
                            .entries
                            .into_iter()
                            .map(|e| (e.file_path.clone(), e))
                            .collect();
                    }
                }
            }
            return HashMap::new();
        }

        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        let key_bytes = get_or_create_cache_key();
        let cipher = Aes256Gcm::new(&key_bytes.into());
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = match cipher.decrypt(nonce, ciphertext) {
            Ok(p) => p,
            Err(_) => {
                let mut fallback_data = Vec::new();
                fallback_data.extend_from_slice(nonce_bytes);
                fallback_data.extend_from_slice(ciphertext);
                if let Ok(plaintext_str) = String::from_utf8(fallback_data) {
                    if let Ok(source_cache) = serde_json::from_str::<SourceCache>(&plaintext_str) {
                        if source_cache.version == CURRENT_CACHE_VERSION {
                            return source_cache
                                .entries
                                .into_iter()
                                .map(|e| (e.file_path.clone(), e))
                                .collect();
                        }
                    }
                }
                eprintln!("Warning: Failed to decrypt session cache for '{}'. Discarding cache.", source_id);
                return HashMap::new();
            }
        };

        if let Ok(source_cache) = serde_json::from_slice::<SourceCache>(&plaintext) {
            if source_cache.version == CURRENT_CACHE_VERSION {
                return source_cache
                    .entries
                    .into_iter()
                    .map(|e| (e.file_path.clone(), e))
                    .collect();
            } else {
                eprintln!("Parser cache version mismatch for '{}': expected {}, found {}. Discarding cache.", source_id, CURRENT_CACHE_VERSION, source_cache.version);
            }
        }
        HashMap::new()
    }

    fn save_cache(&self, source_id: &str, entries: Vec<CacheEntry>) {
        let path = self.get_cache_file(source_id);
        let cache = SourceCache {
            version: CURRENT_CACHE_VERSION.to_string(),
            entries,
        };
        let plaintext_json = match serde_json::to_vec(&cache) {
            Ok(json) => json,
            Err(_) => return,
        };

        let key_bytes = get_or_create_cache_key();
        let cipher = Aes256Gcm::new(&key_bytes.into());
        let nonce_bytes = Aes256Gcm::generate_nonce(&mut OsRng);

        let ciphertext = match cipher.encrypt(&nonce_bytes, plaintext_json.as_ref()) {
            Ok(c) => c,
            Err(_) => return,
        };

        let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);

        let _ = fs::write(path, combined);
    }

    pub fn start_scan(&self, source_id: &str) {
        let cache_map = self.load_cache(source_id);
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.insert(source_id.to_string(), cache_map);
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.insert(source_id.to_string(), HashSet::new());
        }
    }

    pub fn get_cached_session_for_file(
        &self,
        source_id: &str,
        file_path: &str,
        last_modified: i64,
        size: i64,
    ) -> Option<Session> {
        let entry = {
            let active_guard = self.active_caches.lock().ok()?;
            if let Some(map) = active_guard.get(source_id) {
                map.get(file_path).cloned()
            } else {
                let cache_map = self.load_cache(source_id);
                cache_map.get(file_path).cloned()
            }
        }?;

        if entry.last_modified == last_modified && entry.size == size {
            if let Ok(mut seen_guard) = self.seen_paths.lock() {
                if let Some(set) = seen_guard.get_mut(source_id) {
                    set.insert(file_path.to_string());
                }
            }
            return Some(entry.session);
        }
        None
    }

    pub fn get_cached_session_for_db(
        &self,
        source_id: &str,
        file_path: &str,
        hash: &str,
        size: i64,
    ) -> Option<Session> {
        let entry = {
            let active_guard = self.active_caches.lock().ok()?;
            if let Some(map) = active_guard.get(source_id) {
                map.get(file_path).cloned()
            } else {
                let cache_map = self.load_cache(source_id);
                cache_map.get(file_path).cloned()
            }
        }?;

        if entry.hash == hash && entry.size == size {
            if let Ok(mut seen_guard) = self.seen_paths.lock() {
                if let Some(set) = seen_guard.get_mut(source_id) {
                    set.insert(file_path.to_string());
                }
            }
            return Some(entry.session);
        }
        None
    }

    pub fn put_cached_session(
        &self,
        source_id: &str,
        file_path: &str,
        last_modified: i64,
        size: i64,
        hash: &str,
        session: Session,
    ) {
        let entry = CacheEntry {
            file_path: file_path.to_string(),
            last_modified,
            size,
            hash: hash.to_string(),
            session,
        };
        let mut loaded_and_saved = false;
        if let Ok(mut active_guard) = self.active_caches.lock() {
            if let Some(map) = active_guard.get_mut(source_id) {
                map.insert(file_path.to_string(), entry.clone());
                loaded_and_saved = true;
            }
        }
        if !loaded_and_saved {
            let mut cache_map = self.load_cache(source_id);
            cache_map.insert(file_path.to_string(), entry);
            self.save_cache(source_id, cache_map.into_values().collect());
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            if let Some(set) = seen_guard.get_mut(source_id) {
                set.insert(file_path.to_string());
            }
        }
    }

    pub fn end_scan(&self, source_id: &str) {
        let entries_to_save = {
            let mut active_guard = match self.active_caches.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let seen_guard = match self.seen_paths.lock() {
                Ok(g) => g,
                Err(_) => return,
            };

            let cache_map = match active_guard.get_mut(source_id) {
                Some(m) => m,
                None => return,
            };
            let seen = match seen_guard.get(source_id) {
                Some(s) => s,
                None => return,
            };

            // Remove orphans
            let keys_to_remove: Vec<String> = cache_map
                .keys()
                .filter(|k| !seen.contains(*k))
                .cloned()
                .collect();
            for key in keys_to_remove {
                cache_map.remove(&key);
            }

            cache_map.values().cloned().collect::<Vec<CacheEntry>>()
        };

        self.save_cache(source_id, entries_to_save);

        // Clear memory cache
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.remove(source_id);
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.remove(source_id);
        }
    }
}

pub fn calculate_file_md5<P: AsRef<Path>>(path: P) -> String {
    if let Ok(bytes) = fs::read(path) {
        let digest = md5::compute(&bytes);
        format!("{:x}", digest)
    } else {
        String::new()
    }
}
