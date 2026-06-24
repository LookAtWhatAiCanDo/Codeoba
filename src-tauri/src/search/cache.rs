use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng, AeadCore},
    Aes256Gcm, Nonce,
};

#[derive(Serialize, Deserialize, Clone)]
pub struct SerializedEmbeddingCache {
    pub model_id: String,
    pub embeddings: HashMap<String, Vec<f32>>,
}

pub struct EmbeddingCacheManager {
    model_id: String,
    cache_map: Mutex<HashMap<String, Vec<f32>>>,
    is_modified: Mutex<bool>,
}

fn get_or_create_cache_key() -> [u8; 32] {
    crate::keyring::get_or_create_cache_key()
}

impl EmbeddingCacheManager {
    pub fn new(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
            cache_map: Mutex::new(HashMap::new()),
            is_modified: Mutex::new(false),
        }
    }

    fn get_cache_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        let dir = home.join(".codeoba/cache");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn get_cache_file(&self) -> PathBuf {
        self.get_cache_dir().join("embeddings_cache.json")
    }

    pub fn load_cache(&self) {
        let file_path = self.get_cache_file();
        if !file_path.exists() {
            return;
        }
        let mut file = match File::open(file_path) {
            Ok(f) => f,
            Err(_) => return,
        };
        let mut encrypted_data = Vec::new();
        if file.read_to_end(&mut encrypted_data).is_err() {
            return;
        }

        if encrypted_data.len() < 12 {
            return; // Invalid format
        }

        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        let key_bytes = get_or_create_cache_key();
        let cipher = Aes256Gcm::new(&key_bytes.into());
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = match cipher.decrypt(nonce, ciphertext) {
            Ok(p) => p,
            Err(_) => {
                crate::log_warn!("Warning: Failed to decrypt embedding cache. Discarding cache.");
                return;
            }
        };

        if let Ok(cache) = serde_json::from_slice::<SerializedEmbeddingCache>(&plaintext) {
            if cache.model_id == self.model_id {
                if let Ok(mut guard) = self.cache_map.lock() {
                    guard.clear();
                    guard.extend(cache.embeddings);
                }
            } else {
                // Model/version mismatch, discard old cache and mark modified
                if let Ok(mut guard) = self.cache_map.lock() {
                    guard.clear();
                }
                if let Ok(mut mod_guard) = self.is_modified.lock() {
                    *mod_guard = true;
                }
            }
        }
    }

    pub fn save_cache(&self) {
        let modified = {
            if let Ok(guard) = self.is_modified.lock() {
                *guard
            } else {
                false
            }
        };
        if !modified {
            return;
        }

        let file_path = self.get_cache_file();
        let entries = {
            if let Ok(guard) = self.cache_map.lock() {
                guard.clone()
            } else {
                HashMap::new()
            }
        };

        let cache = SerializedEmbeddingCache {
            model_id: self.model_id.clone(),
            embeddings: entries,
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

        if let Ok(mut file) = File::create(file_path) {
            let _ = file.write_all(&combined);
            if let Ok(mut guard) = self.is_modified.lock() {
                *guard = false;
            }
        }
    }

    pub fn get(&self, text: &str) -> Option<Vec<f32>> {
        let hash = calculate_string_md5(text);
        if let Ok(guard) = self.cache_map.lock() {
            guard.get(&hash).cloned()
        } else {
            None
        }
    }

    pub fn put(&self, text: &str, vector: Vec<f32>) {
        let hash = calculate_string_md5(text);
        if let Ok(mut guard) = self.cache_map.lock() {
            if !guard.contains_key(&hash) {
                guard.insert(hash, vector);
                if let Ok(mut mod_guard) = self.is_modified.lock() {
                    *mod_guard = true;
                }
            }
        }
    }

    pub fn prune_orphans(&self, active_texts: &std::collections::HashSet<String>) {
        let mut active_hashes = std::collections::HashSet::with_capacity(active_texts.len());
        for text in active_texts {
            active_hashes.insert(calculate_string_md5(text));
        }
        if let Ok(mut guard) = self.cache_map.lock() {
            let initial_len = guard.len();
            guard.retain(|k, _| active_hashes.contains(k));
            if guard.len() != initial_len {
                if let Ok(mut mod_guard) = self.is_modified.lock() {
                    *mod_guard = true;
                }
            }
        }
    }
}

fn calculate_string_md5(value: &str) -> String {
    let digest = md5::compute(value.as_bytes());
    format!("{:x}", digest)
}
