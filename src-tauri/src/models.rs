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
pub struct ImageReference {
    pub id: String,
    pub path: Option<String>,
    pub base64: Option<String>,
    pub media_type: Option<String>,
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
    #[serde(default)]
    pub images: Option<Vec<ImageReference>>,
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
                        images: None,
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

// ---------------------------------------------------------------------------
// Antigravity status resolution (v1)
//
// The entire state machine, in resolution order:
//
//   Antigravity[ IDE] app not running               -> idle    (heartbeat)
//   last = PLANNER + ask_question/ask_permission    -> waiting (question showing)
//   last = bare PLANNER, no unfinished bg task      -> idle    (turn over)
//   anything else                                   -> active
//
// Status is derived from the tail state of the session transcript
// (`transcript_full.jsonl` / `transcript.jsonl` under the session's brain
// dir), both rolling windows that Antigravity appends to on every agent step.
// There are deliberately NO time-based staleness caps: any cap X mislabels a
// legitimate command that runs longer than X. The crash/quit failsafe is the
// process heartbeat instead — if the Antigravity app is alive, the transcript
// is trusted indefinitely; if it is dead, every session is idle.
//
// Observed line semantics (verified against real transcripts):
//   * `USER_INPUT` — the user submitted a prompt; the model is thinking.
//   * `PLANNER_RESPONSE` + `ask_question`/`ask_permission` tool call — a
//     question is showing. The `ASK_QUESTION` line is appended only *after*
//     the user answers (it contains the answer), so both edges of the
//     question — the ask and the answer — are reliably observable on disk.
//     This is why "waiting" is reserved for questions.
//   * `PLANNER_RESPONSE` + `run_command` tool call — a command was proposed.
//     IMPORTANT: Antigravity buffers the resulting `RUN_COMMAND` line and only
//     flushes it when the command *finishes* (its `created_at` still says
//     launch time — verified by watching appends live). While the proposal is
//     the last line, the session is EITHER awaiting approval OR executing the
//     command; the transcript cannot tell the two apart. v1 shows both as
//     "active": the session is mid-turn either way, and for auto-approved
//     commands no prompt was ever shown. (Distinguishing them requires
//     process-table probing — deferred until it earns its complexity.)
//   * `PLANNER_RESPONSE` without tool calls — the turn is finished (idle),
//     unless a background task launched this turn has not reported completion
//     (the agent wakes again when the task-finished message arrives).
//   * `RUN_COMMAND` with status `RUNNING` — a background task launched
//     ("…task id: <session>/task-N…"). The line stays `RUNNING` forever;
//     completion arrives later as a `SYSTEM_MESSAGE` (`Task id "…/task-N"
//     finished with result: …`) or a `GENERIC` line (`Task: …/task-N
//     Status: DONE`).
//   * Anything else (tool results, `SYSTEM_MESSAGE`, `GENERIC`, answered
//     `ASK_QUESTION`s, `CHECKPOINT`, …) — the agent is mid-turn.

/// Facts extracted from one full pass over a transcript, cached per session
/// keyed by (path, len, mtime) so the file is re-read only when it changes.
#[derive(Clone, Debug)]
struct AgTranscriptInfo {
    /// `type` of the last transcript line, e.g. "PLANNER_RESPONSE".
    last_type: String,
    /// Tool-call names on the last line (PLANNER_RESPONSE lines only).
    last_tool_calls: Vec<String>,
    /// A background task launched since the last USER_INPUT has no
    /// completion record yet.
    has_unfinished_task: bool,
}

type AgInfoCache = HashMap<String, (std::path::PathBuf, u64, i64, AgTranscriptInfo)>;

fn ag_info_cache() -> &'static std::sync::Mutex<AgInfoCache> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<AgInfoCache>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

/// Picks the transcript to read for a session: the most recently modified of
/// the candidates across both variant dirs, preferring `transcript_full.jsonl`
/// (a superset) when mtimes tie. Returns (path, len, mtime_ms).
fn ag_pick_transcript(session_id: &str) -> Option<(std::path::PathBuf, u64, i64)> {
    let home = crate::parsers::get_home_dir();
    let mut best: Option<(std::path::PathBuf, u64, i64)> = None;
    for variant in ["antigravity", "antigravity-ide"] {
        let logs = home.join(format!(
            ".gemini/{}/brain/{}/.system_generated/logs",
            variant, session_id
        ));
        for name in ["transcript_full.jsonl", "transcript.jsonl"] {
            let path = logs.join(name);
            let meta = match std::fs::metadata(&path) {
                Ok(m) if m.is_file() => m,
                _ => continue,
            };
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            // Strictly-greater keeps the earlier candidate (transcript_full) on ties.
            let is_better = match &best {
                None => true,
                Some((_, _, best_mtime)) => mtime_ms > *best_mtime,
            };
            if is_better {
                best = Some((path, meta.len(), mtime_ms));
            }
        }
    }
    best
}

/// One forward pass over the transcript: remembers the last line and tracks
/// background tasks launched/finished since the most recent USER_INPUT.
fn ag_scan_transcript(path: &std::path::Path) -> Option<AgTranscriptInfo> {
    let content = std::fs::read_to_string(path).ok()?;

    let mut launched: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut finished: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut last: Option<serde_json::Value> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let val = match serde_json::from_str::<serde_json::Value>(trimmed) {
            Ok(v) if v.is_object() => v,
            _ => continue,
        };
        let step_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let status = val.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let content_str = val.get("content").and_then(|v| v.as_str()).unwrap_or("");

        match step_type {
            // Task tracking is scoped to the current turn: a new prompt makes
            // earlier launches irrelevant to the "will the agent wake again?"
            // question this info answers.
            "USER_INPUT" => {
                launched.clear();
                finished.clear();
            }
            // Launch: "Tool is running as a background task with task id: <sid>/task-N".
            // GENERIC RUNNING lines are status polls ("Task: <sid>/task-N Status:
            // RUNNING") — also proof the task exists and runs.
            "RUN_COMMAND" | "GENERIC" if status == "RUNNING" => {
                if let Some(task_id) = parse_task_id(content_str) {
                    launched.insert(task_id);
                }
            }
            // Completion notices, e.g. SYSTEM_MESSAGE `Task id "…/task-N" finished
            // with result: …` or GENERIC `Task: …/task-N Status: DONE`.
            "SYSTEM_MESSAGE" | "ERROR_MESSAGE" | "GENERIC" => {
                if let Some(task_id) = parse_task_id(content_str) {
                    let lower = content_str.to_lowercase();
                    // NOTE: deliberately conservative. In particular `sender=`
                    // is NOT a completion marker — every inter-task message
                    // envelope carries it, so matching it would mark running
                    // tasks finished on any mid-task progress message.
                    if lower.contains("finished")
                        || lower.contains("status: done")
                        || lower.contains("completed")
                        || lower.contains("terminated")
                        || lower.contains("cancelled")
                        || lower.contains("expired")
                    {
                        finished.insert(task_id);
                    }
                }
            }
            _ => {}
        }
        last = Some(val);
    }

    let last = last?;
    let last_tool_calls = match last.get("tool_calls") {
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|tc| tc.get("name").and_then(|v| v.as_str()))
            .map(|s| s.to_string())
            .collect(),
        _ => Vec::new(),
    };

    Some(AgTranscriptInfo {
        last_type: last
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        last_tool_calls,
        has_unfinished_task: launched.difference(&finished).next().is_some(),
    })
}

// `not(test)`: the only caller is ag_agent_alive's non-test path (tests stub
// the heartbeat), so the test build would flag this as dead code.
#[cfg(all(unix, not(test)))]
fn get_running_processes_table() -> String {
    static PS_CACHE: std::sync::OnceLock<std::sync::Mutex<Option<(std::time::Instant, String)>>> =
        std::sync::OnceLock::new();
    let cache = PS_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    let mut guard = match cache.lock() {
        Ok(g) => g,
        Err(_) => return String::new(),
    };
    match &*guard {
        Some((at, text)) if at.elapsed() < std::time::Duration::from_secs(1) => text.clone(),
        _ => {
            let output = std::process::Command::new("ps")
                .args(["-axo", "pid=,ppid=,command="])
                .output();
            let text = match output {
                Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
                Err(_) => String::new(),
            };
            *guard = Some((std::time::Instant::now(), text.clone()));
            text
        }
    }
}

#[cfg(all(not(unix), not(test)))]
fn get_running_processes_table() -> String {
    static TASKLIST_CACHE: std::sync::OnceLock<
        std::sync::Mutex<Option<(std::time::Instant, String)>>,
    > = std::sync::OnceLock::new();
    let cache = TASKLIST_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    let mut guard = match cache.lock() {
        Ok(g) => g,
        Err(_) => return String::new(),
    };
    match &*guard {
        Some((at, text)) if at.elapsed() < std::time::Duration::from_secs(1) => text.clone(),
        _ => {
            let mut cmd = std::process::Command::new("tasklist");
            cmd.args(["/FO", "CSV"]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            let output = cmd.output();
            let text = match output {
                Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
                Err(_) => String::new(),
            };
            *guard = Some((std::time::Instant::now(), text.clone()));
            text
        }
    }
}

/// Heartbeat: is the Antigravity app for this session's variant running at
/// all? This is the crash/quit failsafe that replaces time-based staleness
/// caps — any cap X mislabels a command that runs longer than X, whereas
/// "the writer is alive" stays correct for arbitrarily long work.
///
/// Matches the app bundle path (macOS) / executable name (Windows), not a
/// loose substring, so a terminal sitting in `~/.gemini/antigravity/` or an
/// editor viewing a transcript cannot fake a heartbeat. Fails OPEN (alive)
/// when the process table is unavailable: a possibly-stale "active" beats
/// declaring every session idle.
///
/// Residual blind spot, accepted for v1: the app is alive but this specific
/// run died mid-turn (agent error, user pressed Stop). The session then shows
/// a stale "active" until its next transcript event.
fn ag_agent_alive(source_id: &str) -> bool {
    #[cfg(test)]
    {
        let _ = source_id;
        std::env::var("CODEOBA_MOCK_AGENT_DEAD").is_err()
    }
    #[cfg(not(test))]
    {
        let table = get_running_processes_table();
        if table.is_empty() {
            return true;
        }
        let is_ide = source_id == "antigravity_ide";
        if cfg!(target_os = "macos") {
            let needle = if is_ide {
                "Antigravity IDE.app/Contents"
            } else {
                "Antigravity.app/Contents"
            };
            table.lines().any(|line| line.contains(needle))
        } else if cfg!(windows) {
            let needle = if is_ide {
                "Antigravity IDE.exe"
            } else {
                "Antigravity.exe"
            };
            table.lines().any(|line| line.contains(needle))
        } else {
            // Other platforms: best-effort name match (install layout unknown).
            table
                .lines()
                .any(|line| line.to_lowercase().contains("antigravity"))
        }
    }
}

fn resolve_antigravity_status(source_id: &str, session_id: &str) -> String {
    let (path, len, mtime_ms) = match ag_pick_transcript(session_id) {
        Some(p) => p,
        None => return "idle".to_string(),
    };

    let cached = match ag_info_cache().lock() {
        Ok(guard) => guard.get(session_id).and_then(|(p, l, m, info)| {
            if *p == path && *l == len && *m == mtime_ms {
                Some(info.clone())
            } else {
                None
            }
        }),
        Err(_) => None,
    };
    let info = match cached {
        Some(info) => info,
        None => {
            let info = match ag_scan_transcript(&path) {
                Some(i) => i,
                None => return "idle".to_string(),
            };
            if let Ok(mut guard) = ag_info_cache().lock() {
                guard.insert(session_id.to_string(), (path, len, mtime_ms, info.clone()));
            }
            info
        }
    };

    ag_status_decision(&info, ag_agent_alive(source_id)).to_string()
}

/// The entire v1 state machine, pure and unit-testable:
///
///   agent dead                                    -> idle
///   last = PLANNER + ask_question/ask_permission  -> waiting
///   last = bare PLANNER, no unfinished bg task    -> idle
///   anything else                                 -> active
///
/// "waiting" is reserved for questions because both edges — the ask and the
/// user's answer — are reliably observable in the transcript. Command
/// approval prompts show as "active": the transcript cannot distinguish
/// "approval pending" from "command executing" (the RUN_COMMAND line is only
/// flushed at completion), both are honestly mid-turn, and auto-approved
/// commands never show a prompt at all.
fn ag_status_decision(info: &AgTranscriptInfo, agent_alive: bool) -> &'static str {
    if !agent_alive {
        return "idle";
    }
    if info.last_type == "PLANNER_RESPONSE" {
        let asks_user = info
            .last_tool_calls
            .iter()
            .any(|n| n == "ask_question" || n == "ask_permission");
        if asks_user {
            return "waiting";
        }
        if info.last_tool_calls.is_empty() && !info.has_unfinished_task {
            return "idle";
        }
    }
    "active"
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
        return Some(resolve_antigravity_status(source_id, session_id));
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
    if let Some(last_turn) = turns.last() {
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
            if let Some(first) = components.first() {
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
                images: None,
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
}

#[cfg(test)]
mod antigravity_status_tests {
    use super::resolve_antigravity_status;

    /// Fixture lines mirror real Antigravity transcripts: RUN_COMMAND launch
    /// lines carry "…task id: <sid>/task-N…" and stay RUNNING forever, and
    /// completion arrives as a later SYSTEM_MESSAGE.
    fn write_transcript(home: &std::path::Path, session_id: &str, lines: &[&str]) {
        let logs_dir = home
            .join(".gemini/antigravity/brain")
            .join(session_id)
            .join(".system_generated/logs");
        std::fs::create_dir_all(&logs_dir).unwrap();
        let mut content = lines.join("\n");
        content.push('\n');
        std::fs::write(logs_dir.join("transcript.jsonl"), content).unwrap();
    }

    const USER_INPUT: &str = r#"{"step_index":1,"type":"USER_INPUT","status":"DONE","created_at":"2026-07-13T04:29:11Z","content":"<USER_REQUEST>sleep then quiz me</USER_REQUEST>"}"#;
    const PROPOSE_SLEEP: &str = r#"{"step_index":2,"type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-07-13T04:29:12Z","tool_calls":[{"name":"run_command","args":{"CommandLine":"sleep 10"}}]}"#;
    const LAUNCH_SLEEP: &str = r#"{"step_index":3,"type":"RUN_COMMAND","status":"RUNNING","created_at":"2026-07-13T04:29:20Z","content":"Created At: 2026-07-13T04:29:20Z\nTool is running as a background task with task id: sid/task-3\nTask Description: sleep 10"}"#;
    const AWAIT_TASK: &str = r#"{"step_index":4,"type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-07-13T04:29:22Z","content":"I started sleep 10 and am waiting for it to finish."}"#;
    const FINISH_SLEEP: &str = r#"{"step_index":5,"type":"SYSTEM_MESSAGE","status":"DONE","created_at":"2026-07-13T04:29:35Z","content":"<SYSTEM_MESSAGE>\n[Message] sender=sid/task-3 content=Task id \"sid/task-3\" finished with result:\n\nThe command completed"}"#;
    const FINAL_RESPONSE: &str = r#"{"step_index":6,"type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-07-13T04:29:40Z","content":"All done."}"#;
    const ASK_QUESTION_CALL: &str = r#"{"step_index":7,"type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-07-13T04:29:41Z","tool_calls":[{"name":"ask_question","args":{"Question":"Pick one: A, B, or C?"}}]}"#;
    const QUESTION_ANSWERED: &str = r#"{"step_index":8,"type":"ASK_QUESTION","status":"DONE","created_at":"2026-07-13T04:29:41Z","content":"Created At: 2026-07-13T04:29:41Z\nCompleted At: 2026-07-13T04:31:00Z\nA1: B"}"#;

    /// The whole v1 decision table, exercised directly on the pure function.
    #[test]
    fn decision_table() {
        let planner = |tools: &[&str], unfinished: bool| super::AgTranscriptInfo {
            last_type: "PLANNER_RESPONSE".to_string(),
            last_tool_calls: tools.iter().map(|s| s.to_string()).collect(),
            has_unfinished_task: unfinished,
        };

        // Dead agent trumps everything — even a pending question.
        assert_eq!(
            super::ag_status_decision(&planner(&["ask_question"], false), false),
            "idle"
        );
        // Question showing -> waiting.
        assert_eq!(
            super::ag_status_decision(&planner(&["ask_question"], false), true),
            "waiting"
        );
        assert_eq!(
            super::ag_status_decision(&planner(&["ask_permission"], false), true),
            "waiting"
        );
        // Command proposal -> active, whether approval is pending or the
        // command is executing (the transcript cannot tell them apart; the
        // accepted v1 gap).
        assert_eq!(
            super::ag_status_decision(&planner(&["run_command"], false), true),
            "active"
        );
        // Turn over -> idle.
        assert_eq!(
            super::ag_status_decision(&planner(&[], false), true),
            "idle"
        );
        // Turn "over" but a background task will wake the agent -> active.
        assert_eq!(
            super::ag_status_decision(&planner(&[], true), true),
            "active"
        );
        // Any other last line (tool result, SYSTEM_MESSAGE, ...) -> mid-turn.
        let mid_turn = super::AgTranscriptInfo {
            last_type: "VIEW_FILE".to_string(),
            last_tool_calls: Vec::new(),
            has_unfinished_task: false,
        };
        assert_eq!(super::ag_status_decision(&mid_turn, true), "active");
    }

    /// A run_command proposal shows "active": on disk it is indistinguishable
    /// from the command already executing, and both are mid-turn.
    #[test]
    fn command_proposal_shows_active() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let sid = "ag-approval";

        write_transcript(temp.path(), sid, &[USER_INPUT, PROPOSE_SLEEP]);
        assert_eq!(resolve_antigravity_status("antigravity", sid), "active");

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// While an approved command runs as a background task the session is
    /// "active" (the bare "waiting for the task" PLANNER_RESPONSE does not
    /// read as turn-over); once the completion message and final response
    /// land, it is "idle".
    #[test]
    fn active_while_background_task_runs_and_idle_after_finish() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let sid = "ag-background";

        write_transcript(
            temp.path(),
            sid,
            &[USER_INPUT, PROPOSE_SLEEP, LAUNCH_SLEEP, AWAIT_TASK],
        );
        assert_eq!(resolve_antigravity_status("antigravity", sid), "active");

        write_transcript(
            temp.path(),
            sid,
            &[
                USER_INPUT,
                PROPOSE_SLEEP,
                LAUNCH_SLEEP,
                AWAIT_TASK,
                FINISH_SLEEP,
                FINAL_RESPONSE,
            ],
        );
        assert_eq!(resolve_antigravity_status("antigravity", sid), "idle");

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// Steps 7-8: a pending ask_question is "waiting"; the ASK_QUESTION line
    /// is appended only after the user answers, and then the agent is
    /// resuming — "active", not "waiting".
    #[test]
    fn question_waits_then_resumes_when_answered() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let sid = "ag-question";

        let prefix = [
            USER_INPUT,
            PROPOSE_SLEEP,
            LAUNCH_SLEEP,
            AWAIT_TASK,
            FINISH_SLEEP,
        ];
        let mut lines = prefix.to_vec();
        lines.push(ASK_QUESTION_CALL);
        write_transcript(temp.path(), sid, &lines);
        assert_eq!(resolve_antigravity_status("antigravity", sid), "waiting");

        lines.push(QUESTION_ANSWERED);
        write_transcript(temp.path(), sid, &lines);
        assert_eq!(resolve_antigravity_status("antigravity", sid), "active");

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// Regression: task launch/finish lines mentioning dev-server-ish strings
    /// ("npm run", "vite", "tauri dev") were skipped wholesale, so such tasks
    /// could never be marked finished and the session stuck at "active".
    #[test]
    fn dev_server_task_lines_are_not_skipped() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let sid = "ag-devserver";

        let launch = r#"{"step_index":3,"type":"RUN_COMMAND","status":"RUNNING","created_at":"2026-07-13T06:46:00Z","content":"Tool is running as a background task with task id: sid/task-3\nTask Description: npm run build:local"}"#;
        let finish = r#"{"step_index":5,"type":"SYSTEM_MESSAGE","status":"DONE","created_at":"2026-07-13T06:48:18Z","content":"[Message] sender=sid/task-3 content=Task id \"sid/task-3\" finished with result:\n\nvite v5 building for production... The command completed"}"#;
        // Without the completion line, the task pins the session active.
        write_transcript(temp.path(), sid, &[USER_INPUT, launch, FINAL_RESPONSE]);
        assert_eq!(resolve_antigravity_status("antigravity", sid), "active");
        // With it, the finish is counted (agent alive — this exercises the
        // keyword matching, not the dead-agent shortcut).
        write_transcript(
            temp.path(),
            sid,
            &[USER_INPUT, launch, finish, FINAL_RESPONSE],
        );
        assert_eq!(resolve_antigravity_status("antigravity", sid), "idle");

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// Regression: `sender=` appears on EVERY inter-task message envelope,
    /// not just completions. A mid-task progress message must not mark the
    /// task finished (it briefly did, pinning sessions idle mid-task).
    #[test]
    fn progress_message_does_not_finish_task() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let sid = "ag-progress";

        let progress = r#"{"step_index":4,"type":"SYSTEM_MESSAGE","status":"DONE","created_at":"2026-07-13T04:29:30Z","content":"[Message] sender=sid/task-3 priority=MESSAGE_PRIORITY_LOW content=Still working, no output yet."}"#;
        write_transcript(
            temp.path(),
            sid,
            &[
                USER_INPUT,
                PROPOSE_SLEEP,
                LAUNCH_SLEEP,
                progress,
                AWAIT_TASK,
            ],
        );
        assert_eq!(resolve_antigravity_status("antigravity", sid), "active");

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// Everything is idle the moment the Antigravity app is not running —
    /// the heartbeat is the crash/quit failsafe (there are no time caps).
    #[test]
    fn dead_agent_degrades_to_idle() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let sid = "ag-stale";

        write_transcript(temp.path(), sid, &[USER_INPUT]);
        // Active when agent process is running
        assert_eq!(resolve_antigravity_status("antigravity", sid), "active");

        // Instantly idle when agent process dies
        std::env::set_var("CODEOBA_MOCK_AGENT_DEAD", "1");
        assert_eq!(resolve_antigravity_status("antigravity", sid), "idle");

        std::env::remove_var("CODEOBA_MOCK_AGENT_DEAD");
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// Timer expiry/cancellations or cancelled task lines should be parsed as finished
    /// to avoid getting stuck at "active".
    #[test]
    fn timer_and_cancellation_tasks_are_marked_finished() {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        let sid = "ag-timer-cancel";

        let launch = r#"{"step_index":3,"type":"GENERIC","status":"RUNNING","created_at":"2026-07-13T06:46:00Z","content":"Created At: ...\nTool is running as a background task with task id: sid/task-4\nTask Description: Timer: 30s"}"#;
        let cancel = r#"{"step_index":5,"type":"SYSTEM_MESSAGE","status":"DONE","created_at":"2026-07-13T06:48:18Z","content":"[Message] sender=sid/task-4 priority=MESSAGE_PRIORITY_LOW content=Your scheduled timer was cancelled because you received another message."}"#;
        write_transcript(
            temp.path(),
            sid,
            &[USER_INPUT, launch, cancel, FINAL_RESPONSE],
        );
        assert_eq!(resolve_antigravity_status("antigravity", sid), "idle");

        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}
