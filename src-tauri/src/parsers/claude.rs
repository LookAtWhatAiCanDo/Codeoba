use crate::models::{Session, Turn};
use crate::parsers::{is_executable_installed, SourceAdapter};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

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
        self.get_default_log_paths()
    }

    fn get_watch_file_filter(&self) -> Option<fn(&str) -> bool> {
        Some(|path_str| {
            if !path_str.ends_with(".jsonl") {
                return false;
            }
            let path = Path::new(path_str);
            let home = crate::parsers::get_home_dir();
            let base_dir = home.join(".claude/projects");
            if let Ok(rel_path) = path.strip_prefix(&base_dir) {
                rel_path.components().count() <= CLAUDE_LOGS_MAX_DEPTH
            } else {
                false
            }
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
        self.parse_session_impl(file_path).await
    }

    async fn parse_all_sessions(&self) -> Vec<Session> {
        let base_dir = self.get_base_dir();
        if !base_dir.exists() || !base_dir.is_dir() {
            return Vec::new();
        }

        crate::parsers::cache::get_cache_manager().start_scan(self.id());

        let mut paths = Vec::new();
        self.find_jsonl_files(
            &base_dir,
            RECURSION_START_DEPTH,
            CLAUDE_LOGS_MAX_DEPTH,
            &mut paths,
        );

        let mut sessions = Vec::new();
        for path in paths {
            if let Some(session) = self.parse_session(&path.to_string_lossy()).await {
                sessions.push(session);
            }
        }

        crate::parsers::cache::get_cache_manager().end_scan(self.id())
    }
}

impl ClaudeSource {
    // Helper function to recursively collect JSONL files down to the specified max depth.
    fn find_jsonl_files(
        &self,
        dir: &Path,
        depth: usize,
        max_depth: usize,
        paths: &mut Vec<PathBuf>,
    ) {
        if depth > max_depth {
            return;
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    self.find_jsonl_files(&path, depth + 1, max_depth, paths);
                } else if path.is_file()
                    && path.extension().and_then(|s| s.to_str()) == Some("jsonl")
                {
                    paths.push(path);
                }
            }
        }
    }

    fn get_base_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        home.join(".claude/projects")
    }

    async fn parse_session_impl(&self, file_path: &str) -> Option<Session> {
        let path = Path::new(file_path);
        let file = File::open(path).ok()?;
        let metadata = file.metadata().ok()?;
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let size = metadata.len() as i64;

        if let Some(mut cached) = crate::parsers::cache::get_cache_manager()
            .get_cached_session_for_file(self.id(), file_path, last_modified, size)
        {
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
                        .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                        .map(|dt| dt.timestamp_millis())
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

                    if line_type == "user" {
                        if let Some(msg_obj) = obj.get("message").and_then(|v| v.as_object()) {
                            let mut text = String::new();
                            if let Some(c_str) = msg_obj.get("content").and_then(|v| v.as_str()) {
                                text.push_str(c_str);
                            } else if let Some(content_array) =
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
                            raw_turns.push(RawTurn {
                                is_user: true,
                                text: text_trimmed,
                                timestamp,
                                model: None,
                                is_compaction: false,
                                compaction_time_ms: 0,
                            });
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
            let user_raw = &raw_turns[current_idx];
            if user_raw.is_user {
                let mut model_name: Option<String> = None;
                let mut has_compaction = false;
                let mut compaction_time_ms = 0;

                let mut next_idx = current_idx + 1;
                let mut assistant_parts = Vec::new();
                let mut last_timestamp = user_raw.timestamp;

                while next_idx < raw_turns.len() && !raw_turns[next_idx].is_user {
                    let next_raw = &raw_turns[next_idx];
                    if next_raw.is_compaction {
                        has_compaction = true;
                        compaction_time_ms += next_raw.compaction_time_ms;
                    } else if !next_raw.text.is_empty() {
                        assistant_parts.push(next_raw.text.clone());
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

                turns.push(Turn {
                    turn_id: format!("{}_{}", session_id, turn_count),
                    user_message: String::new(),
                    assistant_message: user_raw.text.clone(),
                    timestamp: user_raw.timestamp,
                    input_tokens: Some(0),
                    output_tokens: Some(output_toks),
                    extra_data,
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

        let clean_thread_name = if let Some(ref s) = slug {
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

        let session = Session {
            id: session_id,
            source_id: self.id().to_string(),
            file_path: file_path.to_string(),
            timestamp: first_time,
            updated_at: last_time,
            cwd,
            thread_name: Some(clean_thread_name),
            turns,
            is_archived: false,
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
