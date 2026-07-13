pub mod cache;
pub mod lexical;
pub mod semantic;
pub mod tokenizer;

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingProgress {
    pub step: String,
    pub progress: f32,
    pub current_source: String,
}

pub struct SearchIndexState {
    pub sessions: RwLock<HashMap<String, crate::models::Session>>,
    pub embeddings: RwLock<HashMap<String, SessionVectorIndex>>,
    pub last_progress: RwLock<Option<IndexingProgress>>,
    pub is_rebuilding: std::sync::atomic::AtomicBool,
    pub has_rebuilt: std::sync::atomic::AtomicBool,
    pub is_semantic_initialized: std::sync::atomic::AtomicBool,
    pub app_handle: RwLock<Option<tauri::AppHandle>>,
    /// Lazily-built ONNX query embedder, cached so a semantic search reuses one loaded model
    /// instead of re-reading and re-optimizing the ~90 MB graph on every query. The bundled
    /// model is fixed, so a cached embedder never goes stale.
    pub cached_embedder: RwLock<Option<Arc<semantic::OnnxSemanticEmbedder>>>,
    pub status_ttl_cache: RwLock<HashMap<String, (String, i64)>>,
}

impl Default for SearchIndexState {
    fn default() -> Self {
        Self::new()
    }
}

impl SearchIndexState {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            embeddings: RwLock::new(HashMap::new()),
            last_progress: RwLock::new(None),
            is_rebuilding: std::sync::atomic::AtomicBool::new(false),
            has_rebuilt: std::sync::atomic::AtomicBool::new(false),
            is_semantic_initialized: std::sync::atomic::AtomicBool::new(false),
            app_handle: RwLock::new(None),
            cached_embedder: RwLock::new(None),
            status_ttl_cache: RwLock::new(HashMap::new()),
        }
    }

    /// Returns the shared query embedder, building and caching it on first use.
    ///
    /// Without this, every semantic search reconstructed an `OnnxSemanticEmbedder` — reading
    /// the model file and running `into_optimized()` on the full graph — purely to embed one
    /// short query string, adding multiple seconds of latency per (debounced) keystroke.
    ///
    /// A double-checked lock keeps a burst of concurrent searches from each building a copy.
    pub fn get_or_load_embedder(
        &self,
        model_path: &std::path::Path,
        vocab_path: &std::path::Path,
    ) -> Result<Arc<semantic::OnnxSemanticEmbedder>, String> {
        if let Ok(guard) = self.cached_embedder.read() {
            if let Some(embedder) = guard.as_ref() {
                return Ok(embedder.clone());
            }
        }

        let mut guard = self.cached_embedder.write().map_err(|e| e.to_string())?;
        if let Some(embedder) = guard.as_ref() {
            return Ok(embedder.clone());
        }
        let embedder = Arc::new(semantic::OnnxSemanticEmbedder::new(model_path, vocab_path)?);
        *guard = Some(embedder.clone());
        Ok(embedder)
    }

    pub fn load_cached_sessions(&self) {
        let start = std::time::Instant::now();
        let sources = crate::parsers::get_sources_list();
        let mut session_map = HashMap::new();

        let cache_mgr = crate::parsers::cache::get_cache_manager();
        for source in sources {
            if source.is_available() {
                let cache = cache_mgr.load_cache(source.id());
                for entry in cache.into_values() {
                    session_map.insert(entry.session.id.clone(), entry.session);
                }
            }
        }

        let count = session_map.len();
        if let Ok(mut guard) = self.sessions.write() {
            *guard = session_map;
        }
        crate::log_info!(
            "[SearchIndexState] Loaded {} cached sessions in {:?}",
            count,
            start.elapsed()
        );
    }

    pub async fn rebuild<R: tauri::Runtime>(
        &self,
        use_semantic: bool,
        app_handle: Option<tauri::AppHandle<R>>,
    ) -> Result<(), String> {
        if self
            .is_rebuilding
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            crate::log_warn!(
                "[rebuild] Rebuild is already in progress. Ignoring concurrent request."
            );
            return Ok(());
        }

        struct RebuildGuard<'a>(&'a std::sync::atomic::AtomicBool);
        impl<'a> Drop for RebuildGuard<'a> {
            fn drop(&mut self) {
                self.0.store(false, std::sync::atomic::Ordering::SeqCst);
            }
        }
        let _guard = RebuildGuard(&self.is_rebuilding);

        let total_start = std::time::Instant::now();

        let emit_progress = |step: &str, progress: f32, current_source: &str| {
            let info = IndexingProgress {
                step: step.to_string(),
                progress,
                current_source: current_source.to_string(),
            };
            if let Ok(mut guard) = self.last_progress.write() {
                *guard = Some(info.clone());
            }
            if let Some(ref handle) = app_handle {
                use tauri::Emitter;
                let _ = handle.emit("indexing-progress", info);
            }
        };

        emit_progress("start", 0.0, "Initializing search index...");

        let run_embeddings_flag = use_semantic
            && self
                .is_semantic_initialized
                .load(std::sync::atomic::Ordering::SeqCst);

        let onnx_embedder = if run_embeddings_flag {
            let (model_path, vocab_path) = resolve_model_paths(app_handle.as_ref());
            if model_path.exists() && vocab_path.exists() {
                let onnx_load_start = std::time::Instant::now();
                let embedder = semantic::OnnxSemanticEmbedder::new(&model_path, &vocab_path).ok();
                crate::log_info!(
                    "[rebuild] ONNX embedder load time: {:?}",
                    onnx_load_start.elapsed()
                );
                embedder
            } else {
                None
            }
        } else {
            None
        };

        let run_embeddings = onnx_embedder.is_some();

        let cache_mgr = if run_embeddings {
            let model_id = "all-MiniLM-L6-v2";
            let mgr = cache::EmbeddingCacheManager::new(model_id);
            let cache_load_start = std::time::Instant::now();
            mgr.load_cache();
            crate::log_info!(
                "[rebuild] Cache load time: {:?}",
                cache_load_start.elapsed()
            );
            Some(mgr)
        } else {
            None
        };

        let parse_start = std::time::Instant::now();
        let sources = crate::parsers::get_sources_list();
        let mut all_sessions = Vec::new();

        let available_sources: Vec<_> = sources.iter().filter(|s| s.is_available()).collect();
        let total_sources = available_sources.len() as f32;
        let mut current_idx = 0;

        for source in available_sources {
            current_idx += 1;
            let pct = 0.05 + (current_idx as f32 / total_sources) * 0.70; // 5% to 75%
            emit_progress("parsing", pct, source.display_name());

            let source_start = std::time::Instant::now();
            all_sessions.extend(source.parse_all_sessions().await);
            crate::log_info!(
                "[rebuild] Parsed source '{}' in {:?}",
                source.id(),
                source_start.elapsed()
            );
            tokio::task::yield_now().await;
        }
        crate::log_info!("[rebuild] Total parsing time: {:?}", parse_start.elapsed());

        // Immediately update state.sessions with parsed sessions so they are visible and lexical search works!
        if let Ok(mut sessions_guard) = self.sessions.write() {
            let mut session_map = HashMap::new();
            for session in &all_sessions {
                session_map.insert(session.id.clone(), session.clone());
            }
            *sessions_guard = session_map;
        }

        emit_progress("embedding", 0.80, "Calculating semantic embeddings...");

        let embed_start = std::time::Instant::now();

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

        let mut sessions_to_embed = Vec::new();
        for session in all_sessions {
            let mut reused = false;
            if run_embeddings {
                if let (Some(ref old_sessions), Some(ref old_embs)) =
                    (&existing_sessions, &existing_embeddings)
                {
                    if let (Some(old_sess), Some(old_emb)) =
                        (old_sessions.get(&session.id), old_embs.get(&session.id))
                    {
                        if old_sess.updated_at == session.updated_at
                            && old_sess.turns.len() == session.turns.len()
                        {
                            embedding_map.insert(session.id.clone(), old_emb.clone());
                            session_map.insert(session.id.clone(), session.clone());
                            reused = true;
                        }
                    }
                }
            }

            if !reused {
                sessions_to_embed.push(session);
            }
        }

        let (session_map, embedding_map, final_onnx_invocations, final_cache_hits) = {
            let onnx_emb_val = onnx_embedder;
            let cache_mgr_val = cache_mgr;
            let app_handle_clone = app_handle.clone();
            let run_embeddings_val = run_embeddings;

            tokio::task::spawn_blocking(move || {
                let mut s_map = session_map;
                let mut e_map = embedding_map;

                let onnx_invs = std::sync::atomic::AtomicUsize::new(0);
                let c_hits = std::sync::atomic::AtomicUsize::new(0);

                let onnx_emb = onnx_emb_val;
                let cache_ref = cache_mgr_val;

                let total_to_embed = sessions_to_embed.len();
                crate::log_info!("[rebuild] Starting embedding loop: {} sessions to embed.", total_to_embed);

                for (idx, session) in sessions_to_embed.into_iter().enumerate() {
                    let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");

                    // Periodic progress reporting (every 5 sessions, or if it's the last one)
                    if idx % 5 == 0 || idx == total_to_embed - 1 {
                        let pct = 0.80 + (idx as f32 / total_to_embed.max(1) as f32) * 0.19; // 80% to 99%
                        let display_text = format!("Calculating semantic embeddings... ({}/{})", idx + 1, total_to_embed);
                        crate::log_info!("[rebuild] Progress: {}/{} sessions ({}%)", idx + 1, total_to_embed, (pct * 100.0) as u32);

                        let info = IndexingProgress {
                            step: "embedding".to_string(),
                            progress: pct,
                            current_source: display_text,
                        };

                        if let Some(ref handle) = app_handle_clone {
                            use tauri::Manager;
                            let state = handle.state::<SearchIndexState>();
                            if let Ok(mut guard) = state.last_progress.write() {
                                *guard = Some(info.clone());
                            }
                            use tauri::Emitter;
                            let _ = handle.emit("indexing-progress", info);
                        }
                    }

                    let mut vec_index = None;
                    if let Some(ref cache) = cache_ref {
                        let hash_emb = semantic::HashSemanticEmbedder::new(384);

                        let thread_emb = if let Some(v) = cache.get(thread_name) {
                            c_hits.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            v
                        } else {
                            let v = if let Some(ref embedder) = onnx_emb {
                                onnx_invs.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                embedder.get_embeddings(thread_name).unwrap_or_else(|e| {
                                    crate::log_warn!("[rebuild]       ONNX error on thread name: {}. Falling back to hash.", e);
                                    hash_emb.get_embeddings(thread_name)
                                })
                            } else {
                                hash_emb.get_embeddings(thread_name)
                            };
                            cache.put(thread_name, v.clone());
                            v
                        };

                        let mut turn_embs = Vec::with_capacity(session.turns.len());
                        for turn in &session.turns {
                            let text = format!("{}\n{}", turn.user_message, turn.assistant_message);

                            let turn_emb = if let Some(v) = cache.get(&text) {
                                c_hits.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                v
                            } else {
                                let v = if let Some(ref embedder) = onnx_emb {
                                    onnx_invs.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                    embedder.get_embeddings(&text).unwrap_or_else(|e| {
                                        crate::log_warn!("[rebuild]       ONNX error on turn: {}. Falling back to hash.", e);
                                        hash_emb.get_embeddings(&text)
                                    })
                                } else {
                                    hash_emb.get_embeddings(&text)
                                };
                                cache.put(&text, v.clone());
                                v
                            };
                            turn_embs.push(turn_emb);
                        }

                        vec_index = Some(SessionVectorIndex {
                            thread_name_embedding: thread_emb,
                            turn_embeddings: turn_embs,
                        });
                    }

                    if let Some(vi) = vec_index {
                        e_map.insert(session.id.clone(), vi);
                    }
                    s_map.insert(session.id.clone(), session);

                    if idx > 0 && idx % 10 == 0 {
                        if let Some(ref cache) = cache_ref {
                            cache.save_cache();
                        }
                    }
                }

                let final_invs = onnx_invs.load(std::sync::atomic::Ordering::Relaxed);
                let final_hits = c_hits.load(std::sync::atomic::Ordering::Relaxed);

                // Prune and save cache synchronously inside the blocking task
                if run_embeddings_val {
                    let mut active_hashes = std::collections::HashSet::new();
                    for session in s_map.values() {
                        let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");
                        active_hashes.insert(crate::search::cache::calculate_string_md5(thread_name));
                        for turn in &session.turns {
                            let text = format!("{}\n{}", turn.user_message, turn.assistant_message);
                            active_hashes.insert(crate::search::cache::calculate_string_md5(&text));
                        }
                    }

                    let cache_save_start = std::time::Instant::now();
                    if let Some(ref cache) = cache_ref {
                        cache.prune_orphans(&active_hashes);
                        cache.save_cache();
                    }
                    crate::log_info!("[rebuild] Synchronous cache save time: {:?}", cache_save_start.elapsed());
                }

                (s_map, e_map, final_invs, final_hits)
            })
            .await
            .map_err(|e| format!("Embedding calculation task failed: {}", e))?
        };

        if run_embeddings {
            crate::log_info!(
                "[rebuild] Embedding calculations: ONNX = {}, Cache Hits = {}, Elapsed: {:?}",
                final_onnx_invocations,
                final_cache_hits,
                embed_start.elapsed()
            );
        }

        // Merge the rebuild result back rather than wholesale-overwriting, so an update_session
        // that ran concurrently during the embedding pass above is not clobbered by this rebuild's
        // older snapshot. `existing_sessions` is that snapshot (captured when the pass began).
        let (preserved_ids, deleted_ids) = if let Ok(mut sessions_guard) = self.sessions.write() {
            match &existing_sessions {
                Some(snapshot) => {
                    let (merged, preserved, deleted) =
                        merge_rebuilt_sessions(session_map, &sessions_guard, snapshot);
                    *sessions_guard = merged;
                    (preserved, deleted)
                }
                None => {
                    *sessions_guard = session_map;
                    (Vec::new(), Vec::new())
                }
            }
        } else {
            (Vec::new(), Vec::new())
        };

        if let Ok(mut embeddings_guard) = self.embeddings.write() {
            // Reconcile embeddings the same way: keep live embeddings for the concurrently-changed
            // sessions we preserved, and drop embeddings for concurrently-deleted ones.
            let mut merged = embedding_map;
            for id in &preserved_ids {
                if let Some(live_emb) = embeddings_guard.get(id) {
                    merged.insert(id.clone(), live_emb.clone());
                }
            }
            for id in &deleted_ids {
                merged.remove(id);
            }
            *embeddings_guard = merged;
        }

        emit_progress("complete", 1.0, "Index rebuild complete.");
        crate::log_info!("[rebuild] Total rebuild time: {:?}", total_start.elapsed());
        self.has_rebuilt
            .store(true, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }

    pub async fn update_session(&self, session: crate::models::Session) -> Result<(), String> {
        // Check if we already have this exact session cached with embeddings
        let needs_update = {
            if let Ok(sessions_guard) = self.sessions.read() {
                if let Some(existing) = sessions_guard.get(&session.id) {
                    if existing == &session {
                        if let Ok(embs_guard) = self.embeddings.read() {
                            !embs_guard.contains_key(&session.id)
                        } else {
                            true
                        }
                    } else {
                        true
                    }
                } else {
                    true
                }
            } else {
                true
            }
        };

        if !needs_update {
            return Ok(());
        }

        let app_handle_opt = self.app_handle.read().ok().and_then(|g| g.clone());
        let run_embeddings = self
            .is_semantic_initialized
            .load(std::sync::atomic::Ordering::SeqCst);

        // Reuse the process-wide cached embedder rather than reloading and re-optimizing the
        // ~90 MB model on every changed file. Falls back to the lightweight hash embedder when the
        // ONNX model isn't available.
        let onnx_embedder = if run_embeddings {
            let (model_path, vocab_path) = resolve_model_paths(app_handle_opt.as_ref());
            if model_path.exists() && vocab_path.exists() {
                self.get_or_load_embedder(&model_path, &vocab_path).ok()
            } else {
                None
            }
        } else {
            None
        };
        let hash_embedder = semantic::HashSemanticEmbedder::new(384);

        // Deliberately no on-disk embedding cache here. Loading and rewriting the whole
        // embeddings_cache.json on every changed file was a major cost. The computed vectors go
        // into the in-memory `embeddings` map, which is authoritative for search and which
        // `rebuild` already reuses (by updated_at/turn-count match); `rebuild` owns persisting the
        // on-disk cache. Worst case is re-embedding a live-updated session on the first rebuild
        // after a restart — a forward pass with the now-cached model.
        let embed = |text: &str| -> Vec<f32> {
            match onnx_embedder.as_ref() {
                Some(onnx) => onnx
                    .get_embeddings(text)
                    .unwrap_or_else(|_| hash_embedder.get_embeddings(text)),
                None => hash_embedder.get_embeddings(text),
            }
        };

        let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");
        let thread_emb = embed(thread_name);

        let mut turn_embs = Vec::with_capacity(session.turns.len());
        for turn in &session.turns {
            let text = format!("{}\n{}", turn.user_message, turn.assistant_message);
            turn_embs.push(embed(&text));
        }

        let vec_index = SessionVectorIndex {
            thread_name_embedding: thread_emb,
            turn_embeddings: turn_embs,
        };

        if let Ok(mut sessions_guard) = self.sessions.write() {
            sessions_guard.insert(session.id.clone(), session.clone());
        }
        if let Ok(mut embeddings_guard) = self.embeddings.write() {
            embeddings_guard.insert(session.id.clone(), vec_index);
        }

        Ok(())
    }
}

/// Merges a rebuild's freshly computed session map back over the live index instead of
/// wholesale-replacing it.
///
/// `rebuilt` is what this rebuild produced, `live` is the current index, and `snapshot` is `live`
/// as it was when the (potentially long) embedding pass began. A plain `*live = rebuilt` would
/// drop any `update_session` that ran concurrently during that pass. Instead:
///   - a live entry that differs from the snapshot — or is absent from it — was changed or inserted
///     concurrently, so it wins over this rebuild's older view;
///   - a snapshot entry now missing from live was deleted concurrently, so it is dropped.
///
/// Returns the merged map plus the ids that were preserved / deleted, so the embeddings map can be
/// reconciled the same way.
fn merge_rebuilt_sessions(
    rebuilt: HashMap<String, crate::models::Session>,
    live: &HashMap<String, crate::models::Session>,
    snapshot: &HashMap<String, crate::models::Session>,
) -> (
    HashMap<String, crate::models::Session>,
    Vec<String>,
    Vec<String>,
) {
    let mut merged = rebuilt;
    let mut preserved = Vec::new();
    let mut deleted = Vec::new();

    for (id, live_session) in live {
        if snapshot.get(id) != Some(live_session) {
            merged.insert(id.clone(), live_session.clone());
            preserved.push(id.clone());
        }
    }
    for id in snapshot.keys() {
        if !live.contains_key(id) {
            merged.remove(id);
            deleted.push(id.clone());
        }
    }

    (merged, preserved, deleted)
}

// ONNX Model Path Resolution & State Management
use std::path::PathBuf;

pub const MODEL_FILENAME: &str = "model.onnx";
pub const VOCAB_FILENAME: &str = "vocab.txt";
pub const EXPECTED_MODEL_HASH: &str =
    "759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e";
pub const EXPECTED_VOCAB_HASH: &str =
    "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3";

pub fn get_home_model_dir() -> PathBuf {
    let home = crate::parsers::get_home_dir();
    home.join(".codeoba/models")
}

pub fn get_home_model_file() -> PathBuf {
    get_home_model_dir().join(MODEL_FILENAME)
}

pub fn get_home_vocab_file() -> PathBuf {
    get_home_model_dir().join(VOCAB_FILENAME)
}

fn is_dev_env() -> bool {
    if let Ok(exe) = std::env::current_exe() {
        return exe.components().any(|c| c.as_os_str() == "target");
    }
    false
}

pub fn resolve_model_paths<R: tauri::Runtime>(
    app_handle: Option<&tauri::AppHandle<R>>,
) -> (PathBuf, PathBuf) {
    // 1. Try resolving using Tauri's resource resolver if app_handle is provided
    if let Some(handle) = app_handle {
        use tauri::Manager;
        if let Ok(bm) = handle.path().resolve(
            "resources/onnx/model.onnx",
            tauri::path::BaseDirectory::Resource,
        ) {
            if let Ok(bv) = handle.path().resolve(
                "resources/onnx/vocab.txt",
                tauri::path::BaseDirectory::Resource,
            ) {
                if bm.exists() && bv.exists() {
                    return (bm, bv);
                }
            }
        }
        // Try local dev mode layout: src-tauri/resources/onnx
        if is_dev_env() {
            if let Ok(bm) = handle
                .path()
                .resolve("onnx/model.onnx", tauri::path::BaseDirectory::Resource)
            {
                if let Ok(bv) = handle
                    .path()
                    .resolve("onnx/vocab.txt", tauri::path::BaseDirectory::Resource)
                {
                    if bm.exists() && bv.exists() {
                        return (bm, bv);
                    }
                }
            }
        }
    }

    // 2. Try relative CWD fallback for dev mode / tests (does NOT require app_handle!)
    if is_dev_env() {
        let dev_model = PathBuf::from("src-tauri/resources/onnx/model.onnx");
        let dev_vocab = PathBuf::from("src-tauri/resources/onnx/vocab.txt");
        if dev_model.exists() && dev_vocab.exists() {
            return (dev_model, dev_vocab);
        } else {
            let test_model = PathBuf::from("resources/onnx/model.onnx");
            let test_vocab = PathBuf::from("resources/onnx/vocab.txt");
            if test_model.exists() && test_vocab.exists() {
                return (test_model, test_vocab);
            }
        }
    }

    // 3. Fallback to expected home directory override
    (get_home_model_file(), get_home_vocab_file())
}

#[cfg(test)]
mod embedder_cache_tests {
    use super::SearchIndexState;
    use std::path::PathBuf;
    use std::sync::Arc;

    fn bundled_model_paths() -> (PathBuf, PathBuf) {
        let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/onnx");
        (base.join("model.onnx"), base.join("vocab.txt"))
    }

    /// The point of the fix: a second semantic search reuses the loaded model instead of
    /// rebuilding it. Proven by pointer identity of the returned `Arc`.
    #[test]
    fn reuses_the_same_embedder_instance() {
        let (model, vocab) = bundled_model_paths();
        if !model.exists() || !vocab.exists() {
            eprintln!("skipping reuses_the_same_embedder_instance: bundled ONNX model not present");
            return;
        }

        let state = SearchIndexState::new();
        let first = state
            .get_or_load_embedder(&model, &vocab)
            .expect("first load");
        let second = state
            .get_or_load_embedder(&model, &vocab)
            .expect("cached load");

        assert!(
            Arc::ptr_eq(&first, &second),
            "second call must return the cached embedder, not rebuild it"
        );

        // Sanity: the cached embedder still produces a normalized 384-dim MiniLM vector.
        let v = first.get_embeddings("hello world").expect("embed");
        assert_eq!(v.len(), 384);
    }
}

#[cfg(test)]
mod update_session_tests {
    use super::SearchIndexState;
    use crate::models::{Session, Turn};

    fn session_with_turns(id: &str, turns: usize) -> Session {
        Session {
            id: id.to_string(),
            source_id: "codex".to_string(),
            file_path: format!("/tmp/{id}.jsonl"),
            timestamp: 0,
            updated_at: 1,
            cwd: None,
            thread_name: Some("thread".to_string()),
            turns: (0..turns)
                .map(|i| Turn {
                    turn_id: format!("{id}_{i}"),
                    user_message: format!("u{i}"),
                    assistant_message: format!("a{i}"),
                    timestamp: 0,
                    input_tokens: None,
                    output_tokens: None,
                    extra_data: std::collections::HashMap::new(),
                })
                .collect(),
            is_archived: false,
            is_pinned: false,
            summary: None,
            snippet: None,
            workspace_name: None,
            status: None,
            is_deleted: false,
        }
    }

    /// update_session stores the session and a full set of embeddings in the in-memory maps
    /// (hash fallback path — no model or semantic init required).
    #[test]
    fn populates_in_memory_session_and_embeddings() {
        let state = SearchIndexState::new();
        tauri::async_runtime::block_on(state.update_session(session_with_turns("s1", 2))).unwrap();

        assert!(state.sessions.read().unwrap().contains_key("s1"));
        let embs = state.embeddings.read().unwrap();
        let vi = embs.get("s1").expect("embeddings stored");
        assert_eq!(vi.thread_name_embedding.len(), 384);
        assert_eq!(vi.turn_embeddings.len(), 2);
        assert!(vi.turn_embeddings.iter().all(|e| e.len() == 384));
    }

    /// The fix: update_session must not load/rewrite the whole embeddings_cache.json per change.
    /// The old code wrote that file on every call; the file must now be absent.
    #[test]
    fn does_not_write_the_embedding_cache_file() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());

        let state = SearchIndexState::new();
        tauri::async_runtime::block_on(state.update_session(session_with_turns("s1", 1))).unwrap();

        let cache_file = temp.path().join(".codeoba/cache/embeddings_cache.json");
        assert!(
            !cache_file.exists(),
            "update_session must not rewrite the whole embedding cache file"
        );

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}

#[cfg(test)]
mod rebuild_merge_tests {
    use super::merge_rebuilt_sessions;
    use crate::models::Session;
    use std::collections::HashMap;

    fn sess(id: &str, updated_at: i64) -> Session {
        Session {
            id: id.to_string(),
            source_id: "codex".to_string(),
            file_path: String::new(),
            timestamp: 0,
            updated_at,
            cwd: None,
            thread_name: None,
            turns: Vec::new(),
            is_archived: false,
            is_pinned: false,
            summary: None,
            snippet: None,
            workspace_name: None,
            status: None,
            is_deleted: false,
        }
    }

    fn map(entries: Vec<Session>) -> HashMap<String, Session> {
        entries.into_iter().map(|s| (s.id.clone(), s)).collect()
    }

    /// A concurrent update, insert, and delete during the embedding pass must survive the rebuild
    /// writeback rather than being clobbered by the rebuild's older snapshot.
    #[test]
    fn preserves_concurrent_changes_and_honors_deletes() {
        let snapshot = map(vec![sess("a", 1), sess("b", 1), sess("c", 1)]);
        // During the pass: b was updated, c was deleted, d was inserted.
        let live = map(vec![sess("a", 1), sess("b", 2), sess("d", 1)]);
        // What the rebuild computed (its older view, ~= snapshot).
        let rebuilt = map(vec![sess("a", 1), sess("b", 1), sess("c", 1)]);

        let (merged, mut preserved, deleted) = merge_rebuilt_sessions(rebuilt, &live, &snapshot);

        assert_eq!(
            merged.get("a").unwrap().updated_at,
            1,
            "unchanged session keeps rebuild value"
        );
        assert_eq!(
            merged.get("b").unwrap().updated_at,
            2,
            "concurrent update must be preserved"
        );
        assert!(
            !merged.contains_key("c"),
            "concurrently deleted session must be dropped"
        );
        assert_eq!(
            merged.get("d").unwrap().updated_at,
            1,
            "concurrent insert must be preserved"
        );

        preserved.sort();
        assert_eq!(preserved, vec!["b".to_string(), "d".to_string()]);
        assert_eq!(deleted, vec!["c".to_string()]);
    }

    /// With no concurrent activity, the rebuild's fresh result is used verbatim.
    #[test]
    fn no_concurrency_uses_rebuild_result() {
        let snapshot = map(vec![sess("a", 1), sess("b", 1)]);
        let live = snapshot.clone();
        let rebuilt = map(vec![sess("a", 5), sess("b", 5)]); // rebuild refreshed both

        let (merged, preserved, deleted) = merge_rebuilt_sessions(rebuilt, &live, &snapshot);

        assert_eq!(merged.get("a").unwrap().updated_at, 5);
        assert_eq!(merged.get("b").unwrap().updated_at, 5);
        assert!(preserved.is_empty());
        assert!(deleted.is_empty());
    }
}
