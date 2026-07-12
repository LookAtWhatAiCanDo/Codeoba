#![allow(async_fn_in_trait)]

use crate::models::Session;
use std::env;
use std::path::Path;
use std::process::Command;

pub mod antigravity;
pub mod cache;
pub mod claude;
pub mod codex;
pub mod copilot;
pub mod cursor;
pub mod permissions;
pub mod resolver;
pub mod source_decisions;

#[cfg(test)]
mod tests;

pub trait SourceAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn is_available(&self) -> bool;
    fn get_default_log_paths(&self) -> Vec<String>;
    fn get_watch_paths(&self) -> Vec<String>;
    fn get_watch_file_filter(&self) -> Option<fn(&str) -> bool> {
        None
    }
    fn is_file_change_relevant(&self, file_path: &str) -> bool {
        if let Some(filter_fn) = self.get_watch_file_filter() {
            filter_fn(file_path)
        } else {
            let path = std::path::Path::new(file_path);
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if self.id() == "cursor" && (ext == "vscdb" || file_path.contains("state.vscdb")) {
                true
            } else {
                ext == "jsonl"
            }
        }
    }
    async fn parse_session(&self, file_path: &str) -> Option<Session>;
    async fn parse_all_sessions(&self) -> Vec<Session>;
    fn is_app_installed(&self) -> bool {
        true
    }
    fn delete_data_paths(&self) -> bool {
        false
    }
    fn get_data_paths_to_delete(&self) -> Vec<String> {
        Vec::new()
    }
    fn product_url(&self) -> Option<String> {
        None
    }
}

/// Helper function to check if a binary command executable is installed on the host machine.
pub fn is_executable_installed(binary_name: &str) -> bool {
    let home = env::var("HOME").unwrap_or_default();

    // Check common macOS/Linux directories
    let common_paths = vec![
        format!("/opt/homebrew/bin/{}", binary_name),
        format!("/usr/local/bin/{}", binary_name),
        format!("/usr/bin/{}", binary_name),
        format!("{}/.local/bin/{}", home, binary_name),
        format!("{}/.npm-global/bin/{}", home, binary_name),
    ];

    for path in common_paths {
        if Path::new(&path).exists() {
            return true;
        }
    }

    // Check environment PATH directories
    if let Some(path_env) = env::var_os("PATH") {
        let paths = env::split_paths(&path_env);
        let extensions = if cfg!(windows) {
            vec!["", ".exe", ".cmd", ".bat"]
        } else {
            vec![""]
        };

        for dir in paths {
            for ext in &extensions {
                let bin_path = dir.join(format!("{}{}", binary_name, ext));
                if bin_path.exists() {
                    return true;
                }
            }
        }
    }

    // Fallback search using system tools
    let finder = if cfg!(windows) { "where" } else { "which" };
    let mut cmd = Command::new(finder);
    cmd.arg(binary_name)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    if let Ok(status) = cmd.status() {
        if status.success() {
            return true;
        }
    }

    false
}

pub use crate::get_home_dir;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ParserVariant {
    Standard,
    Ide,
}

pub enum Source {
    Claude(claude::ClaudeSource),
    Cursor(cursor::CursorSource),
    Antigravity(antigravity::AntigravitySource),
    AntigravityIde(antigravity::AntigravitySource),
    Copilot(copilot::CopilotSource),
    Codex(codex::CodexSource),
}

fn strip_xml_tags(input: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for c in input.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            result.push(c);
        }
    }
    result
}

pub fn extract_title_from_first_query(first_query: &str) -> String {
    let cleaned = if let Some(start_idx) = first_query.find("<USER_REQUEST>") {
        if let Some(end_idx) = first_query.find("</USER_REQUEST>") {
            first_query[start_idx + "<USER_REQUEST>".len()..end_idx].to_string()
        } else {
            first_query[start_idx + "<USER_REQUEST>".len()..].to_string()
        }
    } else {
        first_query.to_string()
    };

    let mut cleaned = strip_xml_tags(&cleaned);
    cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");

    let prefixes = [
        "i need to ",
        "i want to ",
        "please ",
        "suggest ",
        "propose ",
        "could you ",
        "can you ",
        "how to ",
        "how do i ",
    ];
    let mut title_candidates = cleaned.clone();
    let lower = title_candidates.to_lowercase();
    for prefix in &prefixes {
        if lower.starts_with(prefix) {
            title_candidates = title_candidates[prefix.len()..].to_string();
            break;
        }
    }

    let mut chars = title_candidates.chars();
    let capitalized = match chars.next() {
        None => cleaned,
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    };

    let max_len = 50;
    if capitalized.chars().count() > max_len {
        let mut truncated: String = capitalized.chars().take(max_len).collect();
        if let Some(last_space) = truncated.rfind(' ') {
            if last_space > max_len - 15 {
                truncated.truncate(last_space);
            }
        }
        format!("{}...", truncated.trim())
    } else {
        capitalized
    }
}

pub fn post_process_session(session: &mut Session) {
    if let Some(ref current_title) = session.thread_name {
        let is_generic = matches!(
            current_title.as_str(),
            "Antigravity Session"
                | "Claude Session"
                | "Cursor Session"
                | "Codex Session"
                | "Copilot Session"
                | ""
        );

        if is_generic {
            if let Some(first_turn) = session.turns.first() {
                let first_query = &first_turn.user_message;
                if !first_query.trim().is_empty() {
                    session.thread_name = Some(extract_title_from_first_query(first_query));
                }
            }
        }
    }
}

impl Source {
    pub fn id(&self) -> &str {
        match self {
            Source::Claude(s) => s.id(),
            Source::Cursor(s) => s.id(),
            Source::Antigravity(s) => s.id(),
            Source::AntigravityIde(s) => s.id(),
            Source::Copilot(s) => s.id(),
            Source::Codex(s) => s.id(),
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            Source::Claude(s) => s.display_name(),
            Source::Cursor(s) => s.display_name(),
            Source::Antigravity(s) => s.display_name(),
            Source::AntigravityIde(s) => s.display_name(),
            Source::Copilot(s) => s.display_name(),
            Source::Codex(s) => s.display_name(),
        }
    }

    pub fn is_available(&self) -> bool {
        match self {
            Source::Claude(s) => s.is_available(),
            Source::Cursor(s) => s.is_available(),
            Source::Antigravity(s) => s.is_available(),
            Source::AntigravityIde(s) => s.is_available(),
            Source::Copilot(s) => s.is_available(),
            Source::Codex(s) => s.is_available(),
        }
    }

    pub fn get_watch_paths(&self) -> Vec<String> {
        match self {
            Source::Claude(s) => s.get_watch_paths(),
            Source::Cursor(s) => s.get_watch_paths(),
            Source::Antigravity(s) => s.get_watch_paths(),
            Source::AntigravityIde(s) => s.get_watch_paths(),
            Source::Copilot(s) => s.get_watch_paths(),
            Source::Codex(s) => s.get_watch_paths(),
        }
    }

    pub fn get_watch_file_filter(&self) -> Option<fn(&str) -> bool> {
        match self {
            Source::Claude(s) => s.get_watch_file_filter(),
            Source::Cursor(s) => s.get_watch_file_filter(),
            Source::Antigravity(s) => s.get_watch_file_filter(),
            Source::AntigravityIde(s) => s.get_watch_file_filter(),
            Source::Copilot(s) => s.get_watch_file_filter(),
            Source::Codex(s) => s.get_watch_file_filter(),
        }
    }

    pub fn is_file_change_relevant(&self, file_path: &str) -> bool {
        match self {
            Source::Claude(s) => s.is_file_change_relevant(file_path),
            Source::Cursor(s) => s.is_file_change_relevant(file_path),
            Source::Antigravity(s) => s.is_file_change_relevant(file_path),
            Source::AntigravityIde(s) => s.is_file_change_relevant(file_path),
            Source::Copilot(s) => s.is_file_change_relevant(file_path),
            Source::Codex(s) => s.is_file_change_relevant(file_path),
        }
    }

    pub async fn parse_session(&self, file_path: &str) -> Option<Session> {
        let mut session = match self {
            Source::Claude(s) => s.parse_session(file_path).await,
            Source::Cursor(s) => s.parse_session(file_path).await,
            Source::Antigravity(s) => s.parse_session(file_path).await,
            Source::AntigravityIde(s) => s.parse_session(file_path).await,
            Source::Copilot(s) => s.parse_session(file_path).await,
            Source::Codex(s) => s.parse_session(file_path).await,
        };
        if let Some(ref mut s) = session {
            post_process_session(s);
        }
        session
    }

    pub async fn parse_all_sessions(&self) -> Vec<Session> {
        let mut sessions = match self {
            Source::Claude(s) => s.parse_all_sessions().await,
            Source::Cursor(s) => s.parse_all_sessions().await,
            Source::Antigravity(s) => s.parse_all_sessions().await,
            Source::AntigravityIde(s) => s.parse_all_sessions().await,
            Source::Copilot(s) => s.parse_all_sessions().await,
            Source::Codex(s) => s.parse_all_sessions().await,
        };
        for s in &mut sessions {
            post_process_session(s);
        }
        sessions
    }

    pub fn is_app_installed(&self) -> bool {
        match self {
            Source::Claude(s) => s.is_app_installed(),
            Source::Cursor(s) => s.is_app_installed(),
            Source::Antigravity(s) => s.is_app_installed(),
            Source::AntigravityIde(s) => s.is_app_installed(),
            Source::Copilot(s) => s.is_app_installed(),
            Source::Codex(s) => s.is_app_installed(),
        }
    }

    pub fn delete_data_paths(&self) -> bool {
        match self {
            Source::Claude(s) => s.delete_data_paths(),
            Source::Cursor(s) => s.delete_data_paths(),
            Source::Antigravity(s) => s.delete_data_paths(),
            Source::AntigravityIde(s) => s.delete_data_paths(),
            Source::Copilot(s) => s.delete_data_paths(),
            Source::Codex(s) => s.delete_data_paths(),
        }
    }

    pub fn product_url(&self) -> Option<String> {
        match self {
            Source::Claude(s) => s.product_url(),
            Source::Cursor(s) => s.product_url(),
            Source::Antigravity(s) => s.product_url(),
            Source::AntigravityIde(s) => s.product_url(),
            Source::Copilot(s) => s.product_url(),
            Source::Codex(s) => s.product_url(),
        }
    }
}

/// Returns the shared, process-wide source adapters.
///
/// The adapters are built once and reused. Several of them (Cursor, Antigravity, Codex) carry
/// in-memory caches — composer/workspace and session-title maps plus last-modified markers used to
/// dedup redundant reloads. Rebuilding the adapters on every call (this is invoked from the watcher
/// hot path and multiple IPC commands) discarded those caches, so the dedup logic never took
/// effect. A single shared instance lets the caches persist as designed.
pub fn get_sources_list() -> &'static [Source] {
    static SOURCES: std::sync::OnceLock<Vec<Source>> = std::sync::OnceLock::new();
    SOURCES.get_or_init(|| {
        vec![
            Source::Claude(claude::ClaudeSource),
            Source::Cursor(cursor::CursorSource::new()),
            Source::Antigravity(antigravity::AntigravitySource::new(ParserVariant::Standard)),
            Source::AntigravityIde(antigravity::AntigravitySource::new(ParserVariant::Ide)),
            Source::Copilot(copilot::CopilotSource::new()),
            Source::Codex(codex::CodexSource::new()),
        ]
    })
}

#[cfg(test)]
mod source_list_tests {
    use super::get_sources_list;

    /// The fix: adapters are built once and shared, so their in-memory caches persist across
    /// calls instead of being discarded. Two calls must return the same backing instance.
    #[test]
    fn returns_the_same_shared_instance() {
        let a = get_sources_list();
        let b = get_sources_list();
        assert!(
            std::ptr::eq(a, b),
            "adapters should be built once and shared, not rebuilt per call"
        );
        assert_eq!(a.len(), 6);
    }
}
