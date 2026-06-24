pub mod models;
pub mod parsers;
pub mod keyring;
pub mod tokenizer;
pub mod commands;
pub mod watcher;



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
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let _ = watcher::start_watcher(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_sources,
            commands::get_all_sessions,
            commands::get_session,
            commands::delete_source_data,
            commands::get_credential,
            commands::save_credential
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
