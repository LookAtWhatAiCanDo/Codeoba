use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn get_source_decisions_file() -> PathBuf {
    let home = crate::parsers::get_home_dir();
    let dir = home.join(".codeoba");
    let _ = fs::create_dir_all(&dir);
    dir.join("source_decisions.json")
}

pub fn load_source_decisions() -> HashMap<String, String> {
    let file_path = get_source_decisions_file();
    if !file_path.exists() {
        return HashMap::new();
    }
    match fs::read_to_string(&file_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| HashMap::new()),
        Err(_) => HashMap::new(),
    }
}

pub fn save_source_decisions(decisions: &HashMap<String, String>) {
    let file_path = get_source_decisions_file();
    if let Ok(content) = serde_json::to_string_pretty(decisions) {
        if let Err(e) = crate::fs_util::atomic_write(&file_path, content.as_bytes()) {
            crate::log_error!("Failed to write source decisions file: {}", e);
        }
    }
}

pub fn get_source_decision(source_id: &str) -> String {
    let decisions = load_source_decisions();
    decisions.get(source_id).cloned().unwrap_or_else(|| "ask".to_string())
}

pub fn save_source_decision(source_id: &str, decision: &str) {
    let mut decisions = load_source_decisions();
    decisions.insert(source_id.to_string(), decision.to_string());
    save_source_decisions(&decisions);
}
