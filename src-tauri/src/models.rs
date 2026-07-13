use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceChartPoint {
    pub label: String,
    pub value: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub key_actions: Vec<String>,
    pub errors: Vec<String>,
    pub performance_charts: Vec<PerformanceChartPoint>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub turn_id: String,
    pub user_message: String,
    pub assistant_message: String,
    pub timestamp: i64,
    #[serde(default)]
    pub input_tokens: Option<i64>,
    #[serde(default)]
    pub output_tokens: Option<i64>,
    #[serde(default)]
    pub extra_data: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub source_id: String,
    pub file_path: String,
    pub timestamp: i64,
    pub updated_at: i64,
    pub cwd: Option<String>,
    pub thread_name: Option<String>,
    pub turns: Vec<Turn>,
    #[serde(default)]
    pub is_archived: bool,
    #[serde(default)]
    pub is_pinned: bool,
    pub summary: Option<SessionSummary>,
    #[serde(default)]
    pub snippet: Option<String>,
    #[serde(default)]
    pub workspace_name: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub is_deleted: bool,
}

impl Session {
    pub fn to_lightweight(&self) -> Self {
        let snippet = self.snippet.clone().or_else(|| {
            self.turns.last().map(|turn| {
                let msg = if !turn.user_message.is_empty() {
                    &turn.user_message
                } else {
                    &turn.assistant_message
                };
                // Take the first 100 *characters* (not bytes) so multi-byte UTF-8
                // (emoji, CJK, accents) never gets split. A byte-index truncate here
                // panics on a non-char-boundary; and it was redundant anyway since the
                // string is already ≤100 chars from `.take(100)`.
                let mut snippet_text = msg.chars().take(100).collect::<String>().replace('\n', " ");
                if msg.chars().count() > 100 {
                    snippet_text.push_str("...");
                }
                snippet_text
            })
        });

        Self {
            id: self.id.clone(),
            source_id: self.source_id.clone(),
            file_path: self.file_path.clone(),
            timestamp: self.timestamp,
            updated_at: self.updated_at,
            cwd: self.cwd.clone(),
            thread_name: self.thread_name.clone(),
            turns: self
                .turns
                .iter()
                .enumerate()
                .map(|(i, t)| {
                    let is_last = i == self.turns.len() - 1;
                    Turn {
                        turn_id: t.turn_id.clone(),
                        user_message: if is_last {
                            t.user_message.clone()
                        } else {
                            String::new()
                        },
                        assistant_message: if is_last {
                            t.assistant_message.clone()
                        } else {
                            String::new()
                        },
                        timestamp: t.timestamp,
                        input_tokens: t.input_tokens,
                        output_tokens: t.output_tokens,
                        extra_data: t.extra_data.clone(),
                    }
                })
                .collect(),
            is_archived: self.is_archived,
            is_pinned: self.is_pinned,
            summary: None,
            snippet,
            workspace_name: self.workspace_name.clone(),
            status: self.status.clone(),
            is_deleted: self.is_deleted,
        }
    }
}

/// Returns the last newline-delimited line in `path` that parses as a JSON object.
///
/// A `*.jsonl` transcript's status is determined entirely by its final record, so
/// there is no need to read the whole file: we read only the tail (64 KiB) and scan
/// it backwards for the last parseable object. If the tail holds no parseable object
/// — e.g. a single trailing record larger than the window, or a partial concurrent
/// write with no complete line behind it — we fall back to a full read so the result
/// is identical to scanning every line and keeping the last that parses.
///
/// When the tail starts mid-file the first line is usually a partial fragment; that
/// is harmless because a truncated JSON record simply fails to parse and is skipped.
/// This is stateless (each call is independent) and makes no append-only assumption,
/// so it stays correct even if the underlying tool rotates or rewrites the file.
fn last_json_object(path: &std::path::Path) -> Option<serde_json::Value> {
    use std::io::{Read, Seek, SeekFrom};
    const TAIL_WINDOW: u64 = 64 * 1024;

    let len = std::fs::metadata(path).ok()?.len();

    // Try the tail first; only re-read from the start if the tail yields nothing.
    let starts = if len > TAIL_WINDOW {
        vec![len - TAIL_WINDOW, 0]
    } else {
        vec![0]
    };

    for start in starts {
        let mut file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(_) => return None,
        };
        if file.seek(SeekFrom::Start(start)).is_err() {
            continue;
        }
        let mut buf = Vec::new();
        if file.read_to_end(&mut buf).is_err() {
            continue;
        }
        let text = String::from_utf8_lossy(&buf);
        for line in text.lines().rev() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if val.is_object() {
                    return Some(val);
                }
            }
        }
    }
    None
}

fn get_last_event_info_antigravity(session_id: &str) -> Option<(String, i64, bool, bool)> {
    let home = crate::parsers::get_home_dir();
    let paths = [
        home.join(format!(
            ".gemini/antigravity/brain/{}/.system_generated/logs/transcript_full.jsonl",
            session_id
        )),
        home.join(format!(
            ".gemini/antigravity/brain/{}/.system_generated/logs/transcript.jsonl",
            session_id
        )),
        home.join(format!(
            ".gemini/antigravity-ide/brain/{}/.system_generated/logs/transcript_full.jsonl",
            session_id
        )),
        home.join(format!(
            ".gemini/antigravity-ide/brain/{}/.system_generated/logs/transcript.jsonl",
            session_id
        )),
    ];

    for path in &paths {
        if path.exists() && path.is_file() {
            if let Some(obj) = last_json_object(path).as_ref().and_then(|v| v.as_object()) {
                let step_type = obj
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let created_at_str = obj.get("created_at").and_then(|v| v.as_str());
                let timestamp = created_at_str
                    .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                    .map(|dt| dt.timestamp_millis())
                    .unwrap_or(0);

                let mut has_tool_calls = false;
                let mut has_waiting_tool_calls = false;
                if let Some(serde_json::Value::Array(arr)) = obj.get("tool_calls") {
                    if !arr.is_empty() {
                        has_tool_calls = true;
                        for tc in arr {
                            if let Some(name) = tc.get("name").and_then(|v| v.as_str()) {
                                if name == "ask_question" || name == "ask_permission" {
                                    has_waiting_tool_calls = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                return Some((step_type, timestamp, has_tool_calls, has_waiting_tool_calls));
            }
        }
    }
    None
}

fn get_last_event_info_claude(file_path: &str) -> Option<(String, i64, bool)> {
    let path = std::path::Path::new(file_path);
    if path.exists() && path.is_file() {
        if let Some(obj) = last_json_object(path).as_ref().and_then(|v| v.as_object()) {
            let line_type = obj
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let timestamp = obj
                .get("timestamp")
                .and_then(|v| v.as_str())
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp_millis())
                .unwrap_or(0);

            let is_final_response = line_type == "assistant";
            return Some((line_type, timestamp, is_final_response));
        }
    }
    None
}

/// Extracts the numeric id from the first `task-<digits>` occurrence in `content`,
/// e.g. `"...task-2397 finished"` -> `Some(2397)`. Slice-free (no byte indexing into
/// the string), so it can never panic on a UTF-8 char boundary.
fn parse_task_id(content: &str) -> Option<u32> {
    content
        .split("task-")
        .nth(1)?
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse::<u32>()
        .ok()
}

fn get_active_running_task_antigravity(session_id: &str) -> Option<u32> {
    let home = crate::parsers::get_home_dir();
    let variants = ["antigravity", "antigravity-ide"];

    for variant in &variants {
        let transcript_path = home.join(format!(
            ".gemini/{}/brain/{}/.system_generated/logs/transcript.jsonl",
            variant, session_id
        ));

        if transcript_path.exists() && transcript_path.is_file() {
            if let Ok(file) = std::fs::File::open(&transcript_path) {
                let reader = std::io::BufReader::new(file);
                use std::io::BufRead;

                let mut launched_tasks = Vec::new();
                let mut finished_tasks = std::collections::HashSet::new();

                // `while let Some(Ok(..))` rather than `.lines().flatten()`: flatten
                // swallows read errors and would spin forever on a persistent one.
                let mut lines = reader.lines();
                while let Some(Ok(line)) = lines.next() {
                    let has_run = line.contains("\"RUN_COMMAND\"");
                    let has_finished = line.contains("finished")
                        || line.contains("result")
                        || line.contains("task-");

                    if has_run || has_finished {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                            let step_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            let content = val.get("content").and_then(|v| v.as_str()).unwrap_or("");

                            if step_type == "RUN_COMMAND" {
                                // Extract task ID from content, e.g. "task-2397"
                                if let Some(task_id) = parse_task_id(content) {
                                    let status =
                                        val.get("status").and_then(|v| v.as_str()).unwrap_or("");
                                    if status == "RUNNING" {
                                        launched_tasks.push(task_id);
                                    } else {
                                        finished_tasks.insert(task_id);
                                    }
                                }
                            } else if step_type == "SYSTEM_MESSAGE" || step_type == "ERROR_MESSAGE"
                            {
                                // Extract task ID and check if finished, e.g. "task-2397"
                                if let Some(task_id) = parse_task_id(content) {
                                    let lower = content.to_lowercase();
                                    let task_str = format!("task-{}", task_id);
                                    if lower.contains(&task_str)
                                        && (lower.contains("finished")
                                            || lower.contains("result")
                                            || lower.contains("completed")
                                            || lower.contains("exit")
                                            || lower.contains("terminated"))
                                    {
                                        finished_tasks.insert(task_id);
                                    }
                                }
                            }
                        }
                    }
                }

                // Find the most recently launched task that is not finished
                for task_id in launched_tasks.iter().rev() {
                    if !finished_tasks.contains(task_id) {
                        return Some(*task_id);
                    }
                }
            }
        }
    }
    None
}

pub fn resolve_session_status(
    source_id: &str,
    session_id: &str,
    file_path: &str,
    turns: &[Turn],
    _cwd: &Option<String>,
) -> Option<String> {
    if turns.is_empty() {
        return Some("idle".to_string());
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    if source_id == "antigravity" || source_id == "antigravity_ide" {
        if get_active_running_task_antigravity(session_id).is_some() {
            return Some("active".to_string());
        }

        let mut last_ts = 0;

        if let Some((step_type, ts, has_tool_calls, has_waiting_tool_calls)) =
            get_last_event_info_antigravity(session_id)
        {
            last_ts = ts;
            let age_ms = now - ts;
            let is_recent = age_ms.abs() < 600_000; // 10 minutes
            if is_recent {
                if step_type == "ASK_QUESTION" {
                    return Some("waiting".to_string());
                } else if step_type == "PLANNER_RESPONSE" {
                    if has_tool_calls {
                        if has_waiting_tool_calls {
                            return Some("waiting".to_string());
                        } else {
                            // If a task were executing, line 310 would have already returned "active".
                            // Since we reached here, we are waiting for command approval.
                            return Some("waiting".to_string());
                        }
                    } else {
                        // Check if this PLANNER_RESPONSE wrote an implementation plan that requests feedback
                        let home = crate::parsers::get_home_dir();
                        let variant_folder = if source_id == "antigravity_ide" {
                            "antigravity-ide"
                        } else {
                            "antigravity"
                        };
                        let brain_dir =
                            home.join(format!(".gemini/{}/brain/{}", variant_folder, session_id));
                        let plan_metadata = brain_dir.join("implementation_plan.md.metadata.json");
                        let mut is_waiting_for_plan = false;
                        if plan_metadata.exists() && plan_metadata.is_file() {
                            if let Ok(content) = std::fs::read_to_string(&plan_metadata) {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
                                {
                                    if val.get("requestFeedback").and_then(|v| v.as_bool())
                                        == Some(true)
                                    {
                                        let plan_updated_at =
                                            val.get("updatedAt").and_then(|v| v.as_str());
                                        let plan_ts = plan_updated_at
                                            .and_then(|t| {
                                                chrono::DateTime::parse_from_rfc3339(t).ok()
                                            })
                                            .map(|dt| dt.timestamp_millis())
                                            .unwrap_or(0);
                                        if ts <= plan_ts + 5000 {
                                            is_waiting_for_plan = true;
                                        }
                                    }
                                }
                            }
                        }
                        if is_waiting_for_plan {
                            return Some("waiting".to_string());
                        } else {
                            return Some("idle".to_string());
                        }
                    }
                } else {
                    // USER_INPUT and any other recent step both mean the agent is active.
                    return Some("active".to_string());
                }
            }
        }

        let home = crate::parsers::get_home_dir();
        let variant_folder = if source_id == "antigravity_ide" {
            "antigravity-ide"
        } else {
            "antigravity"
        };
        let brain_dir = home.join(format!(".gemini/{}/brain/{}", variant_folder, session_id));

        // Check for awaiting approval / pending plan -> Waiting
        let plan_metadata = brain_dir.join("implementation_plan.md.metadata.json");
        if plan_metadata.exists() && plan_metadata.is_file() {
            if let Ok(content) = std::fs::read_to_string(&plan_metadata) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if val.get("requestFeedback").and_then(|v| v.as_bool()) == Some(true) {
                        let plan_updated_at = val.get("updatedAt").and_then(|v| v.as_str());
                        let plan_ts = plan_updated_at
                            .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                            .map(|dt| dt.timestamp_millis())
                            .unwrap_or(0);

                        if last_ts <= plan_ts + 5000 && last_ts > 0 {
                            return Some("waiting".to_string());
                        }
                    }
                }
            }
        }

        return Some("idle".to_string());
    }

    if source_id == "claude" {
        if let Some((line_type, ts, _)) = get_last_event_info_claude(file_path) {
            let age_ms = now - ts;
            let is_recent = age_ms.abs() < 300_000;
            if is_recent {
                if line_type == "user" {
                    return Some("active".to_string());
                } else if line_type == "assistant" {
                    return Some("idle".to_string());
                } else {
                    return Some("active".to_string());
                }
            }
        }

        if let Some(slug) = turns.first().and_then(|t| t.extra_data.get("slug")) {
            let home = crate::parsers::get_home_dir();
            let plan_file = home.join(format!(".claude/plans/{}.md", slug));
            if plan_file.exists() && plan_file.is_file() {
                if let Ok(content) = std::fs::read_to_string(&plan_file) {
                    let mut has_uncompleted_tasks = false;
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("- [ ]") || trimmed.starts_with("- [/]") {
                            has_uncompleted_tasks = true;
                            break;
                        }
                    }
                    if has_uncompleted_tasks {
                        return Some("idle".to_string());
                    }
                }
            }
        }

        return Some("idle".to_string());
    }

    // Fallback for other sources (Cursor/Codex/Copilot)
    let last_turn = &turns[turns.len() - 1];
    let mut ts = last_turn.timestamp;
    if ts < 20_000_000_000 {
        ts *= 1000;
    }
    let is_fin = !last_turn.assistant_message.trim().is_empty();
    let age_ms = now - ts;
    let is_recent = age_ms.abs() < 300_000;

    if is_recent {
        if !is_fin {
            return Some("active".to_string());
        } else {
            return Some("idle".to_string());
        }
    }

    Some("idle".to_string())
}

pub fn resolve_workspace_name(cwd: &Option<String>) -> Option<String> {
    let cwd_str = cwd.as_deref()?;
    let path = std::path::Path::new(cwd_str);
    let mut current = path.to_path_buf();
    let mut git_root: Option<std::path::PathBuf> = None;

    // Walk upward from the session's cwd and stop at the FIRST (nearest) enclosing repo.
    // Overwriting on every hit would keep the shallowest match, so a `.git` at $HOME
    // (chezmoi/yadm/`git init ~` setups) or an outer monorepo would mislabel every
    // nested session with the wrong workspace.
    loop {
        if current.join(".git").exists() {
            git_root = Some(current.clone());
            break;
        }
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => break,
        }
    }

    if let Some(root) = git_root {
        if let Ok(rel) = path.strip_prefix(&root) {
            let components: Vec<_> = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect();
            if !components.is_empty() {
                let first = &components[0];
                let standard_folders: std::collections::HashSet<&str> = [
                    "src",
                    "lib",
                    "bin",
                    "app",
                    "tests",
                    "docs",
                    "config",
                    ".github",
                    "target",
                    "dist",
                    "node_modules",
                    "build",
                    "public",
                    "assets",
                    "functions",
                    "src-tauri",
                ]
                .iter()
                .cloned()
                .collect();

                if !standard_folders.contains(first.as_str()) {
                    return Some(first.clone());
                }
            }
        }
        return root.file_name().map(|n| n.to_string_lossy().into_owned());
    }

    path.file_name().map(|n| n.to_string_lossy().into_owned())
}

#[cfg(test)]
mod to_lightweight_tests {
    use super::{Session, Turn};
    use std::collections::HashMap;

    fn session_with_last_user_message(msg: &str) -> Session {
        Session {
            id: "s1".into(),
            source_id: "claude".into(),
            file_path: "/tmp/x".into(),
            timestamp: 0,
            updated_at: 0,
            cwd: None,
            thread_name: None,
            turns: vec![Turn {
                turn_id: "t1".into(),
                user_message: msg.into(),
                assistant_message: String::new(),
                timestamp: 0,
                input_tokens: None,
                output_tokens: None,
                extra_data: HashMap::new(),
            }],
            is_archived: false,
            is_pinned: false,
            summary: None,
            snippet: None,
            workspace_name: None,
            status: None,
            is_deleted: false,
        }
    }

    /// Regression: a snippet whose 100th-character boundary falls inside a multi-byte
    /// UTF-8 char used to panic (`String::truncate` at a non-char-boundary), freezing
    /// the UI because the panicking `get_all_sessions` task never returned a response.
    /// "あ" is 3 bytes, so byte 100 lands mid-character.
    #[test]
    fn snippet_does_not_panic_on_multibyte_boundary() {
        let msg = "あ".repeat(150);
        let light = session_with_last_user_message(&msg).to_lightweight();
        let snippet = light.snippet.expect("snippet");
        // 100 chars kept, plus the ellipsis.
        assert_eq!(snippet.chars().count(), 103);
        assert!(snippet.ends_with("..."));
    }

    /// A short message keeps its content and gets no ellipsis.
    #[test]
    fn snippet_short_message_unchanged() {
        let light = session_with_last_user_message("hello").to_lightweight();
        assert_eq!(light.snippet.as_deref(), Some("hello"));
    }
}

#[cfg(test)]
mod parse_task_id_tests {
    use super::parse_task_id;

    #[test]
    fn extracts_digits_after_task_prefix() {
        assert_eq!(parse_task_id("running task-2397 now"), Some(2397));
        assert_eq!(parse_task_id("task-5 finished"), Some(5));
        assert_eq!(parse_task_id("prefix task-42"), Some(42));
    }

    #[test]
    fn none_without_valid_task_id() {
        assert_eq!(parse_task_id("no task here"), None);
        assert_eq!(parse_task_id("task-"), None);
        assert_eq!(parse_task_id("task-abc"), None);
    }

    /// Slice-free: multi-byte content before the marker must not panic.
    #[test]
    fn handles_multibyte_content() {
        assert_eq!(parse_task_id("日本語 task-7 完了"), Some(7));
    }
}

#[cfg(test)]
mod workspace_name_tests {
    use super::resolve_workspace_name;

    fn git_dir(path: &std::path::Path) {
        std::fs::create_dir_all(path.join(".git")).unwrap();
    }

    /// The regression: a `.git` above the real repo (e.g. dotfiles at $HOME) must not
    /// hijack the label. The nearest enclosing repo wins.
    #[test]
    fn picks_nearest_repo_not_outermost() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path();
        git_dir(home); // stand-in for `git init ~`

        let repo = home.join("dev/myrepo");
        let cwd = repo.join("src/backend");
        std::fs::create_dir_all(&cwd).unwrap();
        git_dir(&repo);

        let name = resolve_workspace_name(&Some(cwd.to_string_lossy().into_owned()));
        assert_eq!(name.as_deref(), Some("myrepo"));
    }

    /// Nested repos resolve to the inner one, not the parent.
    #[test]
    fn nested_repos_resolve_to_inner() {
        let tmp = tempfile::tempdir().unwrap();
        let outer = tmp.path().join("monorepo");
        let inner = outer.join("vendor/plugin");
        std::fs::create_dir_all(&inner).unwrap();
        git_dir(&outer);
        git_dir(&inner);

        let name = resolve_workspace_name(&Some(inner.to_string_lossy().into_owned()));
        assert_eq!(name.as_deref(), Some("plugin"));
    }

    /// When cwd sits in a standard subfolder of the repo, the repo name is used —
    /// not the subfolder name.
    #[test]
    fn standard_subfolder_yields_repo_name() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("acme");
        let cwd = repo.join("src");
        std::fs::create_dir_all(&cwd).unwrap();
        git_dir(&repo);

        let name = resolve_workspace_name(&Some(cwd.to_string_lossy().into_owned()));
        assert_eq!(name.as_deref(), Some("acme"));
    }

    #[test]
    fn no_repo_falls_back_to_leaf_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let cwd = tmp.path().join("loose/folder");
        std::fs::create_dir_all(&cwd).unwrap();

        let name = resolve_workspace_name(&Some(cwd.to_string_lossy().into_owned()));
        assert_eq!(name.as_deref(), Some("folder"));
    }
}

#[cfg(test)]
mod last_json_object_tests {
    use super::get_active_running_task_antigravity;
    use super::last_json_object;
    use std::io::Write;

    fn write_file(bytes: &[u8]) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(bytes).unwrap();
        f.flush().unwrap();
        f
    }

    /// The common case: the final record is returned, not an earlier one.
    #[test]
    fn returns_last_record() {
        let f = write_file(
            b"{\"type\":\"a\",\"n\":1}\n{\"type\":\"b\",\"n\":2}\n{\"type\":\"c\",\"n\":3}\n",
        );
        let val = last_json_object(f.path()).expect("some object");
        assert_eq!(val.get("type").and_then(|v| v.as_str()), Some("c"));
    }

    /// A trailing newline / blank final line must not hide the real last record.
    #[test]
    fn ignores_trailing_blank_lines() {
        let f = write_file(b"{\"type\":\"a\"}\n{\"type\":\"b\"}\n\n  \n");
        let val = last_json_object(f.path()).expect("some object");
        assert_eq!(val.get("type").and_then(|v| v.as_str()), Some("b"));
    }

    /// A partial trailing write (incomplete JSON) is skipped in favor of the last
    /// complete record — the concurrent-writer case.
    #[test]
    fn skips_partial_trailing_line() {
        let f = write_file(b"{\"type\":\"done\"}\n{\"type\":\"half\",\"x\":");
        let val = last_json_object(f.path()).expect("some object");
        assert_eq!(val.get("type").and_then(|v| v.as_str()), Some("done"));
    }

    /// The whole-file fallback: when a single trailing record is larger than the
    /// 64 KiB tail window, the tail contains no complete line, so the reader must
    /// re-read from the start and still find the last parseable record.
    #[test]
    fn falls_back_when_last_record_exceeds_window() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"{\"type\":\"early\"}\n");
        // A final record whose JSON string value alone exceeds the tail window,
        // so seeking to len-64KiB lands inside it with no newline behind it.
        let big = "z".repeat(100 * 1024);
        bytes.extend_from_slice(format!("{{\"type\":\"late\",\"blob\":\"{}\"}}\n", big).as_bytes());
        let f = write_file(&bytes);

        let val = last_json_object(f.path()).expect("some object");
        assert_eq!(val.get("type").and_then(|v| v.as_str()), Some("late"));
    }

    /// A file with no parseable object yields None (caller falls through to the
    /// next candidate path).
    #[test]
    fn none_when_no_object() {
        let f = write_file(b"not json\n[1,2,3]\n");
        assert!(last_json_object(f.path()).is_none());
    }

    #[test]
    fn test_antigravity_task_tracking() {
        let _lock = crate::HOME_MUTEX.lock().unwrap();
        let temp_dir = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp_dir.path());

        let session_id = "test-session-task";
        let logs_dir = temp_dir
            .path()
            .join(".gemini/antigravity/brain")
            .join(session_id)
            .join(".system_generated/logs");
        std::fs::create_dir_all(&logs_dir).unwrap();
        let transcript_path = logs_dir.join("transcript.jsonl");

        // Write transcript with task start and task finished messages (carrying quotes)
        let content = r#"{"type":"USER_INPUT","content":"please run test"}
{"type":"RUN_COMMAND","content":"task-1001","status":"RUNNING"}
{"type":"RUN_COMMAND","content":"task-1002","status":"RUNNING"}
{"type":"SYSTEM_MESSAGE","content":"Task id \"3cef995a-35ce-4de2-abf6-ca7437cb7eec/task-1001\" finished with result: Success"}
"#;
        std::fs::write(&transcript_path, content).unwrap();

        // Call resolver: task 1001 should be marked finished, but 1002 is still running!
        let active_task = get_active_running_task_antigravity(session_id);
        assert_eq!(active_task, Some(1002));

        // Finish 1002 as well
        std::fs::write(
            &transcript_path,
            format!(
                "{}{{\"type\":\"SYSTEM_MESSAGE\",\"content\":\"Task id \\\"mock/task-1002\\\" finished successfully\"}}\n",
                content
            ),
        ).unwrap();

        let active_task_after = get_active_running_task_antigravity(session_id);
        assert_eq!(active_task_after, None);

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}
