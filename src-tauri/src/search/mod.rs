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

/// Process-wide coordination for indexing. The session data itself lives in the SQLite
/// store (`parsers::store`); this holds only the rebuild flags, progress, and the
/// short-lived status TTL cache — there is no in-memory copy of the corpus.
pub struct SearchIndexState {
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
            last_progress: RwLock::new(None),
            is_rebuilding: std::sync::atomic::AtomicBool::new(false),
            has_rebuilt: std::sync::atomic::AtomicBool::new(false),
            app_handle: RwLock::new(None),
            status_ttl_cache: RwLock::new(HashMap::new()),
        }
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

        // Each source's parse writes the SQLite store directly (via end_scan), which is
        // the single source of truth for reads. Deletion is completeness-gated inside
        // end_scan, so an incomplete scan preserves that source's sessions. There is no
        // separate in-memory index to merge into any more — the rebuild just reparses.
        let parse_start = std::time::Instant::now();
        let sources = crate::parsers::get_sources_list();

        let available_sources: Vec<_> = sources.iter().filter(|s| s.is_available()).collect();
        let total_sources = available_sources.len() as f32;
        let mut current_idx = 0;

        for source in available_sources {
            current_idx += 1;
            let pct = 0.05 + (current_idx as f32 / total_sources) * 0.70; // 5% to 75%
            emit_progress("parsing", pct, source.display_name());

            let source_start = std::time::Instant::now();
            let scan = source.parse_all_sessions().await;
            if !scan.complete {
                crate::log_warn!(
                    "[rebuild] Scan of source '{}' did not complete; its stored sessions \
                     are preserved rather than treated as deleted.",
                    source.id()
                );
            }
            crate::log_info!(
                "[rebuild] Parsed source '{}' in {:?}",
                source.id(),
                source_start.elapsed()
            );
            tokio::task::yield_now().await;
        }
        crate::log_info!("[rebuild] Total parsing time: {:?}", parse_start.elapsed());

        emit_progress("complete", 1.0, "Index rebuild complete.");
        crate::log_info!("[rebuild] Total rebuild time: {:?}", total_start.elapsed());
        self.has_rebuilt
            .store(true, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }
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
