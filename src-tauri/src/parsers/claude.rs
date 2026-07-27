use crate::models::{Session, Turn};
use crate::parsers::{
    file_last_modified_millis, is_executable_installed, parse_rfc3339_to_millis, SourceAdapter,
};

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

/// The maximum depth to traverse when searching for Claude Code transcripts.
/// Capping traversal depth is a critical performance, safety, and correctness guard:
/// 1. Performance/Safety: Prevents the walker from descending into massive project folders
///    (e.g., node_modules, build directories) or traversing cyclic symlinks inside user projects.
/// 2. Correctness: Prevents scanning subagent transcripts located at depth 4
///    (e.g., ~/.claude/projects/<proj>/<session>/subagents/<agent-id>.jsonl). Since subagents
///    share the parent session ID, parsing them would result in duplicate session IDs,
///    causing the search index to overwrite the parent session with incomplete subagent turn data.
const CLAUDE_LOGS_MAX_DEPTH: usize = 3;

/// The starting depth for the recursive directory walker (1-indexed).
const RECURSION_START_DEPTH: usize = 1;

pub struct ClaudeSource;

struct RawTurn {
    is_user: bool,
    text: String,
    timestamp: i64,
    model: Option<String>,
    is_compaction: bool,
    compaction_time_ms: i64,
    images: Option<Vec<crate::models::ImageReference>>,
}

impl SourceAdapter for ClaudeSource {
    fn id(&self) -> &str {
        "claude"
    }

    fn display_name(&self) -> &str {
        "Claude Code"
    }

    fn product_url(&self) -> Option<String> {
        Some("https://claude.com/product/claude-code".to_string())
    }

    fn is_available(&self) -> bool {
        let base_dir = self.get_base_dir();
        if base_dir.exists() && base_dir.is_dir() {
            let mut paths = Vec::new();
            self.find_jsonl_files(
                &base_dir,
                RECURSION_START_DEPTH,
                CLAUDE_LOGS_MAX_DEPTH,
                &mut paths,
            );
            if !paths.is_empty() {
                return true;
            }
        }
        self.is_app_installed()
    }

    fn get_default_log_paths(&self) -> Vec<String> {
        vec![self.get_base_dir().to_string_lossy().to_string()]
    }

    fn get_watch_paths(&self) -> Vec<String> {
        vec![
            self.get_base_dir().to_string_lossy().to_string(),
            self.get_app_support_dir().to_string_lossy().to_string(),
        ]
    }

    fn get_watch_file_filter(&self) -> Option<fn(&str) -> bool> {
        Some(|path_str| {
            if path_str.ends_with(".jsonl") {
                let path = Path::new(path_str);
                let home = crate::parsers::get_home_dir();
                let base_dir = home.join(".claude/projects");
                if let Ok(rel_path) = path.strip_prefix(&base_dir) {
                    return rel_path.components().count() <= CLAUDE_LOGS_MAX_DEPTH;
                }
            } else if path_str.ends_with(".json") {
                let home = crate::parsers::get_home_dir();
                let app_dir = if cfg!(target_os = "macos") {
                    home.join("Library/Application Support/Claude")
                } else if cfg!(target_os = "windows") {
                    if let Ok(app_data) = std::env::var("APPDATA") {
                        PathBuf::from(app_data).join("Claude")
                    } else {
                        home.join("AppData/Roaming/Claude")
                    }
                } else {
                    home.join(".config/Claude")
                };
                let path = Path::new(path_str);
                if path.starts_with(&app_dir) {
                    return true;
                }
            }
            false
        })
    }

    fn is_app_installed(&self) -> bool {
        let base_dir = self.get_base_dir();
        if base_dir.exists() && base_dir.is_dir() {
            let mut paths = Vec::new();
            self.find_jsonl_files(
                &base_dir,
                RECURSION_START_DEPTH,
                CLAUDE_LOGS_MAX_DEPTH,
                &mut paths,
            );
            if !paths.is_empty() {
                return true;
            }
        }
        is_executable_installed("claude")
    }

    async fn parse_session(&self, file_path: &str) -> Option<Session> {
        self.parse_session_impl(file_path, None).await
    }

    async fn parse_all_sessions(&self) -> crate::parsers::cache::ScanResult {
        let base_dir = self.get_base_dir();
        if !crate::parsers::cache::source_root_readable(&base_dir) {
            // Root gone or unreadable: authoritative "source has no sessions", so its
            // cached sessions are marked deleted (soft; hard only under prune) rather than
            // preserved. A deeper read error below is different -- it only makes the scan
            // partial and preserves.
            return crate::parsers::cache::get_cache_manager().scan_absent_source(self.id());
        }

        crate::parsers::cache::get_cache_manager().start_scan(self.id());

        let mut paths = Vec::new();
        let complete = self.find_jsonl_files(
            &base_dir,
            RECURSION_START_DEPTH,
            CLAUDE_LOGS_MAX_DEPTH,
            &mut paths,
        );

        let archived_map = self.load_archived_session_map();

        let mut sessions = Vec::new();
        for path in paths {
            if let Some(session) = self
                .parse_session_impl(&path.to_string_lossy(), Some(&archived_map))
                .await
            {
                sessions.push(session);
            }
        }

        crate::parsers::cache::get_cache_manager().end_scan(self.id(), complete)
    }
}

impl ClaudeSource {
    // Helper function to recursively collect JSONL files down to the specified max depth.
    /// Returns false if any directory could not be read, so the caller can tell a
    /// genuinely empty tree from one it failed to enumerate.
    fn find_jsonl_files(
        &self,
        dir: &Path,
        depth: usize,
        max_depth: usize,
        paths: &mut Vec<PathBuf>,
    ) -> bool {
        if depth > max_depth {
            return true;
        }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(e) => {
                crate::log_warn!("[claude] Could not read {}: {}", dir.display(), e);
                return false;
            }
        };
        let mut complete = true;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if !self.find_jsonl_files(&path, depth + 1, max_depth, paths) {
                    complete = false;
                }
            } else if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                paths.push(path);
            }
        }
        complete
    }

    fn get_base_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        home.join(".claude/projects")
    }

    fn get_app_support_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        if cfg!(target_os = "macos") {
            home.join("Library/Application Support/Claude")
        } else if cfg!(target_os = "windows") {
            if let Ok(app_data) = std::env::var("APPDATA") {
                PathBuf::from(app_data).join("Claude")
            } else {
                home.join("AppData/Roaming/Claude")
            }
        } else {
            home.join(".config/Claude")
        }
    }

    pub fn load_archived_session_map(&self) -> HashMap<String, bool> {
        let mut archived_map = HashMap::new();
        let app_dir = self.get_app_support_dir();
        let target_subdirs = ["claude-code-sessions", "local-agent-mode-sessions"];
        for subdir in &target_subdirs {
            let dir = app_dir.join(subdir);
            if dir.exists() && dir.is_dir() {
                self.scan_dir_for_session_metadata(&dir, &mut archived_map);
            }
        }
        archived_map
    }

    fn scan_dir_for_session_metadata(&self, dir: &Path, archived_map: &mut HashMap<String, bool>) {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                self.scan_dir_for_session_metadata(&path, archived_map);
            } else if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(obj) = val.as_object() {
                            let is_archived = obj
                                .get("isArchived")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            if let Some(cli_id) = obj.get("cliSessionId").and_then(|v| v.as_str()) {
                                archived_map.insert(cli_id.to_string(), is_archived);
                            }
                            if let Some(s_id) = obj.get("sessionId").and_then(|v| v.as_str()) {
                                archived_map.insert(s_id.to_string(), is_archived);
                            }
                        }
                    }
                }
            }
        }
    }

    fn resolve_is_archived(
        &self,
        session_id: &str,
        archived_map: Option<&HashMap<String, bool>>,
    ) -> bool {
        if let Some(map) = archived_map {
            map.get(session_id).copied().unwrap_or(false)
        } else {
            let map = self.load_archived_session_map();
            map.get(session_id).copied().unwrap_or(false)
        }
    }

    async fn parse_session_impl(
        &self,
        file_path: &str,
        archived_map: Option<&HashMap<String, bool>>,
    ) -> Option<Session> {
        let path = Path::new(file_path);
        let file = File::open(path).ok()?;
        let metadata = file.metadata().ok()?;
        let last_modified = file_last_modified_millis(path);

        let size = metadata.len() as i64;

        if let Some(mut cached) = crate::parsers::cache::get_cache_manager()
            .get_cached_session_for_file(self.id(), file_path, last_modified, size)
        {
            let current_archived = self.resolve_is_archived(&cached.id, archived_map);
            let archived_changed = cached.is_archived != current_archived;
            if archived_changed {
                cached.is_archived = current_archived;
                crate::parsers::cache::get_cache_manager().put_cached_session(
                    self.id(),
                    file_path,
                    last_modified,
                    size,
                    "",
                    cached.clone(),
                );
            } else {
                cached.is_archived = current_archived;
            }

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

        let reader = BufReader::new(file);
        let mut raw_turns = Vec::new();

        let mut session_id = path.file_stem()?.to_string_lossy().to_string();
        let mut cwd: Option<String> = None;
        let mut slug: Option<String> = None;
        let mut custom_title: Option<String> = None;

        for line_result in reader.lines() {
            let line = match line_result {
                Ok(l) => l,
                Err(_) => continue,
            };
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(element) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(obj) = element.as_object() {
                    let line_type = match obj.get("type").and_then(|v| v.as_str()) {
                        Some(t) => t,
                        None => continue,
                    };

                    let timestamp = obj
                        .get("timestamp")
                        .and_then(|v| v.as_str())
                        .and_then(parse_rfc3339_to_millis)
                        .unwrap_or(0);

                    if let Some(sid) = obj.get("sessionId").and_then(|v| v.as_str()) {
                        session_id = sid.to_string();
                    }
                    if let Some(c) = obj.get("cwd").and_then(|v| v.as_str()) {
                        cwd = Some(c.to_string());
                    }
                    if let Some(sl) = obj.get("slug").and_then(|v| v.as_str()) {
                        slug = Some(sl.to_string());
                    }
                    // Claude appends a `custom-title` line every time the session is
                    // (re)named — by the agent itself or by the user renaming it in the
                    // app — so the LAST one is the title Claude is currently showing.
                    // Keep scanning rather than breaking early: later renames overwrite
                    // earlier ones.
                    if line_type == "custom-title" {
                        if let Some(t) = obj.get("customTitle").and_then(|v| v.as_str()) {
                            let t = t.trim();
                            if !t.is_empty() {
                                custom_title = Some(t.to_string());
                            }
                        }
                        continue;
                    }

                    if line_type == "user" {
                        if let Some(msg_obj) = obj.get("message").and_then(|v| v.as_object()) {
                            let mut text = String::new();
                            let mut images = Vec::new();
                            if let Some(c_str) = msg_obj.get("content").and_then(|v| v.as_str()) {
                                text.push_str(c_str);
                            } else if let Some(content_array) =
                                msg_obj.get("content").and_then(|v| v.as_array())
                            {
                                for item in content_array {
                                    if let Some(item_obj) = item.as_object() {
                                        let item_type =
                                            item_obj.get("type").and_then(|v| v.as_str());
                                        if item_type == Some("text") {
                                            if let Some(t) =
                                                item_obj.get("text").and_then(|v| v.as_str())
                                            {
                                                text.push_str(t);
                                                text.push('\n');
                                            }
                                        } else if item_type == Some("image") {
                                            if let Some(source) =
                                                item_obj.get("source").and_then(|v| v.as_object())
                                            {
                                                let media_type = source
                                                    .get("media_type")
                                                    .and_then(|v| v.as_str())
                                                    .map(String::from);
                                                let base64_data = source
                                                    .get("data")
                                                    .and_then(|v| v.as_str())
                                                    .map(String::from);
                                                images.push(crate::models::ImageReference {
                                                    id: uuid::Uuid::new_v4().to_string(),
                                                    path: None,
                                                    base64: base64_data,
                                                    media_type,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                            let text_trimmed = text.trim().to_string();
                            let images_opt = if images.is_empty() {
                                None
                            } else {
                                Some(images)
                            };

                            // Only record a user RawTurn if there is actual user input (text or images).
                            // Claude Code outputs tool results as line_type == "user" with content items of type "tool_result"
                            // (and empty text/images). Treating these empty tool_result payloads as user turns causes
                            // blank user prompt entries in Codeoba transcripts and splits single assistant responses across multiple turns.
                            if !text_trimmed.is_empty() || images_opt.is_some() {
                                raw_turns.push(RawTurn {
                                    is_user: true,
                                    text: text_trimmed,
                                    timestamp,
                                    model: None,
                                    is_compaction: false,
                                    compaction_time_ms: 0,
                                    images: images_opt,
                                });
                            }
                        }
                    } else if line_type == "assistant" {
                        if let Some(msg_obj) = obj.get("message").and_then(|v| v.as_object()) {
                            let model_name = msg_obj
                                .get("model")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            let mut text = String::new();
                            if let Some(content_array) =
                                msg_obj.get("content").and_then(|v| v.as_array())
                            {
                                for item in content_array {
                                    if let Some(item_obj) = item.as_object() {
                                        if item_obj.get("type").and_then(|v| v.as_str())
                                            == Some("text")
                                        {
                                            if let Some(t) =
                                                item_obj.get("text").and_then(|v| v.as_str())
                                            {
                                                text.push_str(t);
                                                text.push('\n');
                                            }
                                        }
                                    }
                                }
                            }
                            let text_trimmed = text.trim().to_string();
                            if !text_trimmed.is_empty() {
                                raw_turns.push(RawTurn {
                                    is_user: false,
                                    text: text_trimmed,
                                    timestamp,
                                    model: model_name,
                                    is_compaction: false,
                                    compaction_time_ms: 0,
                                    images: None,
                                });
                            }
                        }
                    } else if line_type == "system"
                        && obj.get("subtype").and_then(|v| v.as_str()) == Some("compact_boundary")
                    {
                        let duration_ms = obj
                            .get("compactMetadata")
                            .and_then(|v| v.as_object())
                            .and_then(|m| m.get("durationMs"))
                            .and_then(|d| {
                                d.as_i64()
                                    .or_else(|| d.as_str().and_then(|s| s.parse().ok()))
                            })
                            .unwrap_or(0);

                        raw_turns.push(RawTurn {
                            is_user: false,
                            text: String::new(),
                            timestamp,
                            model: None,
                            is_compaction: true,
                            compaction_time_ms: duration_ms,
                            images: None,
                        });
                    }
                }
            }
        }

        if raw_turns.is_empty() {
            return None;
        }

        // Pair raw turns into Turns
        let mut turns = Vec::new();
        let mut current_idx = 0;
        let mut turn_count = 0;

        while current_idx < raw_turns.len() {
            let user_raw = match raw_turns.get(current_idx) {
                Some(r) => r,
                None => break,
            };
            if user_raw.is_user {
                let mut model_name: Option<String> = None;
                let mut has_compaction = false;
                let mut compaction_time_ms = 0;

                let mut next_idx = current_idx + 1;
                let mut assistant_parts = Vec::new();
                let mut last_timestamp = user_raw.timestamp;

                let mut combined_images = Vec::new();
                if let Some(ref imgs) = user_raw.images {
                    combined_images.extend(imgs.clone());
                }

                while next_idx < raw_turns.len()
                    && raw_turns.get(next_idx).is_some_and(|r| !r.is_user)
                {
                    let next_raw = match raw_turns.get(next_idx) {
                        Some(r) => r,
                        None => break,
                    };
                    if next_raw.is_compaction {
                        has_compaction = true;
                        compaction_time_ms += next_raw.compaction_time_ms;
                    } else if !next_raw.text.is_empty() {
                        assistant_parts.push(next_raw.text.clone());
                    }
                    if let Some(ref imgs) = next_raw.images {
                        combined_images.extend(imgs.clone());
                    }
                    last_timestamp = next_raw.timestamp;
                    if next_raw.model.is_some() {
                        model_name = next_raw.model.clone();
                    }
                    next_idx += 1;
                }

                let assistant_text = assistant_parts.join("\n\n");
                let compute_time_ms = (last_timestamp - user_raw.timestamp).max(0);

                let active_model = model_name.clone().unwrap_or_else(|| "Unknown".to_string());
                let mut extra_data = HashMap::new();
                extra_data.insert("computeTimeMs".to_string(), compute_time_ms.to_string());
                extra_data.insert("model".to_string(), active_model.clone());
                if has_compaction {
                    extra_data.insert("isCompaction".to_string(), "true".to_string());
                    extra_data.insert(
                        "compactionTimeMs".to_string(),
                        compaction_time_ms.to_string(),
                    );
                }

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
                current_idx = next_idx;
            } else {
                // Assistant only / orphan turn
                let active_model = user_raw
                    .model
                    .clone()
                    .unwrap_or_else(|| "Unknown".to_string());
                let mut extra_data = HashMap::new();
                extra_data.insert("computeTimeMs".to_string(), "0".to_string());
                extra_data.insert("model".to_string(), active_model.clone());
                if user_raw.is_compaction {
                    extra_data.insert("isCompaction".to_string(), "true".to_string());
                    extra_data.insert(
                        "compactionTimeMs".to_string(),
                        user_raw.compaction_time_ms.to_string(),
                    );
                }

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

        if let Some(ref s) = slug {
            if let Some(first_turn) = turns.first_mut() {
                first_turn.extra_data.insert("slug".to_string(), s.clone());
            }
        }

        let first_time = raw_turns
            .first()
            .map(|t| t.timestamp)
            .unwrap_or(last_modified);
        let last_time = raw_turns
            .last()
            .map(|t| t.timestamp)
            .unwrap_or(last_modified);

        // Precedence: the title Claude itself displays wins over anything we derive.
        // A `custom-title` line is appended to the transcript on every rename, so the
        // file's mtime/size change invalidates the cache, this parse re-runs, and the
        // new title reaches the sidebar through the normal `session-updated` path.
        let clean_thread_name = if let Some(t) = custom_title {
            t
        } else if let Some(ref s) = slug {
            let home = crate::parsers::get_home_dir();
            let plan_file = home.join(format!(".claude/plans/{}.md", s));
            let raw_title = if plan_file.exists() && plan_file.is_file() {
                if let Ok(file) = File::open(&plan_file) {
                    let mut reader = BufReader::new(file);
                    let mut first_line = String::new();
                    if reader.read_line(&mut first_line).is_ok() && !first_line.trim().is_empty() {
                        let trimmed = first_line.trim();
                        if trimmed.starts_with('#') {
                            let raw_title = trimmed.trim_start_matches('#').trim();
                            // Strip a "plan:"/"goal:" prefix by CHARACTER, not byte. Slicing
                            // raw_title[5..] after matching on `to_lowercase()` can panic:
                            // lowercasing may change byte length, so byte 5 of the original
                            // string is not guaranteed to be a char boundary.
                            let lower = raw_title.to_lowercase();
                            if lower.starts_with("plan:") || lower.starts_with("goal:") {
                                raw_title
                                    .chars()
                                    .skip(5)
                                    .collect::<String>()
                                    .trim()
                                    .to_string()
                            } else {
                                raw_title.to_string()
                            }
                        } else {
                            "Claude Session".to_string()
                        }
                    } else {
                        "Claude Session".to_string()
                    }
                } else {
                    "Claude Session".to_string()
                }
            } else {
                "Claude Session".to_string()
            };

            let formatted_slug_space = s.replace("-", " ").to_lowercase();
            let formatted_slug_hyphen = s.to_lowercase();
            let raw_title_lower = raw_title.to_lowercase();

            if raw_title_lower == formatted_slug_space
                || raw_title_lower == formatted_slug_hyphen
                || raw_title == "Claude Session"
            {
                "Claude Session".to_string()
            } else if raw_title_lower.ends_with(&formatted_slug_space) {
                // Strip by char count, not byte length: the suffix length is measured on
                // the lowercased title, so a byte-index slice of the original can split a
                // multi-byte char and panic.
                let keep = raw_title
                    .chars()
                    .count()
                    .saturating_sub(formatted_slug_space.chars().count());
                raw_title
                    .chars()
                    .take(keep)
                    .collect::<String>()
                    .trim()
                    .to_string()
            } else if raw_title_lower.ends_with(&formatted_slug_hyphen) {
                let keep = raw_title
                    .chars()
                    .count()
                    .saturating_sub(formatted_slug_hyphen.chars().count());
                raw_title
                    .chars()
                    .take(keep)
                    .collect::<String>()
                    .trim()
                    .to_string()
            } else {
                raw_title
            }
        } else {
            "Claude Session".to_string()
        };

        let workspace_name = crate::models::resolve_workspace_name(&cwd);
        let status =
            crate::models::resolve_session_status(self.id(), &session_id, file_path, &turns, &cwd);

        let is_archived = self.resolve_is_archived(&session_id, archived_map);

        let session = Session {
            id: session_id,
            source_id: self.id().to_string(),
            file_path: file_path.to_string(),
            timestamp: first_time,
            updated_at: last_time,
            cwd,
            thread_name: Some(clean_thread_name),
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
            last_modified,
            size,
            "",
            session.clone(),
        );

        Some(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::SourceAdapter;

    /// Claude owns the title: it writes one `custom-title` line per rename (agent-generated
    /// or user-typed) into the transcript, and the last one is what its own UI shows.
    /// Deriving a title from the first prompt instead — which is all we did before — left
    /// the sidebar permanently out of sync with Claude for every renamed session.
    ///
    /// The live half comes for free: the rename appends bytes, so the size/mtime cache key
    /// changes, this parse re-runs, and `SessionState.thread_name` differs, which is what
    /// makes the watcher emit `session-updated`.
    #[test]
    fn claude_custom_title_wins_and_tracks_renames() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp_home = tempfile::tempdir().unwrap();
        let original_home = std::env::var_os("HOME");
        std::env::set_var("HOME", temp_home.path());
        std::env::set_var(
            "CODEOBA_MOCK_HOME",
            temp_home.path().to_string_lossy().to_string(),
        );

        let project_dir = temp_home.path().join(".claude/projects/-tmp-demo");
        std::fs::create_dir_all(&project_dir).unwrap();
        let transcript = project_dir.join("11111111-2222-3333-4444-555555555555.jsonl");
        let user_line = r#"{"type":"user","sessionId":"s-1","cwd":"/tmp/demo","timestamp":"2026-07-26T18:00:00Z","message":{"role":"user","content":"Fix the varying padding between sidebar cards"}}"#;
        std::fs::write(
            &transcript,
            format!(
                "{}\n{}\n",
                user_line,
                r#"{"type":"custom-title","customTitle":"Sidebar card spacing inconsistency","sessionId":"s-1"}"#
            ),
        )
        .unwrap();

        let src = ClaudeSource;
        let path = transcript.to_string_lossy().to_string();
        let first =
            tauri::async_runtime::block_on(async { src.parse_session(&path).await }).unwrap();
        assert_eq!(
            first.thread_name.as_deref(),
            Some("Sidebar card spacing inconsistency"),
            "the transcript's custom-title must beat the title derived from the first prompt"
        );

        // A rename appends another line; the newest one wins.
        std::fs::write(
            &transcript,
            format!(
                "{}\n{}\n{}\n",
                user_line,
                r#"{"type":"custom-title","customTitle":"Sidebar card spacing inconsistency","sessionId":"s-1"}"#,
                r#"{"type":"custom-title","customTitle":"Virtual scroll card sizing","sessionId":"s-1"}"#
            ),
        )
        .unwrap();

        let renamed =
            tauri::async_runtime::block_on(async { src.parse_session(&path).await }).unwrap();
        assert_eq!(
            renamed.thread_name.as_deref(),
            Some("Virtual scroll card sizing"),
            "the last custom-title line is the current title"
        );

        if let Some(h) = original_home {
            std::env::set_var("HOME", h);
        } else {
            std::env::remove_var("HOME");
        }
    }
}
