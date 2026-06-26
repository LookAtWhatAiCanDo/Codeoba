pub mod models;
pub mod logging;
pub mod parsers;
pub mod keyring;
pub mod tokenizer;
pub mod commands;
pub mod watcher;
pub mod search;

#[cfg(test)]
pub static HOME_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Delete the window state file preemptively before the Tauri builder or plugins initialize
    if std::env::args().any(|arg| arg == "--reset-window" || arg == "--reset") {
        if let Some(mut path) = dirs::data_dir() {
            path = path.join("com.whataicando.codeoba").join(".window-state.json");
            if path.exists() {
                let _ = std::fs::remove_file(&path);
                crate::log_info!("Pre-emptively deleted window state file: {:?}", path);
            }
        }
    }

    let context = tauri::generate_context!();
    
    // Check if the updater is active from configuration
    let updater_active = if let Some(updater_config) = context.config().plugins.0.get("updater") {
        updater_config.get("active").and_then(|v| v.as_bool()).unwrap_or(false)
    } else {
        false
    };

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init());

    if updater_active {
        crate::log_info!("Updater is active in configuration. Registering updater and process plugins...");
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    } else {
        crate::log_info!("Updater is disabled in configuration. Skipping updater and process plugin registration.");
    }

    builder
        .manage(watcher::WatcherState {
            watcher: std::sync::Mutex::new(None),
            last_generations: std::sync::Mutex::new(std::collections::HashMap::new()),
        })
        .manage(search::SearchIndexState::new())
        .setup(|app| {
            // Ensure encryption key is created synchronously on startup to prevent background collisions
            let _ = crate::keyring::get_or_create_cache_key();
            
            let handle = app.handle().clone();
            let _ = watcher::start_watcher(handle.clone());
            
            // Load cached sessions in background thread on startup
            let handle_clone = handle.clone();
            std::thread::spawn(move || {
                tauri::async_runtime::block_on(async move {
                    let state = handle_clone.state::<search::SearchIndexState>();
                    
                    // Load cached sessions in the background
                    state.load_cached_sessions();
                    
                    let progress = search::IndexingProgress {
                        step: "complete".to_string(),
                        progress: 1.0,
                        current_source: "Cache".to_string(),
                    };
                    if let Ok(mut guard) = state.last_progress.write() {
                        *guard = Some(progress.clone());
                    }
                    use tauri::Emitter;
                    let _ = handle_clone.emit("indexing-progress", progress);
                });
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_sources,
            commands::get_all_sessions,
            commands::get_session,
            commands::delete_source_data,
            commands::get_credential,
            commands::save_credential,
            commands::search_sessions,
            commands::rebuild_index,
            commands::log_from_frontend,
            commands::check_reset_window,
            commands::get_indexing_progress,
            commands::is_updater_active
        ])
        .run(context)
        .expect("error while running tauri application");
}
