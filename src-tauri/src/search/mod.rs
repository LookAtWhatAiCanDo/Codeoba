pub mod lexical;

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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingProgress {
    pub step: String,
    pub progress: f32,
    pub current_source: String,
}

pub struct SearchIndexState {
    pub sessions: RwLock<HashMap<String, crate::models::Session>>,
    pub last_progress: RwLock<Option<IndexingProgress>>,
    pub is_rebuilding: std::sync::atomic::AtomicBool,
    pub has_rebuilt: std::sync::atomic::AtomicBool,
    pub app_handle: RwLock<Option<tauri::AppHandle>>,
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
            last_progress: RwLock::new(None),
            is_rebuilding: std::sync::atomic::AtomicBool::new(false),
            has_rebuilt: std::sync::atomic::AtomicBool::new(false),
            app_handle: RwLock::new(None),
            status_ttl_cache: RwLock::new(HashMap::new()),
        }
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

        // Snapshot BEFORE parsing, not after. Parsing is the long phase, so it is the
        // window during which a concurrent `update_session` can land. Taking the
        // snapshot afterwards (as this used to) made it identical to `live` and turned
        // the concurrency guard in `merge_rebuilt_sessions` into dead code.
        let existing_sessions: Option<HashMap<String, crate::models::Session>> = {
            if let Ok(guard) = self.sessions.read() {
                Some(guard.clone())
            } else {
                None
            }
        };

        let parse_start = std::time::Instant::now();
        let sources = crate::parsers::get_sources_list();
        let mut all_sessions = Vec::new();
        // Which sources actually produced sessions this pass. A source that yields
        // nothing did not necessarily lose all its sessions — its scan may have been
        // clobbered by a concurrent scan (see SessionCacheManager::end_scan) — so its
        // existing sessions must be preserved rather than treated as deleted.
        let mut sources_with_results: HashSet<String> = HashSet::new();

        let available_sources: Vec<_> = sources.iter().filter(|s| s.is_available()).collect();
        let total_sources = available_sources.len() as f32;
        let mut current_idx = 0;

        for source in available_sources {
            current_idx += 1;
            let pct = 0.05 + (current_idx as f32 / total_sources) * 0.70; // 5% to 75%
            emit_progress("parsing", pct, source.display_name());

            let source_start = std::time::Instant::now();
            let parsed = source.parse_all_sessions().await;
            if parsed.is_empty() {
                crate::log_warn!(
                    "[rebuild] Source '{}' returned no sessions; preserving its existing \
                     sessions instead of treating them as deleted.",
                    source.id()
                );
            } else {
                sources_with_results.insert(source.id().to_string());
            }
            all_sessions.extend(parsed);
            crate::log_info!(
                "[rebuild] Parsed source '{}' in {:?}",
                source.id(),
                source_start.elapsed()
            );
            tokio::task::yield_now().await;
        }
        crate::log_info!("[rebuild] Total parsing time: {:?}", parse_start.elapsed());

        let mut session_map = HashMap::new();
        for session in all_sessions {
            session_map.insert(session.id.clone(), session);
        }

        if let Ok(mut sessions_guard) = self.sessions.write() {
            match &existing_sessions {
                Some(snapshot) => {
                    let (merged, _, _) = merge_rebuilt_sessions(
                        session_map,
                        &sessions_guard,
                        snapshot,
                        &sources_with_results,
                    );
                    *sessions_guard = merged;
                }
                None => {
                    *sessions_guard = session_map;
                }
            }
        }

        emit_progress("complete", 1.0, "Index rebuild complete.");
        crate::log_info!("[rebuild] Total rebuild time: {:?}", total_start.elapsed());
        self.has_rebuilt
            .store(true, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }

    pub async fn update_session(&self, session: crate::models::Session) -> Result<(), String> {
        let needs_update = {
            if let Ok(sessions_guard) = self.sessions.read() {
                if let Some(existing) = sessions_guard.get(&session.id) {
                    existing != &session
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

        if let Ok(mut sessions_guard) = self.sessions.write() {
            sessions_guard.insert(session.id.clone(), session.clone());
        }
        if let Some(ref status) = session.status {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            if let Ok(mut ttl_guard) = self.status_ttl_cache.write() {
                ttl_guard.insert(session.id.clone(), (status.clone(), now));
            }
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
/// `sources_with_results` lists the sources that actually returned sessions this pass. A source
/// absent from it produced nothing, which is ambiguous: either every one of its sessions really is
/// gone, or its scan was clobbered and returned empty (see `SessionCacheManager::end_scan`). The
/// second case is the one observed in practice — a whole source silently vanishing from the sidebar
/// — so a source that reported nothing never causes deletions.
///
/// Returns the merged map plus the ids that were preserved / deleted.
fn merge_rebuilt_sessions(
    rebuilt: HashMap<String, crate::models::Session>,
    live: &HashMap<String, crate::models::Session>,
    snapshot: &HashMap<String, crate::models::Session>,
    sources_with_results: &HashSet<String>,
) -> (
    HashMap<String, crate::models::Session>,
    Vec<String>,
    Vec<String>,
) {
    let mut merged = rebuilt;
    let mut preserved = Vec::new();
    let mut deleted = Vec::new();

    for (id, live_session) in live {
        // A source that reported nothing cannot be trusted to have reported deletions
        // either, so keep everything it previously had.
        let source_reported = sources_with_results.contains(&live_session.source_id);
        if !source_reported {
            merged.insert(id.clone(), live_session.clone());
            preserved.push(id.clone());
            continue;
        }
        if snapshot.get(id) != Some(live_session) {
            merged.insert(id.clone(), live_session.clone());
            preserved.push(id.clone());
        }
    }
    for (id, snapshot_session) in snapshot {
        if !sources_with_results.contains(&snapshot_session.source_id) {
            continue;
        }
        if !live.contains_key(id) {
            merged.remove(id);
            deleted.push(id.clone());
        }
    }
    (merged, preserved, deleted)
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
                    images: None,
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

    #[test]
    fn populates_in_memory_session() {
        let state = SearchIndexState::new();
        tauri::async_runtime::block_on(state.update_session(session_with_turns("s1", 2))).unwrap();

        assert!(state.sessions.read().unwrap().contains_key("s1"));
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

    fn sess_from(id: &str, source_id: &str, updated_at: i64) -> Session {
        Session {
            source_id: source_id.to_string(),
            ..sess(id, updated_at)
        }
    }

    /// Every source reported, so normal reconciliation applies.
    fn all_reported() -> std::collections::HashSet<String> {
        ["codex".to_string()].into_iter().collect()
    }

    /// The bug behind "a whole source disappears from the sidebar": antigravity's scan
    /// was clobbered by a concurrent scan and returned zero sessions, so the rebuild's
    /// result contained none of them. The merge must preserve them, not delete them.
    #[test]
    fn source_that_reported_nothing_keeps_its_sessions() {
        let live = map(vec![
            sess_from("ag1", "antigravity", 1),
            sess_from("ag2", "antigravity", 1),
            sess_from("cx1", "codex", 1),
        ]);
        let snapshot = live.clone();
        // antigravity yielded nothing this pass; codex parsed fine.
        let rebuilt = map(vec![sess_from("cx1", "codex", 2)]);
        let reported: std::collections::HashSet<String> =
            ["codex".to_string()].into_iter().collect();

        let (merged, _, deleted) = merge_rebuilt_sessions(rebuilt, &live, &snapshot, &reported);

        assert!(
            merged.contains_key("ag1") && merged.contains_key("ag2"),
            "sessions from a source that reported nothing must be preserved"
        );
        assert_eq!(
            merged.get("cx1").unwrap().updated_at,
            2,
            "the source that did report keeps the rebuild's fresh value"
        );
        assert!(
            deleted.is_empty(),
            "a source reporting nothing must never produce deletions"
        );
    }

    /// A genuine deletion from a source that DID report is still honored.
    #[test]
    fn reporting_source_still_honors_real_deletions() {
        let snapshot = map(vec![
            sess_from("cx1", "codex", 1),
            sess_from("cx2", "codex", 1),
        ]);
        // cx2 was deleted concurrently.
        let live = map(vec![sess_from("cx1", "codex", 1)]);
        let rebuilt = map(vec![
            sess_from("cx1", "codex", 1),
            sess_from("cx2", "codex", 1),
        ]);

        let (merged, _, deleted) =
            merge_rebuilt_sessions(rebuilt, &live, &snapshot, &all_reported());

        assert!(!merged.contains_key("cx2"), "real deletion must be honored");
        assert_eq!(deleted, vec!["cx2".to_string()]);
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

        let (merged, mut preserved, deleted) =
            merge_rebuilt_sessions(rebuilt, &live, &snapshot, &all_reported());

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

        let (merged, preserved, deleted) =
            merge_rebuilt_sessions(rebuilt, &live, &snapshot, &all_reported());

        assert_eq!(merged.get("a").unwrap().updated_at, 5);
        assert_eq!(merged.get("b").unwrap().updated_at, 5);
        assert!(preserved.is_empty());
        assert!(deleted.is_empty());
    }
}
