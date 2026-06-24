pub mod lexical;
pub mod tokenizer;
pub mod cache;
pub mod semantic;

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ArchivalFilter {
    All,
    Active,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilter {
    #[serde(default)]
    pub source_ids: HashSet<String>,
    #[serde(default)]
    pub min_timestamp: i64,
    #[serde(default)]
    pub max_timestamp: Option<i64>,
    #[serde(default)]
    pub cwd_filter: Option<String>,
    #[serde(default)]
    pub match_case: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub use_regex: bool,
    #[serde(default = "default_archival_filter")]
    pub archival_filter: ArchivalFilter,
    #[serde(default)]
    pub session_ids: Option<HashSet<String>>,
}

fn default_archival_filter() -> ArchivalFilter {
    ArchivalFilter::All
}

impl Default for SearchFilter {
    fn default() -> Self {
        Self {
            source_ids: HashSet::new(),
            min_timestamp: 0,
            max_timestamp: None,
            cwd_filter: None,
            match_case: false,
            whole_word: false,
            use_regex: false,
            archival_filter: ArchivalFilter::All,
            session_ids: None,
        }
    }
}

impl SearchFilter {
    pub fn matches(&self, session: &crate::models::Session) -> bool {
        if !self.source_ids.is_empty() && !self.source_ids.contains(&session.source_id) {
            return false;
        }
        let max_ts = self.max_timestamp.unwrap_or(i64::MAX);
        if session.updated_at < self.min_timestamp || session.updated_at > max_ts {
            return false;
        }
        if let Some(ref cwd_filter) = self.cwd_filter {
            let cwd = match session.cwd.as_ref() {
                Some(c) => c,
                None => return false,
            };
            if !cwd.to_lowercase().contains(&cwd_filter.to_lowercase()) {
                return false;
            }
        }
        match self.archival_filter {
            ArchivalFilter::Active => {
                if session.is_archived {
                    return false;
                }
            }
            ArchivalFilter::Archived => {
                if !session.is_archived {
                    return false;
                }
            }
            ArchivalFilter::All => {}
        }
        if let Some(ref sids) = self.session_ids {
            if !sids.contains(&session.id) {
                return false;
            }
        }
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub session: crate::models::Session,
    pub matched_turn_indexes: Vec<usize>,
    pub score: f32,
}

#[derive(Clone)]
pub struct SessionVectorIndex {
    pub thread_name_embedding: Vec<f32>,
    pub turn_embeddings: Vec<Vec<f32>>,
}

pub struct SearchIndexState {
    pub sessions: RwLock<HashMap<String, crate::models::Session>>,
    pub embeddings: RwLock<HashMap<String, SessionVectorIndex>>,
}

impl SearchIndexState {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            embeddings: RwLock::new(HashMap::new()),
        }
    }

    pub async fn rebuild(&self, use_semantic: bool) -> Result<(), String> {
        let total_start = std::time::Instant::now();
        let home = crate::parsers::get_home_dir();
        let model_path = home.join(".codeoba/models/model_quantized.onnx");
        let vocab_path = home.join(".codeoba/models/vocab.txt");

        let run_embeddings = use_semantic && model_path.exists() && vocab_path.exists();

        let mut onnx_embedder = if run_embeddings {
            let onnx_load_start = std::time::Instant::now();
            let embedder = semantic::OnnxSemanticEmbedder::new(&model_path, &vocab_path).ok();
            println!("[rebuild] ONNX embedder load time: {:?}", onnx_load_start.elapsed());
            embedder
        } else {
            None
        };

        let cache_mgr = if run_embeddings {
            let model_id = "all-MiniLM-L6-v2";
            let mgr = cache::EmbeddingCacheManager::new(model_id);
            let cache_load_start = std::time::Instant::now();
            mgr.load_cache();
            println!("[rebuild] Cache load time: {:?}", cache_load_start.elapsed());
            Some(mgr)
        } else {
            None
        };

        let parse_start = std::time::Instant::now();
        let sources = crate::parsers::get_sources_list();
        let mut all_sessions = Vec::new();
        for source in &sources {
            if source.is_available() {
                let source_start = std::time::Instant::now();
                all_sessions.extend(source.parse_all_sessions().await);
                println!("[rebuild] Parsed source '{}' in {:?}", source.id(), source_start.elapsed());
            }
        }
        println!("[rebuild] Total parsing time: {:?}", parse_start.elapsed());

        let embed_start = std::time::Instant::now();
        let hash_embedder = semantic::HashSemanticEmbedder::new(384);

        let mut session_map = HashMap::new();
        let mut embedding_map = HashMap::new();

        let existing_sessions: Option<HashMap<String, crate::models::Session>> = {
            if let Ok(guard) = self.sessions.read() {
                Some(guard.clone())
            } else {
                None
            }
        };
        let existing_embeddings: Option<HashMap<String, SessionVectorIndex>> = {
            if let Ok(guard) = self.embeddings.read() {
                Some(guard.clone())
            } else {
                None
            }
        };

        let mut onnx_invocations = 0;
        let mut cache_hits = 0;

        for session in all_sessions {
            let mut reused = false;
            if run_embeddings {
                if let (Some(ref old_sessions), Some(ref old_embs)) = (&existing_sessions, &existing_embeddings) {
                    if let (Some(old_sess), Some(old_emb)) = (old_sessions.get(&session.id), old_embs.get(&session.id)) {
                        if old_sess.updated_at == session.updated_at && old_sess.turns.len() == session.turns.len() {
                            embedding_map.insert(session.id.clone(), old_emb.clone());
                            session_map.insert(session.id.clone(), session.clone());
                            reused = true;
                        }
                    }
                }
            }

            if reused {
                continue;
            }

            if run_embeddings {
                if let Some(ref cache) = cache_mgr {
                    let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");
                    let thread_emb = if let Some(v) = cache.get(thread_name) {
                        cache_hits += 1;
                        v
                    } else {
                        let v = if let Some(ref mut onnx) = onnx_embedder {
                            onnx_invocations += 1;
                            onnx.get_embeddings(thread_name).unwrap_or_else(|_| hash_embedder.get_embeddings(thread_name))
                        } else {
                            hash_embedder.get_embeddings(thread_name)
                        };
                        cache.put(thread_name, v.clone());
                        v
                    };

                    let mut turn_embs = Vec::new();
                    for turn in &session.turns {
                        let text = format!("{}\n{}", turn.user_message, turn.assistant_message);
                        let turn_emb = if let Some(v) = cache.get(&text) {
                            cache_hits += 1;
                            v
                        } else {
                            let v = if let Some(ref mut onnx) = onnx_embedder {
                                onnx_invocations += 1;
                                onnx.get_embeddings(&text).unwrap_or_else(|_| hash_embedder.get_embeddings(&text))
                            } else {
                                hash_embedder.get_embeddings(&text)
                            };
                            cache.put(&text, v.clone());
                            v
                        };
                        turn_embs.push(turn_emb);
                    }

                    let vec_index = SessionVectorIndex {
                        thread_name_embedding: thread_emb,
                        turn_embeddings: turn_embs,
                    };

                    embedding_map.insert(session.id.clone(), vec_index);
                }
            }

            session_map.insert(session.id.clone(), session);
        }

        if run_embeddings {
            let mut active_texts = std::collections::HashSet::new();
            for session in session_map.values() {
                let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");
                active_texts.insert(thread_name.to_string());
                for turn in &session.turns {
                    let text = format!("{}\n{}", turn.user_message, turn.assistant_message);
                    active_texts.insert(text);
                }
            }

            println!("[rebuild] Embedding calculations: ONNX = {}, Cache Hits = {}, Elapsed: {:?}", onnx_invocations, cache_hits, embed_start.elapsed());

            let cache_save_start = std::time::Instant::now();
            if let Some(ref cache) = cache_mgr {
                cache.prune_orphans(&active_texts);
                cache.save_cache();
            }
            println!("[rebuild] Cache save time: {:?}", cache_save_start.elapsed());
        }

        if let Ok(mut sessions_guard) = self.sessions.write() {
            *sessions_guard = session_map;
        }
        if let Ok(mut embeddings_guard) = self.embeddings.write() {
            *embeddings_guard = embedding_map;
        }

        println!("[rebuild] Total rebuild time: {:?}", total_start.elapsed());
        Ok(())
    }



    pub async fn update_session(&self, session: crate::models::Session) -> Result<(), String> {
        let home = crate::parsers::get_home_dir();
        let model_path = home.join(".codeoba/models/model_quantized.onnx");
        let vocab_path = home.join(".codeoba/models/vocab.txt");

        let mut onnx_embedder = if model_path.exists() && vocab_path.exists() {
            semantic::OnnxSemanticEmbedder::new(&model_path, &vocab_path).ok()
        } else {
            None
        };
        let hash_embedder = semantic::HashSemanticEmbedder::new(384);

        let model_id = if onnx_embedder.is_some() { "all-MiniLM-L6-v2" } else { "hash-384" };
        let cache_mgr = cache::EmbeddingCacheManager::new(model_id);
        cache_mgr.load_cache();

        let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");
        let thread_emb = if let Some(v) = cache_mgr.get(thread_name) {
            v
        } else {
            let v = if let Some(ref mut onnx) = onnx_embedder {
                onnx.get_embeddings(thread_name).unwrap_or_else(|_| hash_embedder.get_embeddings(thread_name))
            } else {
                hash_embedder.get_embeddings(thread_name)
            };
            cache_mgr.put(thread_name, v.clone());
            v
        };

        let mut turn_embs = Vec::new();
        for turn in &session.turns {
            let text = format!("{}\n{}", turn.user_message, turn.assistant_message);
            let turn_emb = if let Some(v) = cache_mgr.get(&text) {
                v
            } else {
                let v = if let Some(ref mut onnx) = onnx_embedder {
                    onnx.get_embeddings(&text).unwrap_or_else(|_| hash_embedder.get_embeddings(&text))
                } else {
                    hash_embedder.get_embeddings(&text)
                };
                cache_mgr.put(&text, v.clone());
                v
            };
            turn_embs.push(turn_emb);
        }

        let vec_index = SessionVectorIndex {
            thread_name_embedding: thread_emb,
            turn_embeddings: turn_embs,
        };

        cache_mgr.save_cache();

        if let Ok(mut sessions_guard) = self.sessions.write() {
            sessions_guard.insert(session.id.clone(), session.clone());
        }
        if let Ok(mut embeddings_guard) = self.embeddings.write() {
            embeddings_guard.insert(session.id.clone(), vec_index);
        }

        Ok(())
    }
}
