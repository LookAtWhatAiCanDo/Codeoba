use crate::models::Session;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::OnceLock;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub file_path: String,
    pub last_modified: i64,
    pub size: i64,
    pub hash: String,
    pub session: Session,
}

const CURRENT_CACHE_VERSION: &str = "v11";

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
    hit_counter: Mutex<HashMap<String, usize>>,
    miss_counter: Mutex<HashMap<String, usize>>,
}

static CACHE_MANAGER: OnceLock<SessionCacheManager> = OnceLock::new();

pub fn get_cache_manager() -> &'static SessionCacheManager {
    CACHE_MANAGER.get_or_init(|| SessionCacheManager {
        active_caches: Mutex::new(HashMap::new()),
        seen_paths: Mutex::new(HashMap::new()),
        hit_counter: Mutex::new(HashMap::new()),
        miss_counter: Mutex::new(HashMap::new()),
    })
}

fn get_or_create_cache_key() -> [u8; 32] {
    crate::keyring::get_or_create_cache_key()
}

impl SessionCacheManager {
    pub fn clear_in_memory_caches(&self) {
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.clear();
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.clear();
        }
    }

    fn is_temporary_path(&self, path_str: &str) -> bool {
        let home = crate::parsers::get_home_dir().to_string_lossy().to_string();
        if path_str.starts_with(&home) {
            return false;
        }
        let temp = std::env::temp_dir().to_string_lossy().to_string();
        path_str.starts_with(&temp)
            || path_str.starts_with("/var/folders/")
            || path_str.starts_with("/tmp/")
            || path_str.contains("/T/.tmp")
    }

    pub fn clear_all_caches(&self) {
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.clear();
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.clear();
        }
        let dir = self.get_cache_dir();
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }

    fn get_cache_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        let dir = home.join(".codeoba/cache");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn get_cache_file(&self, source_id: &str) -> PathBuf {
        self.get_cache_dir()
            .join(format!("cache_{}.json", source_id))
    }

    pub fn load_cache(&self, source_id: &str) -> HashMap<String, CacheEntry> {
        let _start = std::time::Instant::now();
        let path = self.get_cache_file(source_id);
        if !path.exists() {
            return HashMap::new();
        }
        let mut file = match fs::File::open(&path) {
            Ok(f) => f,
            Err(_) => return HashMap::new(),
        };
        let mut raw_data = Vec::new();
        use std::io::Read;
        if file.read_to_end(&mut raw_data).is_err() {
            return HashMap::new();
        }

        // 1. Try parsing directly as unencrypted JSON
        if let Ok(source_cache) = serde_json::from_slice::<SourceCache>(&raw_data) {
            if source_cache.version == CURRENT_CACHE_VERSION {
                let res: HashMap<_, _> = source_cache
                    .entries
                    .into_iter()
                    .map(|e| (e.file_path.clone(), e))
                    .collect();
                crate::log_debug!(
                    "[load_cache] Loaded unencrypted cache for '{}' in {:?}",
                    source_id,
                    _start.elapsed()
                );
                return res;
            }
        }

        // 2. If parsing fails, check if we have enough bytes for an encrypted payload (nonce prefix)
        if raw_data.len() < 12 {
            return HashMap::new();
        }

        let (nonce_bytes, ciphertext) = raw_data.split_at(12);
        let key_bytes = get_or_create_cache_key();
        let cipher = Aes256Gcm::new(&key_bytes.into());
        let nonce = nonce_bytes
            .try_into()
            .expect("GCM nonce is exactly 12 bytes");

        let plaintext = match cipher.decrypt(nonce, ciphertext) {
            Ok(p) => p,
            Err(_) => {
                let mut fallback_data = Vec::new();
                fallback_data.extend_from_slice(nonce_bytes);
                fallback_data.extend_from_slice(ciphertext);
                if let Ok(plaintext_str) = String::from_utf8(fallback_data) {
                    if let Ok(source_cache) = serde_json::from_str::<SourceCache>(&plaintext_str) {
                        if source_cache.version == CURRENT_CACHE_VERSION {
                            let res: HashMap<_, _> = source_cache
                                .entries
                                .into_iter()
                                .map(|e| (e.file_path.clone(), e))
                                .collect();
                            crate::log_debug!(
                                "[load_cache] Loaded plaintext fallback cache for '{}' in {:?}",
                                source_id,
                                _start.elapsed()
                            );
                            return res;
                        }
                    }
                }
                crate::log_warn!(
                    "Warning: Failed to decrypt session cache for '{}'. Discarding cache.",
                    source_id
                );
                return HashMap::new();
            }
        };

        if let Ok(source_cache) = serde_json::from_slice::<SourceCache>(&plaintext) {
            if source_cache.version == CURRENT_CACHE_VERSION {
                let res: HashMap<_, _> = source_cache
                    .entries
                    .into_iter()
                    .map(|e| (e.file_path.clone(), e))
                    .collect();
                crate::log_debug!(
                    "[load_cache] Decrypted and parsed cache for '{}' in {:?}",
                    source_id,
                    _start.elapsed()
                );
                return res;
            } else {
                crate::log_error!("Parser cache version mismatch for '{}': expected {}, found {}. Discarding cache.", source_id, CURRENT_CACHE_VERSION, source_cache.version);
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

        if crate::keyring::is_keyring_disabled() {
            let _ = crate::fs_util::atomic_write(&path, &plaintext_json);
        } else {
            let key_bytes = get_or_create_cache_key();
            let cipher = Aes256Gcm::new(&key_bytes.into());
            let mut nonce_bytes = [0u8; 12];
            getrandom::fill(&mut nonce_bytes).expect("Failed to generate random nonce");
            let nonce = Nonce::from(nonce_bytes);

            if let Ok(ciphertext) = cipher.encrypt(&nonce, plaintext_json.as_ref()) {
                let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
                combined.extend_from_slice(&nonce_bytes);
                combined.extend_from_slice(&ciphertext);
                let _ = crate::fs_util::atomic_write(&path, &combined);
            }
        }
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
            let mut cache_loaded = None;
            if let Ok(guard) = self.active_caches.lock() {
                if let Some(map) = guard.get(source_id) {
                    cache_loaded = map.get(file_path).cloned();
                }
            }
            if cache_loaded.is_none() {
                let cache_map = self.load_cache(source_id);
                cache_loaded = cache_map.get(file_path).cloned();
            }
            cache_loaded
        }?;

        if entry.last_modified == last_modified && entry.size == size {
            if let Ok(mut seen_guard) = self.seen_paths.lock() {
                if let Some(set) = seen_guard.get_mut(source_id) {
                    set.insert(file_path.to_string());
                }
            }
            if let Ok(mut hit_guard) = self.hit_counter.lock() {
                *hit_guard.entry(source_id.to_string()).or_insert(0) += 1;
            }
            return Some(entry.session);
        }
        if let Ok(mut miss_guard) = self.miss_counter.lock() {
            *miss_guard.entry(source_id.to_string()).or_insert(0) += 1;
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
            let mut cache_loaded = None;
            if let Ok(guard) = self.active_caches.lock() {
                if let Some(map) = guard.get(source_id) {
                    cache_loaded = map.get(file_path).cloned();
                }
            }
            if cache_loaded.is_none() {
                let cache_map = self.load_cache(source_id);
                cache_loaded = cache_map.get(file_path).cloned();
            }
            cache_loaded
        }?;

        if entry.hash == hash && entry.size == size {
            if let Ok(mut seen_guard) = self.seen_paths.lock() {
                if let Some(set) = seen_guard.get_mut(source_id) {
                    set.insert(file_path.to_string());
                }
            }
            if let Ok(mut hit_guard) = self.hit_counter.lock() {
                *hit_guard.entry(source_id.to_string()).or_insert(0) += 1;
            }
            return Some(entry.session);
        }
        if let Ok(mut miss_guard) = self.miss_counter.lock() {
            *miss_guard.entry(source_id.to_string()).or_insert(0) += 1;
        }
        None
    }

    pub fn update_cached_session(&self, source_id: &str, file_path: &str, session: Session) {
        if let Ok(mut active_guard) = self.active_caches.lock() {
            if let Some(map) = active_guard.get_mut(source_id) {
                if let Some(entry) = map.get_mut(file_path) {
                    entry.session = session;
                }
            }
        }
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

    pub fn end_scan(&self, source_id: &str) -> Vec<Session> {
        let entries_to_save = {
            let mut active_guard = match self.active_caches.lock() {
                Ok(g) => g,
                Err(_) => return Vec::new(),
            };
            let seen_guard = match self.seen_paths.lock() {
                Ok(g) => g,
                Err(_) => return Vec::new(),
            };

            let cache_map = match active_guard.get_mut(source_id) {
                Some(m) => m,
                None => return Vec::new(),
            };
            let seen = match seen_guard.get(source_id) {
                Some(s) => s,
                None => return Vec::new(),
            };

            let prune_deleted = crate::keyring::load_fallback_config()
                .get("prune_deleted_sessions")
                .and_then(|v| v.parse::<bool>().ok())
                .unwrap_or(false);

            // Remove orphans
            let keys_to_remove: Vec<String> = cache_map
                .iter()
                .filter(|(k, entry)| {
                    if self.is_temporary_path(k) {
                        return true;
                    }
                    if seen.contains(*k) {
                        return false;
                    }
                    prune_deleted || entry.session.turns.is_empty()
                })
                .map(|(k, _)| k.clone())
                .collect();
            for key in keys_to_remove {
                cache_map.remove(&key);
            }

            for (key, entry) in cache_map.iter_mut() {
                entry.session.is_deleted = !seen.contains(key);
            }

            cache_map.values().cloned().collect::<Vec<CacheEntry>>()
        };

        self.save_cache(source_id, entries_to_save.clone());

        let _hits = if let Ok(guard) = self.hit_counter.lock() {
            guard.get(source_id).cloned().unwrap_or(0)
        } else {
            0
        };
        let _misses = if let Ok(guard) = self.miss_counter.lock() {
            guard.get(source_id).cloned().unwrap_or(0)
        } else {
            0
        };
        crate::log_debug!(
            "[cache] Source '{}': {} hits, {} misses",
            source_id,
            _hits,
            _misses
        );

        if let Ok(mut guard) = self.hit_counter.lock() {
            guard.insert(source_id.to_string(), 0);
        }
        if let Ok(mut guard) = self.miss_counter.lock() {
            guard.insert(source_id.to_string(), 0);
        }

        // Clear memory cache
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.remove(source_id);
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.remove(source_id);
        }

        entries_to_save
            .into_iter()
            .map(|entry| entry.session)
            .collect()
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
