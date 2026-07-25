use crate::parsers::get_sources_list;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Guards the background verification loop so it is spawned once per process. `start_watcher`
/// runs at startup and again on every source-decision change; without this each call would leak
/// another permanent 5-second polling task.
static PERIODIC_LOOP_STARTED: AtomicBool = AtomicBool::new(false);

/// Guards the status heartbeat so it is spawned once per process.
static STATUS_HEARTBEAT_STARTED: AtomicBool = AtomicBool::new(false);

/// A session's status can change with no filesystem event behind it: when an
/// agent process exits or crashes, nothing is written, so the session-updated
/// push channel never fires and the session would sit on a stale "active"
/// forever. The frontend used to cover this by polling get_session_statuses
/// every 2s, which rebuilt and re-serialized a status map for every session in
/// the index on every tick — even when nothing had changed, which is almost
/// always.
///
/// Inverted here: resolve statuses on this side and emit only the ids whose
/// status actually flipped. A quiet app now sends nothing at all.
pub fn start_status_heartbeat<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) {
    if STATUS_HEARTBEAT_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        // Seeded empty, so the first tick emits the current status of every
        // session once. The frontend merge is a no-op when nothing differs.
        let mut last: HashMap<String, String> = HashMap::new();

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            let statuses = match crate::commands::compute_session_statuses(&app_handle) {
                Ok(s) => s,
                Err(_e) => {
                    crate::log_debug!("[StatusHeartbeat] skipped tick: {}", _e);
                    continue;
                }
            };

            let mut changed: HashMap<String, String> = HashMap::new();
            for (id, status) in &statuses {
                if last.get(id) != Some(status) {
                    changed.insert(id.clone(), status.clone());
                }
            }
            // Replacing wholesale also drops ids that left the index, so a
            // removed session cannot leave a stale entry behind.
            last = statuses;

            if !changed.is_empty() {
                crate::log_debug!(
                    "[StatusHeartbeat] emitting {} status change(s)",
                    changed.len()
                );
                let _ = app_handle.emit("session-status-changed", &changed);
            }
        }
    });
}

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub last_generations: Mutex<HashMap<String, u64>>,
    pub watched_inodes: Mutex<HashMap<PathBuf, u64>>,
    pub detected_sources: Mutex<HashSet<String>>,
    pub last_file_hashes: Mutex<HashMap<String, u64>>,
}

/// The session currently open in the detail pane, if any. Set by the frontend on
/// selection; read here to decide who is worth shipping full turns to.
pub struct SelectedSessionState(pub Mutex<Option<String>>);

/// Fan a session change out on two channels.
///
/// The sidebar list only ever renders metadata and a snippet — get_all_sessions
/// has always served it `to_lightweight()`. But the watcher was pushing FULL
/// sessions (every turn's message text, plus images) into that same list on every
/// write an agent makes, so a long conversation re-serialized its entire history
/// through the IPC boundary several times a second to update a row that shows a
/// title and a timestamp.
///
/// So: `session-updated` always carries a lightweight payload and drives the list.
/// `session-updated-full` carries real turns and is emitted only for the session
/// the detail pane has open, so live streaming of the visible conversation keeps
/// working. Splitting the channels also makes the frontend race-proof — a stale
/// selection on this side can only cost the detail pane one skipped tick, it can
/// never blank an open conversation by handing it a lightweight copy.
fn emit_session_update<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    session: &crate::models::Session,
) {
    let _ = app_handle.emit("session-updated", &session.to_lightweight());

    let is_selected = match app_handle.try_state::<SelectedSessionState>() {
        Some(state) => match state.0.lock() {
            Ok(guard) => guard.as_deref() == Some(session.id.as_str()),
            Err(_) => false,
        },
        None => false,
    };

    if is_selected {
        let _ = app_handle.emit("session-updated-full", session);
    }
}

fn is_directory_not_empty(path: &Path) -> bool {
    if let Ok(mut entries) = std::fs::read_dir(path) {
        entries.next().is_some()
    } else {
        false
    }
}

/// Reparses `source_id` off disk (the store is authoritative and the parse writes it) and
/// emits exactly the live events implied by what changed.
///
/// The store fingerprint of every session in the source is captured BEFORE the parse and
/// again AFTER, then diffed:
///   - new or changed (content, soft-delete, or archival) → `session-updated` (a
///     soft-deleted session carries is_deleted=true, so the frontend moves it to Deleted);
///   - gone from the store entirely (pruned) → `session-deleted`.
///
/// Because deletion detection now reads the store's actual post-scan state rather than the
/// scan's return value, an incomplete scan — a missing/unreadable directory, or a deeper
/// read failure — leaves the store unchanged (`end_scan` is completeness-gated), so
/// `after == before` and nothing is spuriously deleted. This replaces the old
/// update_session + reconcile_source pair, which diffed against a separate in-memory index.
async fn reindex_source_and_emit<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    source_id: &str,
) {
    use crate::parsers::store;
    let mgr = crate::parsers::cache::get_cache_manager();

    let before = mgr
        .open_db()
        .and_then(|c| store::session_states(&c, source_id).ok())
        .unwrap_or_default();

    let sources = get_sources_list();
    let src = match sources.iter().find(|s| s.id() == source_id) {
        Some(s) => s,
        None => return,
    };
    let scan = src.parse_all_sessions().await;

    let after = mgr
        .open_db()
        .and_then(|c| store::session_states(&c, source_id).ok())
        .unwrap_or_default();

    // Full session objects, keyed by id, for the session-updated payload.
    let scan_map: HashMap<String, crate::models::Session> = scan
        .sessions
        .into_iter()
        .map(|s| (s.id.clone(), s))
        .collect();

    for (id, after_state) in &after {
        if before.get(id) != Some(after_state) {
            if let Some(session) = scan_map.get(id) {
                emit_session_update(app_handle, session);
            }
        }
    }

    let idx_state = app_handle.state::<crate::search::SearchIndexState>();
    let mut pruned = 0;
    for id in before.keys() {
        if !after.contains_key(id) {
            let _ = app_handle.emit("session-deleted", id);
            if let Ok(mut ttl) = idx_state.status_ttl_cache.write() {
                ttl.remove(id);
            }
            pruned += 1;
        }
    }
    if pruned > 0 {
        crate::log_info!("Pruned {} sessions for source: {}", pruned, source_id);
    }
}

/// Fire-and-forget [`reindex_source_and_emit`] on the async runtime.
fn spawn_reindex_source<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>, source_id: String) {
    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        reindex_source_and_emit(&app_handle, &source_id).await;
    });
}

pub fn check_and_restore_watched_paths<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    let sources = get_sources_list();
    let state = app_handle.state::<WatcherState>();
    let decisions = crate::parsers::source_decisions::load_source_decisions();

    let mut guard = match state.watcher.lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    let watcher = match &mut *guard {
        Some(w) => w,
        None => return,
    };

    // 1. Passive addition detection for "ask" sources
    for source in sources {
        let decision = decisions
            .get(source.id())
            .map(|s| s.as_str())
            .unwrap_or("ask");
        if decision == "ask" {
            let mut detected = false;
            for path in source.get_watch_paths() {
                let p = Path::new(&path);
                let watch_target = if p.extension().is_some() {
                    p.parent().map(|parent| parent.to_path_buf())
                } else {
                    Some(p.to_path_buf())
                };
                if let Some(target) = watch_target {
                    if target.exists() && is_directory_not_empty(&target) {
                        detected = true;
                        break;
                    }
                }
            }

            if detected {
                let mut detected_guard = match state.detected_sources.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };
                if !detected_guard.contains(source.id()) {
                    crate::log_info!("Passively detected installation of source: {}", source.id());
                    detected_guard.insert(source.id().to_string());
                    let _ = app_handle.emit("source-detected", source.id());
                }
            }
        }
    }

    // 2. Collect all expected watch targets for allowed sources
    let mut targets = Vec::new();
    for source in sources {
        let decision = decisions
            .get(source.id())
            .map(|s| s.as_str())
            .unwrap_or("ask");
        if decision != "allow" {
            continue;
        }
        for path in source.get_watch_paths() {
            let p = Path::new(&path);
            let watch_target = if p.extension().is_some() {
                p.parent().map(|parent| parent.to_path_buf())
            } else {
                Some(p.to_path_buf())
            };
            if let Some(target) = watch_target {
                targets.push((source.id().to_string(), target));
            }
        }
    }

    // Deduplicate watch targets (shortest path wins)
    targets.sort_by_key(|(_, p)| p.as_os_str().len());
    let mut unique_targets = Vec::new();
    for (src_id, p) in targets {
        if !unique_targets
            .iter()
            .any(|(_, u): &(String, PathBuf)| p.starts_with(u))
        {
            unique_targets.push((src_id, p));
        }
    }

    // Check existing watches and rebind or unwatch if deleted
    for (source_id, target) in unique_targets {
        let exists = target.exists();
        let mut current_ino = 0;
        if exists {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if let Ok(meta) = target.metadata() {
                    current_ino = meta.ino();
                }
            }
            #[cfg(not(unix))]
            {
                if let Ok(meta) = target.metadata() {
                    if let Ok(created) = meta.created() {
                        if let Ok(duration) =
                            created.duration_since(std::time::SystemTime::UNIX_EPOCH)
                        {
                            current_ino = duration.as_nanos() as u64;
                        }
                    }
                }
            }
        }

        let stored_ino = if let Ok(inodes_guard) = state.watched_inodes.lock() {
            inodes_guard.get(&target).copied()
        } else {
            None
        };

        if !exists {
            // Target is missing. Rather than delete straight from this event, unwatch and
            // rescan: the rescan sees the root is gone and reports a completed scan of an
            // absent source, so its sessions are marked deleted (soft; hard only under
            // prune) through the one reconciliation path -- the same outcome the old
            // inline removal produced, but funneled through a single, completeness-gated
            // authority so a *present* directory whose scan merely came back short can
            // never wipe the source. DO NOT recreate the watch here.
            let has_sessions = crate::parsers::cache::get_cache_manager()
                .open_db()
                .and_then(|c| crate::parsers::store::source_has_sessions(&c, &source_id).ok())
                .unwrap_or(false);

            if stored_ino.is_some() || has_sessions {
                crate::log_info!(
                    "Monitored directory missing: {:?}. Unwatching and rescanning source: {}",
                    target,
                    source_id
                );
                let _ = watcher.unwatch(&target);
                if let Ok(mut inodes_guard) = state.watched_inodes.lock() {
                    inodes_guard.remove(&target);
                }
                spawn_reindex_source(app_handle, source_id.clone());
            }
        } else if stored_ino != Some(current_ino) {
            // Inode mismatch or not registered yet, start/restore watch
            crate::log_info!("Monitored directory state changed (stored={:?}, current={:?}) for target: {:?}. Watching directory...", stored_ino, current_ino, target);
            let _ = watcher.unwatch(&target);
            let _ = watcher.watch(&target, RecursiveMode::Recursive);
            if let Ok(mut inodes_guard) = state.watched_inodes.lock() {
                inodes_guard.insert(target.clone(), current_ino);
            }

            // Reload through the reindex helper. The rescan is authoritative; deletions
            // come only from the store's completeness-checked post-scan state, not from the
            // inode change itself (which also fires on legitimate log rotation). This
            // replaces an inline clear-then-reload that dropped every session of the source
            // before the reload, leaving it empty if the reload came back short.
            spawn_reindex_source(app_handle, source_id.clone());
        }
    }
}

pub fn start_watcher<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<(), String> {
    crate::log_debug!("[Watcher] start_watcher called");
    let sources = get_sources_list();
    let decisions = crate::parsers::source_decisions::load_source_decisions();
    let mut targets = Vec::new();

    for source in sources {
        let decision = decisions
            .get(source.id())
            .map(|s| s.as_str())
            .unwrap_or("ask");
        if decision != "allow" {
            continue;
        }

        for path in source.get_watch_paths() {
            let p = Path::new(&path);
            let watch_target = if p.extension().is_some() {
                p.parent().map(|parent| parent.to_path_buf())
            } else {
                Some(p.to_path_buf())
            };
            if let Some(target) = watch_target {
                if target.exists() {
                    targets.push(target);
                }
            }
        }
    }

    // Deduplicate watch targets (shortest path wins, subdirectories are ignored to prevent overlapping FSEvents conflicts)
    targets.sort_by_key(|p| p.as_os_str().len());
    let mut unique_targets = Vec::new();
    for p in targets {
        if !unique_targets.iter().any(|u| p.starts_with(u)) {
            unique_targets.push(p);
        }
    }

    let handle_clone = app_handle.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        match res {
            Ok(event) => {
                // Filter for file writes, creations, or deletions
                if is_relevant_event(&event.kind) {
                    for path in event.paths {
                        handle_file_change(&handle_clone, &path);
                    }
                }
            }
            Err(e) => {
                crate::log_error!("Watcher error: {:?}", e);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let state = app_handle.state::<WatcherState>();

    // Clear watched inodes and start new watches
    if let Ok(mut inodes_guard) = state.watched_inodes.lock() {
        inodes_guard.clear();
    }

    for path in &unique_targets {
        if path.exists() {
            let _ = watcher.watch(path, RecursiveMode::Recursive);

            // Get new inode and store it
            let mut new_ino = 0;
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if let Ok(meta) = path.metadata() {
                    new_ino = meta.ino();
                }
            }
            #[cfg(not(unix))]
            {
                if let Ok(meta) = path.metadata() {
                    if let Ok(created) = meta.created() {
                        if let Ok(duration) =
                            created.duration_since(std::time::SystemTime::UNIX_EPOCH)
                        {
                            new_ino = duration.as_nanos() as u64;
                        }
                    }
                }
            }
            if let Ok(mut inodes_guard) = state.watched_inodes.lock() {
                inodes_guard.insert(path.clone(), new_ino);
            }
        }
    }

    // Save the watcher in Tauri state so it doesn't get dropped
    if let Ok(mut guard) = state.watcher.lock() {
        *guard = Some(watcher);
    }

    // Spawn the background verify/passive-detection loop exactly once for the process. The loop
    // re-reads source decisions and rebinds watches each tick, so a single instance stays correct
    // as sources are toggled — re-spawning it on every start_watcher call would just leak tasks.
    if !PERIODIC_LOOP_STARTED.swap(true, Ordering::SeqCst) {
        let handle_periodic = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                check_and_restore_watched_paths(&handle_periodic);
            }
        });
    }
    crate::log_debug!(
        "[Watcher] start_watcher finished successfully, unique_targets: {:?}",
        unique_targets
    );
    Ok(())
}

/// Drop sessions the adapter has since decided must not be indexed.
///
/// A subagent's transcript can be parsed before its parent's INVOKE_SUBAGENT step
/// is seen, in which case it is indexed and pushed to the sidebar before anything
/// knows it is a subagent. The moment the parent is parsed the relationship is
/// known, so evict the child here rather than leaving it visible until the next
/// full rebuild.
///
/// Positive identification (the adapter names the ids to remove), not absence within a
/// scan, so this hard-removes from the store directly rather than going through the
/// completeness-gated reindex path.
fn evict_excluded_sessions<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    source_id: &str,
    excluded: HashSet<String>,
) {
    if excluded.is_empty() {
        return;
    }

    let mut conn = match crate::parsers::cache::get_cache_manager().open_db() {
        Some(c) => c,
        None => return,
    };

    // Only the ids actually present are worth an event; check, then hard-delete.
    let present: Vec<String> = excluded
        .iter()
        .filter(|id| {
            // Scoped by source_id to match the delete below; `id` alone is not unique
            // across sources by design (see the store module docs).
            conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sessions WHERE source_id = ?1 AND id = ?2)",
                rusqlite::params![source_id, id],
                |r| r.get::<_, i64>(0),
            )
            .map(|n| n != 0)
            .unwrap_or(false)
        })
        .cloned()
        .collect();
    if present.is_empty() {
        return;
    }

    if let Err(e) = crate::parsers::store::delete_sessions(&mut conn, source_id, &present) {
        crate::log_error!("[evict] Failed to delete subagent sessions: {}", e);
        return;
    }

    for id in &present {
        crate::log_debug!("Evicting subagent session from store: {}", id);
        let _ = app_handle.emit("session-deleted", id);
    }
}

fn is_relevant_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any
            | EventKind::Modify(_)
            | EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Other
    )
}

fn compute_file_hash(path: &Path) -> Option<u64> {
    use std::hash::Hasher;
    if let Ok(bytes) = std::fs::read(path) {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        hasher.write(&bytes);
        Some(hasher.finish())
    } else {
        None
    }
}

fn handle_file_change<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>, path: &Path) {
    let path_str = path.to_string_lossy();
    let sources = get_sources_list();

    for source in sources {
        let watch_paths = source.get_watch_paths();
        let in_watched_path = watch_paths.iter().any(|p| path_str.starts_with(p));

        let matches_filter = if in_watched_path {
            source.is_file_change_relevant(&path_str)
        } else {
            false
        };

        // Also detect directory modifications/creations inside source's watched paths
        let is_dir_change = path.is_dir() && in_watched_path;

        if matches_filter || is_dir_change {
            let file_path = path_str.to_string();
            let app_handle_clone = app_handle.clone();
            let source_id = source.id().to_string();

            // Get next generation count for this file to debounce
            let state = app_handle.state::<WatcherState>();
            let gen = if let Ok(mut guard) = state.last_generations.lock() {
                let entry = guard.entry(file_path.clone()).or_insert(0);
                *entry += 1;
                *entry
            } else {
                0
            };

            if gen == 0 {
                return;
            }

            tauri::async_runtime::spawn(async move {
                // Sleep to debounce rapid sequential filesystem events (e.g. 500ms)
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                // Check if this generation is still the latest one
                let state = app_handle_clone.state::<WatcherState>();
                let is_latest = if let Ok(mut guard) = state.last_generations.lock() {
                    let latest = guard.get(&file_path) == Some(&gen);
                    if latest {
                        guard.remove(&file_path);
                    }
                    latest
                } else {
                    false
                };

                if is_latest {
                    // Re-fetch the sources list to find the matching source adapter
                    let sources = get_sources_list();
                    if let Some(src) = sources.iter().find(|s| s.id() == source_id) {
                        let is_db = file_path.ends_with(".sqlite")
                            || file_path.ends_with(".vscdb")
                            || file_path.ends_with("-wal")
                            || file_path.ends_with("-shm")
                            || file_path.ends_with(".pb")
                            || file_path.ends_with(".pbtxt")
                            || file_path.ends_with("session_index.jsonl")
                            || file_path.ends_with("workspace.yaml");

                        let path_obj = Path::new(&file_path);
                        let is_dir = path_obj.is_dir();

                        if is_db || is_dir {
                            let path_obj = Path::new(&file_path);
                            if path_obj.is_file() {
                                if let Some(hash) = compute_file_hash(path_obj) {
                                    let state = app_handle_clone.state::<WatcherState>();
                                    let is_dup = {
                                        if let Ok(mut hashes_guard) = state.last_file_hashes.lock()
                                        {
                                            if hashes_guard.get(&file_path) == Some(&hash) {
                                                true
                                            } else {
                                                hashes_guard.insert(file_path.clone(), hash);
                                                false
                                            }
                                        } else {
                                            false
                                        }
                                    };
                                    if is_dup {
                                        return;
                                    }
                                }
                            }

                            // debug: this fires on every write an agent makes to a
                            // DB-backed source. At info level a single live session
                            // buried the log.
                            crate::log_debug!(
                                "Database file changed ({}). Reloading all sessions for {}...",
                                file_path,
                                src.display_name()
                            );
                            // Reparse the whole source and emit exactly what changed,
                            // diffing the store's pre- and post-scan state. This is the one
                            // reconciliation path: it reparses (writing the store),
                            // emits session-updated for new/changed/soft-deleted sessions
                            // and session-deleted for pruned ones, and never deletes on an
                            // incomplete scan.
                            reindex_source_and_emit(&app_handle_clone, &source_id).await;

                            // The reparse above refreshed the parent->child map, so a
                            // subagent indexed before its parent was known can be dropped
                            // now (positive identification, so not part of reindex).
                            evict_excluded_sessions(
                                &app_handle_clone,
                                &source_id,
                                src.excluded_session_ids(),
                            );
                        } else if !Path::new(&file_path).exists() {
                            // A watched file is gone. Reindex the whole source: the missing
                            // file's session is soft-deleted by the completeness-gated scan
                            // and reindex emits the right event (moved to Deleted, or
                            // session-deleted if pruned). A full reparse is fine here —
                            // deletions are far rarer than edits.
                            crate::log_info!(
                                "Session file deleted: {}. Reindexing source {}...",
                                file_path,
                                source_id
                            );
                            reindex_source_and_emit(&app_handle_clone, &source_id).await;
                        } else {
                            // A single file changed. Parse just that file (the parse writes
                            // the store) and emit its update — no full-source rescan on every
                            // edit.
                            let parsed = src.parse_session(&file_path).await;

                            // Deliberately outside the `if let` below, because it must run
                            // whether or not this file yielded a session: parsing a PARENT
                            // is what reveals its children, and parsing a known subagent
                            // yields None while that child may still be indexed from an
                            // earlier tick.
                            evict_excluded_sessions(
                                &app_handle_clone,
                                &source_id,
                                src.excluded_session_ids(),
                            );

                            if let Some(session) = parsed {
                                crate::log_debug!(
                                    "Session file updated: {}. Emitting session-updated...",
                                    file_path
                                );
                                emit_session_update(&app_handle_clone, &session);
                            }
                        }
                    }
                }
            });
            break;
        }
    }
}

#[cfg(test)]
mod watcher_tests {
    use super::*;
    use crate::models::{Session, Turn};
    use crate::parsers::SourceAdapter;
    use crate::search::SearchIndexState;

    /// Seeds a session into the SQLite store (which is now the index). Requires
    /// CODEOBA_MOCK_HOME to point at the test's temp home.
    fn seed_store(source_id: &str, session: Session) {
        let mut conn = crate::parsers::cache::get_cache_manager()
            .open_db()
            .unwrap();
        let entry = crate::parsers::cache::CacheEntry {
            file_path: session.file_path.clone(),
            last_modified: 0,
            size: 0,
            hash: session.id.clone(),
            session,
        };
        crate::parsers::store::save_source(&mut conn, source_id, &[entry]).unwrap();
    }

    fn store_contains(id: &str) -> bool {
        let conn = crate::parsers::cache::get_cache_manager()
            .open_db()
            .unwrap();
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
            [id],
            |r| r.get::<_, i64>(0),
        )
        .map(|n| n != 0)
        .unwrap_or(false)
    }

    #[test]
    fn test_missing_directory_is_not_recreated() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp_home = tempfile::tempdir().unwrap();
        let original_home = std::env::var_os("HOME");
        std::env::set_var("HOME", temp_home.path());
        std::env::set_var(
            "CODEOBA_MOCK_HOME",
            temp_home.path().to_string_lossy().to_string(),
        );

        // Write mock source decisions so codex/antigravity are allowed in the test
        let codeoba_dir = temp_home.path().join(".codeoba");
        std::fs::create_dir_all(&codeoba_dir).unwrap();
        std::fs::write(
            codeoba_dir.join("source_decisions.json"),
            r#"{"codex": "allow", "antigravity": "allow"}"#,
        )
        .unwrap();

        // Initialize state
        let app_handle = tauri::test::mock_app().handle().clone();

        // Setup WatcherState in app state
        let (tx, _rx) = std::sync::mpsc::channel();
        let watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .unwrap();
        app_handle.manage(WatcherState {
            watcher: Mutex::new(Some(watcher)),
            last_generations: Mutex::new(std::collections::HashMap::new()),
            watched_inodes: Mutex::new(std::collections::HashMap::new()),
            detected_sources: Mutex::new(std::collections::HashSet::new()),
            last_file_hashes: Mutex::new(std::collections::HashMap::new()),
        });

        let idx_state = SearchIndexState::new();

        // Add a mock Codex session
        let session = Session {
            id: "codex-test".to_string(),
            source_id: "codex".to_string(),
            file_path: "some_path".to_string(),
            timestamp: 0,
            updated_at: 0,
            cwd: None,
            thread_name: Some("Codex Title".to_string()),
            turns: vec![Turn {
                turn_id: "t1".to_string(),
                user_message: "User query".to_string(),
                assistant_message: "Reply".to_string(),
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
        };

        seed_store("codex", session);
        assert!(
            store_contains("codex-test"),
            "seeded session should be in the store"
        );

        // Manage idx_state in app state
        app_handle.manage(idx_state);

        // Codex target path is HOME/sessions (from get_watch_paths)
        // Wait, for Codex, the watch target parent resolved is temp_home/.codex
        let codex_dir = temp_home.path().join(".codex");
        std::fs::create_dir_all(&codex_dir).unwrap();
        assert!(codex_dir.exists());

        // Deleting the directory
        std::fs::remove_dir_all(&codex_dir).unwrap();
        assert!(!codex_dir.exists());

        // Run check_and_restore_watched_paths
        check_and_restore_watched_paths(&app_handle);

        // Synchronous contract: the missing directory is NOT recreated. (A prior bug
        // recreated it here.) The session-deletion behavior for a missing root is
        // handled off-thread by spawn_rescan_and_reconcile -> scan_absent_source ->
        // reconcile_source, and is unit-tested deterministically there
        // (cache::scan_lifecycle_tests::absent_source_soft_deletes_cached_sessions and
        // search::update_session_tests::reconcile_*), not asserted here where it races
        // the spawned task.
        assert!(
            !codex_dir.exists(),
            "missing directory must not be recreated"
        );

        if let Some(h) = original_home {
            std::env::set_var("HOME", h);
        } else {
            std::env::remove_var("HOME");
        }
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    #[test]
    fn test_inode_change_rewatches_and_updates_stored_inode() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp_home = tempfile::tempdir().unwrap();
        let original_home = std::env::var_os("HOME");
        std::env::set_var("HOME", temp_home.path());
        std::env::set_var(
            "CODEOBA_MOCK_HOME",
            temp_home.path().to_string_lossy().to_string(),
        );

        // Write mock source decisions so codex/antigravity are allowed in the test
        let codeoba_dir = temp_home.path().join(".codeoba");
        std::fs::create_dir_all(&codeoba_dir).unwrap();
        std::fs::write(
            codeoba_dir.join("source_decisions.json"),
            r#"{"codex": "allow", "antigravity": "allow"}"#,
        )
        .unwrap();

        // Initialize state
        let app_handle = tauri::test::mock_app().handle().clone();

        // Setup WatcherState in app state
        let (tx, _rx) = std::sync::mpsc::channel();
        let watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .unwrap();

        let codex_dir = temp_home.path().join(".codex");
        std::fs::create_dir_all(&codex_dir).unwrap();
        assert!(codex_dir.exists());

        // Initialize watched inodes map with a dummy inode that is guaranteed not to match the real one
        let mut watched_inodes = std::collections::HashMap::new();
        watched_inodes.insert(codex_dir.clone(), 999999);

        app_handle.manage(WatcherState {
            watcher: Mutex::new(Some(watcher)),
            last_generations: Mutex::new(std::collections::HashMap::new()),
            watched_inodes: Mutex::new(watched_inodes),
            detected_sources: Mutex::new(std::collections::HashSet::new()),
            last_file_hashes: Mutex::new(std::collections::HashMap::new()),
        });

        let idx_state = SearchIndexState::new();

        // Add a mock Codex session
        let session = Session {
            id: "codex-test-inode".to_string(),
            source_id: "codex".to_string(),
            file_path: "some_path".to_string(),
            timestamp: 0,
            updated_at: 0,
            cwd: None,
            thread_name: Some("Codex Title".to_string()),
            turns: vec![Turn {
                turn_id: "t1".to_string(),
                user_message: "User query".to_string(),
                assistant_message: "Reply".to_string(),
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
        };

        seed_store("codex", session);

        // Manage idx_state in app state
        app_handle.manage(idx_state);

        // Run check_and_restore_watched_paths
        check_and_restore_watched_paths(&app_handle);

        // New contract: an inode change rewatches and updates the stored inode
        // synchronously, but no longer wipes the source synchronously. Any deletion now
        // flows through a rescan + reconcile_source (completeness-gated, and unit-tested
        // there), so the inline clear-then-reload that could leave the source empty on a
        // short reload is gone. This test asserts the synchronous, deterministic effect:
        // the stored inode is updated.
        let state = app_handle.state::<WatcherState>();
        let inodes_guard = state.watched_inodes.lock().unwrap();
        let stored_ino = inodes_guard.get(&codex_dir).copied().unwrap_or(0);
        assert_ne!(
            stored_ino, 999999,
            "Stored inode was not updated to the new one!"
        );
        assert_ne!(stored_ino, 0);

        if let Some(h) = original_home {
            std::env::set_var("HOME", h);
        } else {
            std::env::remove_var("HOME");
        }
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    fn helper_encode_varint(value: u64) -> Vec<u8> {
        let mut list = Vec::new();
        let mut temp = value;
        loop {
            if (temp & !0x7F) == 0 {
                list.push(temp as u8);
                break;
            } else {
                list.push(((temp & 0x7F) | 0x80) as u8);
                temp >>= 7;
            }
        }
        list
    }

    fn helper_encode_length_delimited(field_number: u32, bytes: &[u8]) -> Vec<u8> {
        let tag = (field_number << 3) | 2;
        let mut result = helper_encode_varint(tag as u64);
        result.extend(helper_encode_varint(bytes.len() as u64));
        result.extend_from_slice(bytes);
        result
    }

    #[test]
    fn test_antigravity_rename_watcher_sync() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp_home = tempfile::tempdir().unwrap();
        let original_home = std::env::var_os("HOME");
        std::env::set_var("HOME", temp_home.path());
        std::env::set_var(
            "CODEOBA_MOCK_HOME",
            temp_home.path().to_string_lossy().to_string(),
        );

        // Write mock source decisions so codex/antigravity are allowed in the test
        let codeoba_dir = temp_home.path().join(".codeoba");
        std::fs::create_dir_all(&codeoba_dir).unwrap();
        std::fs::write(
            codeoba_dir.join("source_decisions.json"),
            r#"{"codex": "allow", "antigravity": "allow"}"#,
        )
        .unwrap();

        // Initialize state
        let app_handle = tauri::test::mock_app().handle().clone();

        // Setup WatcherState in app state
        let (tx, _rx) = std::sync::mpsc::channel();
        let watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .unwrap();
        app_handle.manage(WatcherState {
            watcher: Mutex::new(Some(watcher)),
            last_generations: Mutex::new(std::collections::HashMap::new()),
            watched_inodes: Mutex::new(std::collections::HashMap::new()),
            detected_sources: Mutex::new(std::collections::HashSet::new()),
            last_file_hashes: Mutex::new(std::collections::HashMap::new()),
        });

        let idx_state = SearchIndexState::new();

        // 1. Create a mock Antigravity transcript
        let gemini_dir = temp_home.path().join(".gemini/antigravity");
        let brain_dir = gemini_dir.join("brain");
        let session_dir = brain_dir.join("session-antigravity-123/.system_generated/logs");
        std::fs::create_dir_all(&session_dir).unwrap();
        let transcript_file = session_dir.join("transcript.jsonl");
        std::fs::write(
            &transcript_file,
            r#"{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-05-20T02:00:00Z","content":"<USER_REQUEST>Hello</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-05-20T02:00:01Z","content":"Hi"}"#
        ).unwrap();

        // 2. Create a mock pb file with initial title
        let pb_file = gemini_dir.join("agyhub_summaries_proto.pb");
        let uuid_bytes = "session-antigravity-123".as_bytes();
        let uuid_field = helper_encode_length_delimited(1, uuid_bytes);
        let title_bytes = "Exploring Physics".as_bytes();
        let title_field = helper_encode_length_delimited(1, title_bytes);
        let info_field = helper_encode_length_delimited(2, &title_field);
        let entry_field =
            helper_encode_length_delimited(1, &[uuid_field.clone(), info_field].concat());
        std::fs::write(&pb_file, &entry_field).unwrap();

        // 3. Load sessions initially via source. The parse writes the SQLite store (via
        //    end_scan), so this both seeds the store and verifies the initial title.
        let src = crate::parsers::antigravity::AntigravitySource::default();
        let sessions =
            tauri::async_runtime::block_on(async { src.parse_all_sessions().await }).sessions;
        assert_eq!(sessions.len(), 1);
        assert_eq!(
            sessions[0].thread_name.as_deref(),
            Some("Exploring Physics")
        );

        app_handle.manage(idx_state);

        // 4. Update the title in summaries pb to "New Physics Title"
        let title_bytes_new = "New Physics Title".as_bytes();
        let title_field_new = helper_encode_length_delimited(1, title_bytes_new);
        let info_field_new = helper_encode_length_delimited(2, &title_field_new);
        let entry_field_new =
            helper_encode_length_delimited(1, &[uuid_field.clone(), info_field_new].concat());
        std::fs::write(&pb_file, &entry_field_new).unwrap();

        // 5. Trigger handle_file_change to simulate file watch event
        // Set generation count to 1 so the debounce logic allows it
        {
            let state = app_handle.state::<WatcherState>();
            let mut guard = state.last_generations.lock().unwrap();
            guard.insert(pb_file.to_string_lossy().to_string(), 1);
        }

        handle_file_change(&app_handle, &pb_file);

        // 6. Give the async reload handler a moment to execute, polling the store for the
        //    reindexed title.
        let mut title_updated = false;
        for _ in 0..50 {
            if let Some(conn) = crate::parsers::cache::get_cache_manager().open_db() {
                let title: Option<String> = conn
                    .query_row(
                        "SELECT thread_name FROM sessions WHERE id = ?1",
                        ["session-antigravity-123"],
                        |r| r.get::<_, Option<String>>(0),
                    )
                    .ok()
                    .flatten();
                if title.as_deref() == Some("New Physics Title") {
                    title_updated = true;
                    break;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        assert!(
            title_updated,
            "Session title was not updated to 'New Physics Title' in time"
        );

        if let Some(h) = original_home {
            std::env::set_var("HOME", h);
        } else {
            std::env::remove_var("HOME");
        }
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}
