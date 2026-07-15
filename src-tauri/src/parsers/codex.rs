use crate::models::{Session, Turn};
use crate::parsers::SourceAdapter;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub struct CodexSource {
    session_title_map: std::sync::RwLock<HashMap<String, String>>,
    last_index_file_modified: std::sync::RwLock<i64>,
}

impl Default for CodexSource {
    fn default() -> Self {
        Self {
            session_title_map: std::sync::RwLock::new(HashMap::new()),
            last_index_file_modified: std::sync::RwLock::new(0),
        }
    }
}

impl CodexSource {
    pub fn new() -> Self {
        Self::default()
    }

    fn get_base_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        home.join(".codex")
    }

    fn get_session_title(&self, session_id: &str) -> String {
        let index_file = self.get_base_dir().join("session_index.jsonl");
        let current_modified = if index_file.exists() && index_file.is_file() {
            index_file
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0)
        } else {
            0
        };

        let last_mod = {
            *self
                .last_index_file_modified
                .read()
                .unwrap_or_else(|e| e.into_inner())
        };
        if last_mod == 0 || current_modified > last_mod {
            self.build_session_title_map();
            let mut mod_guard = self
                .last_index_file_modified
                .write()
                .unwrap_or_else(|e| e.into_inner());
            *mod_guard = current_modified;
        }

        let map = self
            .session_title_map
            .read()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(title) = map.get(session_id) {
            return title.clone();
        }
        // Last 36 bytes = the trailing UUID. `.get()` (not `[..]`) returns None instead
        // of panicking if the byte offset lands mid-char on a non-ASCII session id.
        if session_id.len() >= 36 {
            if let Some(uuid_part) = session_id.get(session_id.len() - 36..) {
                if let Some(title) = map.get(uuid_part) {
                    return title.clone();
                }
            }
        }
        "Codex Session".to_string()
    }

    fn build_session_title_map(&self) {
        let index_file = self.get_base_dir().join("session_index.jsonl");
        let mut map = HashMap::new();
        if index_file.exists() && index_file.is_file() {
            if let Ok(content) = fs::read_to_string(&index_file) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                            if let Some(obj) = val.as_object() {
                                let id = obj.get("id").and_then(|v| v.as_str());
                                let name = obj.get("thread_name").and_then(|v| v.as_str());
                                if let (Some(id_str), Some(name_str)) = (id, name) {
                                    map.insert(id_str.to_string(), name_str.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        let mut map_guard = self
            .session_title_map
            .write()
            .unwrap_or_else(|e| e.into_inner());
        *map_guard = map;
    }
}

impl SourceAdapter for CodexSource {
    fn id(&self) -> &str {
        "codex"
    }

    fn display_name(&self) -> &str {
        "OpenAI Codex"
    }

    fn product_url(&self) -> Option<String> {
        Some("https://openai.com/codex/".to_string())
    }

    fn is_available(&self) -> bool {
        self.get_base_dir().exists()
    }

    fn get_default_log_paths(&self) -> Vec<String> {
        let base = self.get_base_dir();
        vec![
            base.join("sessions").to_string_lossy().to_string(),
            base.join("archived_sessions").to_string_lossy().to_string(),
        ]
    }

    fn get_watch_paths(&self) -> Vec<String> {
        let base = self.get_base_dir();
        vec![
            base.join("session_index.jsonl")
                .to_string_lossy()
                .to_string(),
            base.join("sessions").to_string_lossy().to_string(),
            base.join("archived_sessions").to_string_lossy().to_string(),
        ]
    }

    fn get_watch_file_filter(&self) -> Option<fn(&str) -> bool> {
        Some(|path| {
            let p = Path::new(path);
            (p.is_file()
                && p.extension().and_then(|s| s.to_str()) == Some("jsonl")
                && p.file_name()
                    .and_then(|s| s.to_str())
                    .map(|s| s.starts_with("rollout-"))
                    .unwrap_or(false))
                || p.file_name().and_then(|s| s.to_str()) == Some("session_index.jsonl")
        })
    }

    fn is_app_installed(&self) -> bool {
        let sessions_dir = self.get_base_dir().join("sessions");
        if sessions_dir.exists() && sessions_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(sessions_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_file()).unwrap_or(false)
                        && entry.path().extension().and_then(|s| s.to_str()) == Some("jsonl")
                    {
                        return true;
                    }
                }
            }
        }
        crate::parsers::is_executable_installed("codex")
    }

    fn delete_data_paths(&self) -> bool {
        let base = self.get_base_dir();
        if base.exists() {
            fs::remove_dir_all(base).is_ok()
        } else {
            true
        }
    }

    fn get_data_paths_to_delete(&self) -> Vec<String> {
        vec![self.get_base_dir().to_string_lossy().to_string()]
    }

    async fn parse_session(&self, file_path: &str) -> Option<Session> {
        let path = Path::new(file_path);
        let metadata = path.metadata().ok()?;
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let size = metadata.len() as i64;

        let cache_modified = last_modified;
        let cache_size = size;

        if let Some(mut cached) = crate::parsers::cache::get_cache_manager()
            .get_cached_session_for_file(self.id(), file_path, cache_modified, cache_size)
        {
            cached.thread_name = Some(self.get_session_title(&cached.id));
            // Re-resolve status dynamically to ensure it is not stale
            cached.status = crate::models::resolve_session_status(
                self.id(),
                &cached.id,
                file_path,
                &cached.turns,
                &cached.cwd,
            );
            crate::parsers::cache::get_cache_manager().update_cached_session(
                self.id(),
                file_path,
                cached.clone(),
            );
            return Some(cached);
        }

        let content_str = fs::read_to_string(path).ok()?;
        let mut created_time = last_modified;
        let updated_time = created_time;

        let mut session_id = path
            .file_stem()?
            .to_string_lossy()
            .to_string()
            .trim_start_matches("rollout-")
            .to_string();
        if session_id.len() >= 36 {
            // `.get()` avoids a UTF-8-boundary panic on a non-ASCII file stem.
            if let Some(uuid_part) = session_id.get(session_id.len() - 36..) {
                if uuid_part.contains('-') {
                    session_id = uuid_part.to_string();
                }
            }
        }

        let mut cwd: Option<String> = None;
        let mut custom_thread_name: Option<String> = None;

        struct RawTurn {
            is_user: bool,
            text: String,
            timestamp: i64,
            model: Option<String>,
            images: Option<Vec<crate::models::ImageReference>>,
        }
        let mut raw_turns = Vec::new();

        for line in content_str.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(element) = serde_json::from_str::<serde_json::Value>(trimmed) {
                let obj = match element.as_object() {
                    Some(o) => o,
                    None => continue,
                };
                let step_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let timestamp_str = obj.get("timestamp").and_then(|v| v.as_str());
                let timestamp = timestamp_str
                    .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                    .map(|dt| dt.timestamp_millis())
                    .unwrap_or(0);

                let payload = match obj.get("payload").and_then(|v| v.as_object()) {
                    Some(p) => p,
                    None => continue,
                };

                if step_type == "session_meta" {
                    if let Some(id) = payload.get("id").and_then(|v| v.as_str()) {
                        session_id = id.to_string();
                    }
                    if let Some(c) = payload.get("cwd").and_then(|v| v.as_str()) {
                        cwd = Some(c.to_string());
                    }
                    if let Some(time_str) = payload.get("timestamp").and_then(|v| v.as_str()) {
                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(time_str) {
                            created_time = dt.timestamp_millis();
                        }
                    }
                } else if step_type == "event_msg" {
                    if let Some(inner_type) = payload.get("type").and_then(|v| v.as_str()) {
                        if inner_type == "thread_name_updated" {
                            if let Some(name) = payload.get("thread_name").and_then(|v| v.as_str())
                            {
                                custom_thread_name = Some(name.to_string());
                            }
                        }
                    }
                } else if step_type == "response_item" {
                    let role = payload.get("role").and_then(|v| v.as_str()).unwrap_or("");
                    let model_name = payload
                        .get("model")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let mut text_builder = String::new();
                    let mut images = Vec::new();
                    if let Some(content_array) = payload.get("content").and_then(|v| v.as_array()) {
                        for item in content_array {
                            if let Some(item_obj) = item.as_object() {
                                let item_type = item_obj.get("type").and_then(|v| v.as_str());
                                if item_type == Some("image_url") {
                                    if let Some(img_url_obj) =
                                        item_obj.get("image_url").and_then(|v| v.as_object())
                                    {
                                        if let Some(url) =
                                            img_url_obj.get("url").and_then(|v| v.as_str())
                                        {
                                            if url.starts_with("data:") {
                                                if let Some((mime, b64)) = parse_data_url(url) {
                                                    images.push(crate::models::ImageReference {
                                                        id: uuid::Uuid::new_v4().to_string(),
                                                        path: None,
                                                        base64: Some(b64),
                                                        media_type: Some(mime),
                                                    });
                                                }
                                            } else {
                                                images.push(crate::models::ImageReference {
                                                    id: uuid::Uuid::new_v4().to_string(),
                                                    path: Some(url.to_string()),
                                                    base64: None,
                                                    media_type: None,
                                                });
                                            }
                                        }
                                    }
                                } else {
                                    if let Some(t) = item_obj.get("text").and_then(|v| v.as_str()) {
                                        text_builder.push_str(t);
                                        text_builder.push('\n');
                                    }
                                }
                            }
                        }
                    }
                    let text = text_builder.trim().to_string();
                    let images_opt = if images.is_empty() {
                        None
                    } else {
                        Some(images)
                    };
                    if !text.is_empty() || images_opt.is_some() {
                        raw_turns.push(RawTurn {
                            is_user: role == "user",
                            text,
                            timestamp,
                            model: model_name,
                            images: images_opt,
                        });
                    }
                }
            }
        }

        if raw_turns.is_empty() {
            return None;
        }

        let mut turns = Vec::new();
        let mut turn_count = 0;
        let mut current_idx = 0;

        while current_idx < raw_turns.len() {
            let user_raw = match raw_turns.get(current_idx) {
                Some(r) => r,
                None => break,
            };
            if user_raw.is_user {
                let mut combined_images = Vec::new();
                if let Some(ref imgs) = user_raw.images {
                    combined_images.extend(imgs.clone());
                }

                let mut assistant_text = String::new();
                let mut compute_time_ms = 0i64;
                let mut model_name = None;
                if current_idx + 1 < raw_turns.len()
                    && raw_turns.get(current_idx + 1).is_some_and(|r| !r.is_user)
                {
                    let assistant_raw = match raw_turns.get(current_idx + 1) {
                        Some(r) => r,
                        None => break,
                    };
                    assistant_text = assistant_raw.text.clone();
                    compute_time_ms = (assistant_raw.timestamp - user_raw.timestamp).max(0);
                    model_name = assistant_raw.model.clone();
                    if let Some(ref imgs) = assistant_raw.images {
                        combined_images.extend(imgs.clone());
                    }
                    current_idx += 2;
                } else {
                    current_idx += 1;
                }
                let active_model = model_name.unwrap_or_else(|| "Unknown".to_string());
                let mut extra_data = HashMap::new();
                extra_data.insert("computeTimeMs".to_string(), compute_time_ms.to_string());
                extra_data.insert("model".to_string(), active_model.clone());

                let input_toks = crate::tokenizer::estimate_tokens(&user_raw.text, &active_model);
                let output_toks = crate::tokenizer::estimate_tokens(&assistant_text, &active_model);

                turns.push(Turn {
                    turn_id: format!("{}_{}", session_id, turn_count),
                    user_message: user_raw.text.clone(),
                    assistant_message: assistant_text,
                    timestamp: user_raw.timestamp,
                    input_tokens: Some(input_toks),
                    output_tokens: Some(output_toks),
                    extra_data,
                    images: if combined_images.is_empty() {
                        None
                    } else {
                        Some(combined_images)
                    },
                });
                turn_count += 1;
            } else {
                let active_model = user_raw
                    .model
                    .clone()
                    .unwrap_or_else(|| "Unknown".to_string());
                let mut extra_data = HashMap::new();
                extra_data.insert("computeTimeMs".to_string(), "0".to_string());
                extra_data.insert("model".to_string(), active_model.clone());

                let output_toks = crate::tokenizer::estimate_tokens(&user_raw.text, &active_model);

                let mut orphan_images = Vec::new();
                if let Some(ref imgs) = user_raw.images {
                    orphan_images.extend(imgs.clone());
                }

                turns.push(Turn {
                    turn_id: format!("{}_{}", session_id, turn_count),
                    user_message: String::new(),
                    assistant_message: user_raw.text.clone(),
                    timestamp: user_raw.timestamp,
                    input_tokens: Some(0),
                    output_tokens: Some(output_toks),
                    extra_data,
                    images: if orphan_images.is_empty() {
                        None
                    } else {
                        Some(orphan_images)
                    },
                });
                turn_count += 1;
                current_idx += 1;
            }
        }

        let first_time = raw_turns
            .first()
            .map(|t| t.timestamp)
            .unwrap_or(created_time);
        let last_time = raw_turns
            .last()
            .map(|t| t.timestamp)
            .unwrap_or(updated_time);

        let thread_name = if let Some(ref name) = custom_thread_name {
            name.clone()
        } else {
            let index_title = self.get_session_title(&session_id);
            if index_title != "Codex Session" {
                index_title
            } else {
                let first_user_msg = turns.iter().find(|t| !t.user_message.is_empty()).map(|t| {
                    // First 60 chars (not bytes): a byte-index truncate here panics
                    // when it splits a multi-byte UTF-8 char, and is redundant since
                    // the string is already ≤60 chars from `.take(60)`.
                    let mut title = t
                        .user_message
                        .chars()
                        .take(60)
                        .collect::<String>()
                        .replace('\n', " ");
                    if t.user_message.chars().count() > 60 {
                        title.push_str("...");
                    }
                    title
                });
                first_user_msg.unwrap_or_else(|| "Codex Session".to_string())
            }
        };

        let is_archived = path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|s| s.to_str())
            == Some("archived_sessions");

        let workspace_name = crate::models::resolve_workspace_name(&cwd);
        let status =
            crate::models::resolve_session_status(self.id(), &session_id, file_path, &turns, &cwd);

        let session = Session {
            id: session_id,
            source_id: self.id().to_string(),
            file_path: file_path.to_string(),
            timestamp: first_time,
            updated_at: last_time,
            cwd,
            thread_name: Some(thread_name),
            turns,
            is_archived,
            is_pinned: false,
            summary: None,
            snippet: None,
            workspace_name,
            status,
            is_deleted: false,
        };

        crate::parsers::cache::get_cache_manager().put_cached_session(
            self.id(),
            file_path,
            cache_modified,
            cache_size,
            "",
            session.clone(),
        );

        Some(session)
    }

    async fn parse_all_sessions(&self) -> Vec<Session> {
        let base_dir = self.get_base_dir();
        if !base_dir.exists() || !base_dir.is_dir() {
            return Vec::new();
        }

        self.build_session_title_map();

        crate::parsers::cache::get_cache_manager().start_scan(self.id());

        let mut sessions = Vec::new();
        let default_paths = self.get_default_log_paths();

        for path_str in default_paths {
            let dir = Path::new(&path_str);
            if dir.exists() && dir.is_dir() {
                let mut walk_stack = vec![dir.to_path_buf()];
                while let Some(current_dir) = walk_stack.pop() {
                    if let Ok(entries) = fs::read_dir(current_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_dir() {
                                walk_stack.push(path);
                            } else if path.is_file()
                                && path.extension().and_then(|s| s.to_str()) == Some("jsonl")
                                && path
                                    .file_name()
                                    .and_then(|s| s.to_str())
                                    .map(|s| s.starts_with("rollout-"))
                                    .unwrap_or(false)
                            {
                                if let Some(session) =
                                    self.parse_session(&path.to_string_lossy()).await
                                {
                                    sessions.push(session);
                                }
                            }
                        }
                    }
                }
            }
        }

        crate::parsers::cache::get_cache_manager().end_scan(self.id())
    }
}

fn parse_data_url(url: &str) -> Option<(String, String)> {
    if !url.starts_with("data:") {
        return None;
    }
    let comma_idx = url.find(',')?;
    let header = url.get(..comma_idx)?;
    let data = url.get(comma_idx + 1..)?;
    let header_content = header.strip_prefix("data:")?;
    let mime = if header_content.contains(';') {
        let semi_idx = header_content.find(';')?;
        header_content.get(..semi_idx)?.to_string()
    } else {
        header_content.to_string()
    };
    Some((mime, data.to_string()))
}
