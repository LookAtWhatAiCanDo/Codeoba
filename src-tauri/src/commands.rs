use crate::models::Session;
use crate::parsers::get_sources_list;
use crate::keyring;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceMetadata {
    pub id: String,
    pub display_name: String,
    pub is_available: bool,
    pub is_app_installed: bool,
}

#[tauri::command]
pub fn get_sources() -> Vec<SourceMetadata> {
    let sources = get_sources_list();
    sources
        .iter()
        .map(|s| SourceMetadata {
            id: s.id().to_string(),
            display_name: s.display_name().to_string(),
            is_available: s.is_available(),
            is_app_installed: s.is_app_installed(),
        })
        .collect()
}

#[tauri::command]
pub async fn get_all_sessions() -> Result<Vec<Session>, String> {
    let sources = get_sources_list();
    let mut handles = Vec::new();

    for source in sources {
        if source.is_available() {
            let handle = tauri::async_runtime::spawn(async move {
                source.parse_all_sessions().await
            });
            handles.push(handle);
        }
    }

    let mut all_sessions = Vec::new();
    for handle in handles {
        if let Ok(mut sessions) = handle.await {
            all_sessions.append(&mut sessions);
        }
    }

    // Sort sessions by updated_at descending
    all_sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(all_sessions)
}

#[tauri::command]
pub async fn get_session(source_id: String, file_path: String) -> Result<Option<Session>, String> {
    let sources = get_sources_list();
    let source = sources.iter().find(|s| s.id() == source_id);
    match source {
        Some(s) => {
            let session = s.parse_session(&file_path).await;
            Ok(session)
        }
        None => Err(format!("Source adapter '{}' not found", source_id)),
    }
}

#[tauri::command]
pub fn delete_source_data(source_id: String) -> Result<bool, String> {
    let sources = get_sources_list();
    let source = sources.iter().find(|s| s.id() == source_id);
    match source {
        Some(s) => Ok(s.delete_data_paths()),
        None => Err(format!("Source adapter '{}' not found", source_id)),
    }
}

#[tauri::command]
pub fn get_credential(key: String) -> Option<String> {
    keyring::get_secret(&key)
}

#[tauri::command]
pub fn save_credential(key: String, value: Option<String>) {
    keyring::put_secret(&key, value.as_deref());
}
