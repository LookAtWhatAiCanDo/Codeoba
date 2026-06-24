pub mod models;
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(watcher::WatcherState {
            watcher: std::sync::Mutex::new(None),
            last_generations: std::sync::Mutex::new(std::collections::HashMap::new()),
        })
        .manage(search::SearchIndexState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let _ = watcher::start_watcher(handle.clone());
            
            // Rebuild search index in background thread
            let handle_clone = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = handle_clone.state::<search::SearchIndexState>();
                let home = parsers::get_home_dir();
                let model_path = home.join(".codeoba/models/model_quantized.onnx");
                let vocab_path = home.join(".codeoba/models/vocab.txt");
                let use_semantic = model_path.exists() && vocab_path.exists();
                let _ = state.rebuild(use_semantic).await;
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
            commands::rebuild_index
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
