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
            // Completeness, not emptiness, decides whether this source may drive
            // deletions. A completed scan that found nothing really did find nothing;
            // an incomplete one proves nothing either way.
            if parsed.complete {
                sources_with_results.insert(source.id().to_string());
            } else {
                crate::log_warn!(
                    "[rebuild] Scan of source '{}' did not complete; preserving its \
                     existing sessions instead of treating them as deleted.",
                    source.id()
                );
            }
            all_sessions.extend(parsed.sessions);
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

    /// The single authority for incremental, absence-driven deletion from the index.
    ///
    /// Given `observed` — the session ids a scan of `source_id` actually saw — removes
    /// every *other* session of that source from the index and returns their ids so the
    /// caller can emit `session-deleted`. It is the one place the watcher's
    /// directory-removed, inode-changed, and database-reload paths decide a session is
    /// gone; previously each did it inline with its own copy of the read/remove/emit
    /// dance, and each could fire on an empty result and wipe the whole source.
    ///
    /// `complete` gates the whole operation: a scan that did not enumerate the source
    /// (`false`) makes NO changes, because absence in an incomplete scan is not evidence
    /// of deletion. This is the invariant that stops a transient unreadable directory or
    /// a clobbered concurrent scan from dropping every session of a source.
    ///
    /// Deliberately NOT routed through here: removals driven by *positive*
    /// identification rather than absence — evicting a session positively identified as
    /// a subagent, or removing the one session whose file was observed deleted. Those
    /// carry their own certainty and have bounded blast radius, so they keep their own
    /// paths.
    pub fn reconcile_source(
        &self,
        source_id: &str,
        observed: &HashSet<String>,
        complete: bool,
    ) -> Vec<String> {
        if !complete {
            crate::log_warn!(
                "[reconcile] Scan of source '{}' did not complete; skipping deletion \
                 detection to avoid dropping live sessions.",
                source_id
            );
            return Vec::new();
        }

        let mut removed = Vec::new();
        if let Ok(mut guard) = self.sessions.write() {
            guard.retain(|id, sess| {
                let gone = sess.source_id == source_id && !observed.contains(id);
                if gone {
                    removed.push(id.clone());
                }
                !gone
            });
        }
        if !removed.is_empty() {
            if let Ok(mut ttl_guard) = self.status_ttl_cache.write() {
                for id in &removed {
                    ttl_guard.remove(id);
                }
            }
        }
        removed
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

/// Runs a lexical search directly against the SQLite store, streaming sessions in batches
/// so the whole corpus is never held in memory at once.
///
/// Produces byte-identical results to [`lexical::lexical_search`] over the same sessions —
/// it reuses the exact same query compilation and per-session scoring — but reads from the
/// store instead of the in-memory index. This is what lets the in-memory corpus be dropped:
/// the RAM cost of a search is now one batch, and only matches are retained. Every current
/// feature (substring, regex, case-sensitivity, whole-word, multi-term AND) is preserved,
/// because the matcher is unchanged; only the source of the sessions moved.
pub fn search_store(
    conn: &rusqlite::Connection,
    query: &str,
    filter: &SearchFilter,
) -> rusqlite::Result<Vec<SearchResult>> {
    /// Sessions loaded per keyset page. Large enough to amortize query overhead, small
    /// enough that peak memory is a slice of the corpus rather than all of it.
    const BATCH: i64 = 512;

    let is_empty_query = query.trim().is_empty();
    let regexes = if is_empty_query {
        Vec::new()
    } else {
        let rx = lexical::build_query_regexes(query, filter);
        if rx.is_empty() {
            // An unparseable / all-stopword query matches nothing, same as lexical_search.
            return Ok(Vec::new());
        }
        rx
    };

    let mut results: Vec<SearchResult> = Vec::new();
    crate::parsers::store::for_each_session(conn, BATCH, |session| {
        if is_empty_query {
            // Blank query = "list everything that passes the filter", mirroring the empty
            // branch of lexical_search (score 1.0, no matched turns).
            if filter.matches(&session) {
                results.push(SearchResult {
                    session,
                    matched_turn_indexes: Vec::new(),
                    score: 1.0,
                });
            }
        } else if let Some(result) = lexical::score_session(&session, &regexes, filter) {
            results.push(result);
        }
    })?;

    if is_empty_query {
        results.sort_by_key(|r| std::cmp::Reverse(r.session.updated_at));
    } else {
        lexical::sort_results(&mut results);
    }
    Ok(results)
}

#[cfg(test)]
mod sqlite_search_tests {
    use super::{search_store, SearchFilter};
    use crate::models::{Session, Turn};
    use crate::parsers::cache::CacheEntry;

    fn turn(u: &str, a: &str) -> Turn {
        Turn {
            turn_id: format!("{u}-{a}"),
            user_message: u.to_string(),
            assistant_message: a.to_string(),
            timestamp: 0,
            input_tokens: None,
            output_tokens: None,
            extra_data: std::collections::HashMap::new(),
            images: None,
        }
    }

    fn session(id: &str, source: &str, updated_at: i64, thread: &str, turns: Vec<Turn>) -> Session {
        Session {
            id: id.to_string(),
            source_id: source.to_string(),
            file_path: format!("/p/{id}.jsonl"),
            timestamp: 0,
            updated_at,
            cwd: Some("/work/project".to_string()),
            thread_name: Some(thread.to_string()),
            turns,
            is_archived: false,
            is_pinned: false,
            summary: None,
            snippet: None,
            workspace_name: None,
            status: None,
            is_deleted: false,
        }
    }

    fn entry(s: &Session) -> CacheEntry {
        CacheEntry {
            file_path: s.file_path.clone(),
            last_modified: 0,
            size: 0,
            hash: s.id.clone(),
            session: s.clone(),
        }
    }

    /// A representative corpus with distinct `updated_at` values (so the (score, updated_at)
    /// sort has no ties to make the comparison order-dependent), spread across two sources.
    fn corpus() -> Vec<Session> {
        vec![
            session(
                "a",
                "codex",
                100,
                "Rayon parallel search",
                vec![turn(
                    "how do I use rayon",
                    "use rayon::prelude and par_iter",
                )],
            ),
            session(
                "b",
                "codex",
                200,
                "Crayons and colors",
                vec![turn("my kid loves crayons", "crayons are waxy")],
            ),
            session(
                "c",
                "claude",
                300,
                "SQLite migration",
                vec![
                    turn("migrate the cache to sqlite", "use rusqlite with WAL"),
                    turn("what about rayon here", "rayon is unrelated to sqlite"),
                ],
            ),
            session(
                "d",
                "claude",
                400,
                "Unrelated thread",
                vec![turn("nothing to match", "still nothing")],
            ),
        ]
    }

    /// A helper key that captures everything the frontend depends on: which sessions
    /// matched, in what order, with what score and matched-turn indexes.
    fn key(results: &[super::SearchResult]) -> Vec<(String, f32, Vec<usize>)> {
        results
            .iter()
            .map(|r| {
                (
                    r.session.id.clone(),
                    r.score,
                    r.matched_turn_indexes.clone(),
                )
            })
            .collect()
    }

    /// The core Phase 2 guarantee: searching the SQLite store returns exactly what searching
    /// the in-memory index would, for every kind of query — substring, multi-term, regex,
    /// case-sensitive, whole-word — so dropping the in-memory corpus changes nothing a user
    /// can observe.
    #[test]
    fn sqlite_search_matches_in_memory_search() {
        let temp = tempfile::tempdir().unwrap();
        let db = temp.path().join("t.db");
        let mut conn = crate::parsers::store::open(&db).unwrap();

        let sessions = corpus();
        for source in ["codex", "claude"] {
            let entries: Vec<CacheEntry> = sessions
                .iter()
                .filter(|s| s.source_id == source)
                .map(entry)
                .collect();
            crate::parsers::store::save_source(&mut conn, source, &entries).unwrap();
        }

        let cases: Vec<(&str, SearchFilter)> = vec![
            ("rayon", SearchFilter::default()),
            ("crayons", SearchFilter::default()),
            ("sqlite rayon", SearchFilter::default()), // multi-term AND
            (
                "Rayon",
                SearchFilter {
                    match_case: true,
                    ..Default::default()
                },
            ),
            (
                "rayon",
                SearchFilter {
                    whole_word: true,
                    ..Default::default()
                },
            ),
            (
                "ray.n",
                SearchFilter {
                    use_regex: true,
                    ..Default::default()
                },
            ),
            ("zzz-no-match", SearchFilter::default()),
            ("", SearchFilter::default()), // blank = list all
        ];

        for (query, filter) in cases {
            let in_memory = crate::search::lexical::lexical_search(sessions.iter(), query, &filter);
            let from_store = search_store(&conn, query, &filter).unwrap();
            assert_eq!(
                key(&from_store),
                key(&in_memory),
                "SQLite and in-memory search disagree for query {query:?}"
            );
        }
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

    fn session_of(id: &str, source_id: &str) -> Session {
        Session {
            source_id: source_id.to_string(),
            ..session_with_turns(id, 1)
        }
    }

    fn seed(state: &SearchIndexState, sessions: &[Session]) {
        let mut guard = state.sessions.write().unwrap();
        for s in sessions {
            guard.insert(s.id.clone(), s.clone());
        }
    }

    fn ids(state: &SearchIndexState) -> std::collections::HashSet<String> {
        state.sessions.read().unwrap().keys().cloned().collect()
    }

    fn observed(list: &[&str]) -> std::collections::HashSet<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    /// A complete scan that no longer sees a session removes exactly that one, leaves
    /// the source's other sessions, and never touches a different source.
    #[test]
    fn reconcile_removes_only_unobserved_of_that_source() {
        let state = SearchIndexState::new();
        seed(
            &state,
            &[
                session_of("keep", "codex"),
                session_of("gone", "codex"),
                session_of("other", "claude"),
            ],
        );

        let removed = state.reconcile_source("codex", &observed(&["keep"]), true);

        assert_eq!(removed, vec!["gone".to_string()]);
        assert_eq!(
            ids(&state),
            observed(&["keep", "other"]),
            "only the unobserved codex session is removed; claude is untouched"
        );
    }

    /// The whole point: an incomplete scan makes no deletions, even if it observed
    /// nothing. This is the guard against a transient failure wiping a source.
    #[test]
    fn reconcile_incomplete_scan_is_a_noop() {
        let state = SearchIndexState::new();
        seed(
            &state,
            &[
                session_of("a", "antigravity"),
                session_of("b", "antigravity"),
            ],
        );

        let removed = state.reconcile_source("antigravity", &observed(&[]), false);

        assert!(removed.is_empty());
        assert_eq!(
            ids(&state),
            observed(&["a", "b"]),
            "an incomplete scan must not remove anything"
        );
    }

    /// A complete scan that genuinely saw nothing does remove the source's sessions —
    /// this is the legitimate "you deleted everything" case, now expressible.
    #[test]
    fn reconcile_complete_empty_scan_removes_the_source() {
        let state = SearchIndexState::new();
        seed(
            &state,
            &[
                session_of("a", "cursor"),
                session_of("b", "cursor"),
                session_of("keep", "codex"),
            ],
        );

        let mut removed = state.reconcile_source("cursor", &observed(&[]), true);
        removed.sort();

        assert_eq!(removed, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(ids(&state), observed(&["keep"]), "other sources survive");
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
