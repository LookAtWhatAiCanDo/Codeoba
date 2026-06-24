use crate::parsers::get_sources_list;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub last_generations: Mutex<std::collections::HashMap<String, u64>>,
}

pub fn start_watcher(app_handle: AppHandle) -> Result<(), String> {
    let sources = get_sources_list();
    let mut paths_to_watch = Vec::new();

    for source in &sources {
        if source.is_available() {
            for path in source.get_watch_paths() {
                let p = Path::new(&path);
                if p.exists() {
                    paths_to_watch.push((source.id().to_string(), p.to_path_buf()));
                }
            }
        }
    }

    if paths_to_watch.is_empty() {
        return Ok(());
    }

    let handle_clone = app_handle.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        match res {
            Ok(event) => {
                // Filter for file writes or creations
                if is_write_event(&event.kind) {
                    for path in event.paths {
                        handle_file_change(&handle_clone, &path);
                    }
                }
            }
            Err(e) => {
                eprintln!("Watcher error: {:?}", e);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    for (_, path) in &paths_to_watch {
        let _ = watcher.watch(path, RecursiveMode::Recursive);
    }

    // Save the watcher in Tauri state so it doesn't get dropped
    let state = app_handle.state::<WatcherState>();
    if let Ok(mut guard) = state.watcher.lock() {
        *guard = Some(watcher);
    }

    Ok(())
}

fn is_write_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Modify(_) | EventKind::Create(_)
    )
}

fn handle_file_change(app_handle: &AppHandle, path: &Path) {
    let path_str = path.to_string_lossy();
    let sources = get_sources_list();

    for source in sources {
        if !source.is_available() {
            continue;
        }

        let matches_filter = match source.get_watch_file_filter() {
            Some(filter_fn) => filter_fn(&path_str),
            None => {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if source.id() == "aider" && ext == "md" {
                    true
                } else if source.id() == "cursor" && (ext == "vscdb" || path_str.contains("state.vscdb")) {
                    true
                } else if ext == "jsonl" {
                    true
                } else {
                    false
                }
            }
        };

        if matches_filter {
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
                        if let Some(session) = src.parse_session(&file_path).await {
                            let idx_state = app_handle_clone.state::<crate::search::SearchIndexState>();
                            let _ = idx_state.update_session(session.clone()).await;
                            let _ = app_handle_clone.emit("session-updated", &session);
                        }
                    }
                }
            });
            break;
        }
    }
}
