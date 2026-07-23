use crate::models::Session;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::OnceLock;

/// One cached session plus the parse-cache metadata used to detect that its underlying file
/// changed. Persisted by [`super::store`] across the normalized `sessions`/`turns` tables;
/// this in-memory shape is what the scan lifecycle passes around.
#[derive(Clone, Debug)]
pub struct CacheEntry {
    pub file_path: String,
    pub last_modified: i64,
    pub size: i64,
    pub hash: String,
    pub session: Session,
}

/// Outcome of one full scan of a source.
///
/// `sessions` alone is ambiguous: an empty list means either "this source genuinely
/// has no sessions" or "the scan failed and observed nothing". Callers act on that
/// difference by deleting every session of the source, so the distinction must be
/// carried explicitly rather than inferred.
#[derive(Debug, Clone)]
pub struct ScanResult {
    pub sessions: Vec<Session>,
    /// True only when the scan enumerated the whole source without error. When false,
    /// `sessions` may be partial and must never be used to conclude anything was
    /// deleted.
    pub complete: bool,
}

impl ScanResult {
    /// The scan enumerated the source to completion; `sessions` is authoritative.
    pub fn complete(sessions: Vec<Session>) -> Self {
        Self {
            sessions,
            complete: true,
        }
    }

    /// The scan could not enumerate the source (unreadable dir, early return, or a
    /// concurrent scan still in flight). `sessions` is best-effort only.
    pub fn partial(sessions: Vec<Session>) -> Self {
        Self {
            sessions,
            complete: false,
        }
    }

    /// The scan produced nothing usable.
    pub fn failed() -> Self {
        Self {
            sessions: Vec::new(),
            complete: false,
        }
    }
}

pub struct SessionCacheManager {
    // source_id -> (file_path -> CacheEntry)
    active_caches: Mutex<HashMap<String, HashMap<String, CacheEntry>>>,
    // source_id -> seen file_paths
    seen_paths: Mutex<HashMap<String, HashSet<String>>>,
    // source_id -> number of scans currently in flight for that source.
    //
    // `parse_all_sessions` is reachable from two independent subsystems (the index
    // rebuild and the file watcher), neither of which excludes the other, so scans of
    // the same source do overlap. Without this counter the second `start_scan` wiped
    // the first scan's `seen` set and the first `end_scan` tore down the shared state,
    // which made the loser return zero sessions and marked live sessions `is_deleted`.
    scan_depth: Mutex<HashMap<String, usize>>,
    hit_counter: Mutex<HashMap<String, usize>>,
    miss_counter: Mutex<HashMap<String, usize>>,
}

static CACHE_MANAGER: OnceLock<SessionCacheManager> = OnceLock::new();

pub fn get_cache_manager() -> &'static SessionCacheManager {
    CACHE_MANAGER.get_or_init(|| SessionCacheManager {
        active_caches: Mutex::new(HashMap::new()),
        seen_paths: Mutex::new(HashMap::new()),
        scan_depth: Mutex::new(HashMap::new()),
        hit_counter: Mutex::new(HashMap::new()),
        miss_counter: Mutex::new(HashMap::new()),
    })
}

impl SessionCacheManager {
    pub fn clear_in_memory_caches(&self) {
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.clear();
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.clear();
        }
        if let Ok(mut depth_guard) = self.scan_depth.lock() {
            depth_guard.clear();
        }
    }

    /// Drops the per-source scan working state (in-memory cache map + seen set).
    fn clear_scan_state(&self, source_id: &str) {
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.remove(source_id);
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.remove(source_id);
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
        if let Ok(mut depth_guard) = self.scan_depth.lock() {
            depth_guard.clear();
        }
        if let Some(conn) = self.open_db() {
            if let Err(e) = crate::parsers::store::clear_all(&conn) {
                crate::log_error!("[cache] Failed to clear session store: {}", e);
            }
        }
        // Best-effort removal of the pre-SQLite JSON caches, so they stop wasting disk
        // once the store has taken over. Harmless if already gone.
        if let Ok(entries) = fs::read_dir(self.get_cache_dir()) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json")
                    && path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with("cache_"))
                        .unwrap_or(false)
                {
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

    /// Path of the SQLite session store. Derived from the current home on every call so
    /// tests that switch `CODEOBA_MOCK_HOME` stay isolated (see the fresh-connection note
    /// on `open_db`).
    fn db_path(&self) -> PathBuf {
        self.get_cache_dir().join("sessions.db")
    }

    /// Opens a fresh connection to the session store.
    ///
    /// A fresh connection per call (rather than a cached one) is deliberate: the store is
    /// touched only twice per source per scan — `load_cache` at `start_scan` and
    /// `save_cache` at `end_scan` — so open cost is negligible, and it keeps the path
    /// re-derived from the current home, which the tests rely on when they point
    /// `CODEOBA_MOCK_HOME` at a temp dir. Returns `None` (and logs) if the store cannot be
    /// opened, so a storage failure degrades gracefully instead of panicking.
    pub fn open_db(&self) -> Option<rusqlite::Connection> {
        let path = self.db_path();
        match crate::parsers::store::open(&path) {
            Ok(conn) => Some(conn),
            Err(e) => {
                crate::log_error!("[cache] Failed to open session store at {:?}: {}", path, e);
                None
            }
        }
    }

    pub fn load_cache(&self, source_id: &str) -> HashMap<String, CacheEntry> {
        let _start = std::time::Instant::now();
        let conn = match self.open_db() {
            Some(c) => c,
            None => return HashMap::new(),
        };
        match crate::parsers::store::load_source(&conn, source_id) {
            Ok(map) => {
                crate::log_debug!(
                    "[load_cache] Loaded {} cached sessions for '{}' in {:?}",
                    map.len(),
                    source_id,
                    _start.elapsed()
                );
                map
            }
            Err(e) => {
                crate::log_error!("[cache] Failed to load sessions for '{}': {}", source_id, e);
                HashMap::new()
            }
        }
    }

    fn save_cache(&self, source_id: &str, entries: Vec<CacheEntry>) {
        let mut conn = match self.open_db() {
            Some(c) => c,
            None => return,
        };
        if let Err(e) = crate::parsers::store::save_source(&mut conn, source_id, &entries) {
            crate::log_error!("[cache] Failed to save sessions for '{}': {}", source_id, e);
        }
    }

    /// Begins (or joins) a scan of `source_id`.
    ///
    /// Only the outermost scan initializes the shared state. A scan that starts while
    /// another is already in flight joins it: both accumulate into the same `seen` set,
    /// and finalization is deferred to whichever finishes last, so the set is always
    /// complete before it is used to decide what was deleted.
    pub fn start_scan(&self, source_id: &str) {
        let is_outermost = {
            match self.scan_depth.lock() {
                Ok(mut depth_guard) => {
                    let depth = depth_guard.entry(source_id.to_string()).or_insert(0);
                    *depth += 1;
                    *depth == 1
                }
                // A poisoned lock must not silently reset another scan's state.
                Err(_) => false,
            }
        };

        if !is_outermost {
            crate::log_debug!(
                "[cache] Scan for '{}' joined an in-flight scan; not resetting scan state.",
                source_id
            );
            return;
        }

        let cache_map = self.load_cache(source_id);
        if let Ok(mut active_guard) = self.active_caches.lock() {
            active_guard.insert(source_id.to_string(), cache_map);
        }
        if let Ok(mut seen_guard) = self.seen_paths.lock() {
            seen_guard.insert(source_id.to_string(), HashSet::new());
        }
    }

    /// Records that a source's root is gone or unreadable — an uninstall, or revoked
    /// access, which for our purposes is the same thing.
    ///
    /// Unlike a mid-walk read error (which only makes a scan *partial*, so it must not
    /// delete), an inaccessible root is authoritative: from here the source has no
    /// sessions. This runs an empty *completed* scan so the normal `end_scan` policy
    /// applies — every cached session is marked `is_deleted` (soft), and hard-removed only
    /// when `prune_deleted_sessions` is on. A later scan that finds the root again clears
    /// the flag, because `end_scan` recomputes `is_deleted` from what it sees.
    ///
    /// If a real scan of the same source is concurrently in flight, the `scan_depth`
    /// reference count turns this into a deferred, non-authoritative finalize, so it can
    /// never delete out from under a live scan.
    pub fn scan_absent_source(&self, source_id: &str) -> ScanResult {
        self.start_scan(source_id);
        self.end_scan(source_id, true)
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

    /// Finalizes (or defers) the scan of `source_id`.
    ///
    /// `enumeration_complete` is the caller's report of whether it managed to walk the
    /// whole source. Deletion detection here works by absence -- an entry not in `seen`
    /// is presumed gone -- which is only sound when the walk actually completed. A
    /// caller that hit an unreadable directory or returned early must pass false, and
    /// no session will be marked deleted.
    pub fn end_scan(&self, source_id: &str, enumeration_complete: bool) -> ScanResult {
        // Only the last scan still in flight for this source may finalize. An inner
        // scan returns what is currently cached rather than an empty Vec: returning
        // nothing here is what made a whole source vanish from the sidebar, because
        // the rebuild treated "no sessions" as "everything was deleted".
        let is_outermost = {
            match self.scan_depth.lock() {
                Ok(mut depth_guard) => {
                    let remaining = match depth_guard.get_mut(source_id) {
                        Some(d) => {
                            *d = d.saturating_sub(1);
                            *d
                        }
                        None => 0,
                    };
                    if remaining == 0 {
                        depth_guard.remove(source_id);
                    }
                    remaining == 0
                }
                Err(_) => true,
            }
        };

        if !is_outermost {
            crate::log_debug!(
                "[cache] Scan for '{}' finished while another is still in flight; \
                 deferring finalization.",
                source_id
            );
            if let Ok(active_guard) = self.active_caches.lock() {
                if let Some(cache_map) = active_guard.get(source_id) {
                    return ScanResult::partial(
                        cache_map.values().map(|e| e.session.clone()).collect(),
                    );
                }
            }
            return ScanResult::failed();
        }

        // The caller could not enumerate the source, so absence proves nothing. Report
        // what is cached and leave the cache exactly as it was.
        if !enumeration_complete {
            crate::log_warn!(
                "[cache] Scan for '{}' did not complete enumeration; preserving cache \
                 and skipping deletion detection.",
                source_id
            );
            let sessions = if let Ok(active_guard) = self.active_caches.lock() {
                active_guard
                    .get(source_id)
                    .map(|m| m.values().map(|e| e.session.clone()).collect())
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            self.clear_scan_state(source_id);
            return ScanResult::partial(sessions);
        }

        let entries_to_save = {
            let mut active_guard = match self.active_caches.lock() {
                Ok(g) => g,
                Err(_) => return ScanResult::failed(),
            };
            let seen_guard = match self.seen_paths.lock() {
                Ok(g) => g,
                Err(_) => return ScanResult::failed(),
            };

            let cache_map = match active_guard.get_mut(source_id) {
                Some(m) => m,
                None => return ScanResult::failed(),
            };
            let seen = match seen_guard.get(source_id) {
                Some(s) => s,
                None => return ScanResult::failed(),
            };

            let prune_deleted = crate::config::load_fallback_config()
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

        ScanResult::complete(
            entries_to_save
                .into_iter()
                .map(|entry| entry.session)
                .collect(),
        )
    }
}

/// Whether a source's root directory can be enumerated right now.
///
/// `false` means the source is gone or inaccessible — missing, not a directory, or a
/// permission failure reading it — which callers treat as "this source has no sessions"
/// (see `SessionCacheManager::scan_absent_source`). This is deliberately distinct from a
/// failure deeper in the walk, which only makes a scan partial and must never delete.
pub fn source_root_readable(dir: &Path) -> bool {
    dir.is_dir() && fs::read_dir(dir).is_ok()
}

pub fn calculate_file_md5<P: AsRef<Path>>(path: P) -> String {
    if let Ok(bytes) = fs::read(path) {
        let digest = md5::compute(&bytes);
        format!("{:x}", digest)
    } else {
        String::new()
    }
}

#[cfg(test)]
mod scan_lifecycle_tests {
    use super::get_cache_manager;
    use crate::models::Session;

    fn session(id: &str, source_id: &str) -> Session {
        Session {
            id: id.to_string(),
            source_id: source_id.to_string(),
            file_path: format!("/home/{id}.jsonl"),
            timestamp: 0,
            updated_at: 1,
            cwd: None,
            thread_name: Some("t".to_string()),
            turns: vec![crate::models::Turn {
                turn_id: "t0".to_string(),
                user_message: "u".to_string(),
                assistant_message: "a".to_string(),
                timestamp: 0,
                input_tokens: None,
                output_tokens: None,
                extra_data: std::collections::HashMap::new(),
                images: None,
            }],
            is_archived: false,
            is_pinned: false,
            summary: None,
            snippet: None,
            workspace_name: None,
            status: None,
            is_deleted: false,
        }
    }

    fn put(source: &str, path: &str, id: &str) {
        get_cache_manager().put_cached_session(source, path, 0, 0, "h", session(id, source));
    }

    /// The core race: a second scan starting mid-flight used to wipe the first scan's
    /// `seen` set, and whichever `end_scan` ran first tore down the shared state so the
    /// other returned zero sessions. Now the inner scan joins, and the inner `end_scan`
    /// reports the cached sessions instead of nothing.
    #[test]
    fn overlapping_scans_do_not_lose_sessions() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let mgr = get_cache_manager();
        mgr.clear_in_memory_caches();

        let src = "race_src";
        // Outer scan (e.g. the index rebuild) starts and sees one file.
        mgr.start_scan(src);
        put(src, "/home/a.jsonl", "a");

        // Inner scan (e.g. a watcher event) starts while the outer is still running.
        mgr.start_scan(src);
        put(src, "/home/b.jsonl", "b");

        // The inner scan finishing must NOT finalize, and must not report nothing.
        let inner = mgr.end_scan(src, true);
        assert!(
            !inner.sessions.is_empty(),
            "an inner scan must report cached sessions, not an empty list"
        );
        assert!(
            !inner.complete,
            "an inner scan is not authoritative and must not claim completeness"
        );

        // The outer scan finalizes with the union of what both saw.
        let outer = mgr.end_scan(src, true);
        assert!(outer.complete, "the outermost scan finalizes");
        let ids: Vec<String> = outer.sessions.iter().map(|s| s.id.clone()).collect();
        assert!(
            ids.contains(&"a".to_string()) && ids.contains(&"b".to_string()),
            "both scans' files must survive, got {ids:?}"
        );
        assert!(
            outer.sessions.iter().all(|s| !s.is_deleted),
            "no live session may be marked deleted by overlapping scans"
        );

        mgr.clear_in_memory_caches();
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// A scan that could not enumerate the source proves nothing by absence, so it must
    /// leave the cache untouched.
    #[test]
    fn incomplete_scan_preserves_cache() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let mgr = get_cache_manager();
        mgr.clear_in_memory_caches();

        let src = "incomplete_src";
        mgr.start_scan(src);
        put(src, "/home/a.jsonl", "a");
        assert!(mgr.end_scan(src, true).complete);

        // A scan that failed to enumerate: sees nothing, reports incomplete.
        mgr.start_scan(src);
        let result = mgr.end_scan(src, false);

        assert!(!result.complete);
        assert_eq!(
            result.sessions.len(),
            1,
            "an incomplete scan must preserve the cached session"
        );
        assert!(
            result.sessions.iter().all(|s| !s.is_deleted),
            "an incomplete scan must not mark sessions deleted"
        );

        mgr.clear_in_memory_caches();
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// The other half, and the point of making completeness explicit: a scan that DID
    /// enumerate the source and genuinely found nothing is authoritative, and its
    /// absences are real deletions.
    #[test]
    fn complete_scan_seeing_nothing_marks_deleted() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let mgr = get_cache_manager();
        mgr.clear_in_memory_caches();

        let src = "emptied_src";
        mgr.start_scan(src);
        put(src, "/home/a.jsonl", "a");
        assert!(mgr.end_scan(src, true).complete);

        // The user really did delete everything; the scan completed and saw no files.
        mgr.start_scan(src);
        let result = mgr.end_scan(src, true);

        assert!(result.complete);
        assert!(
            result.sessions.iter().all(|s| s.is_deleted),
            "a completed scan that saw nothing must mark its orphans deleted"
        );

        mgr.clear_in_memory_caches();
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// scan_absent_source is the "the source's root is gone/unreadable" entry point used
    /// by the adapters. It must behave like a completed scan that saw nothing: the cached
    /// sessions come back marked deleted (soft), so an uninstalled source moves to the
    /// Deleted filter rather than lingering as if live.
    #[test]
    fn absent_source_soft_deletes_cached_sessions() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let mgr = get_cache_manager();
        mgr.clear_in_memory_caches();

        let src = "absent_src";
        // Persist a session via a normal completed scan.
        mgr.start_scan(src);
        put(src, "/home/a.jsonl", "a");
        let seeded = mgr.end_scan(src, true);
        assert_eq!(seeded.sessions.len(), 1);
        assert!(!seeded.sessions[0].is_deleted);

        // Now the root is gone.
        let result = mgr.scan_absent_source(src);

        assert!(
            result.complete,
            "an absent source is an authoritative result"
        );
        assert_eq!(
            result.sessions.len(),
            1,
            "the session is kept (soft delete)"
        );
        assert!(
            result.sessions[0].is_deleted,
            "an absent source marks its cached sessions deleted"
        );

        mgr.clear_in_memory_caches();
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}
