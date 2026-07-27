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

/// One transcript file's identity within a rewind-fork family.
struct FamilyMember {
    path: String,
    /// The session id this file reports (in-file `sessionId`, else the file stem). Claude's
    /// metadata keys archive state by it -- but only ever for the newest member.
    session_id: String,
    /// Every message uuid in the file, in transcript order, used to prove the winner
    /// really did inherit an ancestor's history before that ancestor is suppressed.
    uuids: Vec<String>,
    /// Timestamp of the last message; the family member with the greatest one is the
    /// branch the user is actually on.
    last_message: String,
}

/// The outcome of grouping a project directory's transcripts into fork families.
#[derive(Default)]
pub(crate) struct ForkFamilies {
    /// Ancestor path -> the path of the family member that superseded it. Ancestors are
    /// suppressed; the value lets the watcher redirect a single-file parse to the winner.
    superseded: HashMap<String, String>,
    /// Winner path -> every session id in its family, newest first. Archive state is
    /// resolved across all of them.
    family_ids: HashMap<String, Vec<String>>,
}

impl ForkFamilies {
    pub(crate) fn superseded_by(&self, file_path: &str) -> Option<&str> {
        self.superseded.get(file_path).map(|s| s.as_str())
    }

    fn ids_for(&self, file_path: &str) -> Option<&[String]> {
        self.family_ids.get(file_path).map(|v| v.as_slice())
    }
}

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
        // The watcher hands us one changed file. If it is a rewind-fork ancestor, the
        // session the user actually sees lives in a sibling file, so parse that instead --
        // returning the ancestor here would re-add the duplicate card the scan removed.
        let families = self.scan_fork_families(&self.sibling_transcripts(file_path));
        if let Some(winner) = families.superseded_by(file_path) {
            let winner = winner.to_string();
            crate::parsers::cache::get_cache_manager().evict_cached_file(self.id(), file_path);
            let ids = families.ids_for(&winner).map(|s| s.to_vec());
            return self.parse_session_impl(&winner, None, ids.as_deref()).await;
        }
        let ids = families.ids_for(file_path).map(|s| s.to_vec());
        self.parse_session_impl(file_path, None, ids.as_deref())
            .await
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
        let families = self.scan_fork_families(&paths);

        let mut sessions = Vec::new();
        for path in paths {
            let path_str = path.to_string_lossy().to_string();
            // A rewind-fork ancestor produces no session of its own: its entire transcript
            // was copied into the newer member, which is parsed below in its own right.
            if families.superseded_by(&path_str).is_some() {
                crate::parsers::cache::get_cache_manager().evict_cached_file(self.id(), &path_str);
                continue;
            }
            let ids = families.ids_for(&path_str).map(|s| s.to_vec());
            if let Some(session) = self
                .parse_session_impl(&path_str, Some(&archived_map), ids.as_deref())
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

    /// The transcripts that could possibly share a fork family with `file_path`: its own
    /// project directory only. A fork always lands beside its ancestor, so there is no
    /// reason to re-walk the whole source tree on a single-file watcher event.
    fn sibling_transcripts(&self, file_path: &str) -> Vec<PathBuf> {
        let dir = match Path::new(file_path).parent() {
            Some(d) => d,
            None => return Vec::new(),
        };
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return Vec::new(),
        };
        entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("jsonl"))
            .collect()
    }

    /// Reads just far enough to learn a transcript's root message uuid: the first record
    /// carrying `"parentUuid": null`. Cheap by design -- it stops on the first hit, so the
    /// common case (no fork) costs a handful of lines per file rather than a full parse.
    fn read_root_uuid(path: &Path) -> Option<String> {
        let file = File::open(path).ok()?;
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let value = match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let obj = match value.as_object() {
                Some(o) => o,
                None => continue,
            };
            // `uuid` present and `parentUuid` explicitly null marks the first message.
            // Non-message bookkeeping lines (`custom-title`, `queue-operation`, `mode`)
            // carry neither, and a compaction boundary is also parent-less but can only
            // ever appear after the real root, so first-hit-wins is correct.
            if obj.contains_key("parentUuid")
                && obj.get("parentUuid").map(|v| v.is_null()).unwrap_or(false)
            {
                if let Some(u) = obj.get("uuid").and_then(|v| v.as_str()) {
                    return Some(u.to_string());
                }
            }
        }
        None
    }

    /// Collects every message uuid (in order) and the last message timestamp.
    /// Only ever called for files already known to share a root with another file.
    fn read_family_member(path: &Path) -> Option<FamilyMember> {
        let file = File::open(path).ok()?;
        let mut uuids = Vec::new();
        let mut last_message = String::new();
        // Mirror `parse_session_impl`: the in-file `sessionId` wins over the file stem, so
        // the ids collected here are the same ones archive state is later looked up by.
        // (Claude rewrites `sessionId` on every copied record, so a forked file reports its
        // own id throughout, not the ancestor's.)
        let mut session_id = path.file_stem()?.to_string_lossy().to_string();
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(serde_json::Value::Object(obj)) = serde_json::from_str(&line) {
                if let Some(u) = obj.get("uuid").and_then(|v| v.as_str()) {
                    uuids.push(u.to_string());
                    if let Some(ts) = obj.get("timestamp").and_then(|v| v.as_str()) {
                        if ts > last_message.as_str() {
                            last_message = ts.to_string();
                        }
                    }
                    if let Some(sid) = obj.get("sessionId").and_then(|v| v.as_str()) {
                        session_id = sid.to_string();
                    }
                }
            }
        }
        if uuids.is_empty() {
            return None;
        }
        Some(FamilyMember {
            path: path.to_string_lossy().to_string(),
            session_id,
            uuids,
            last_message,
        })
    }

    /// Groups transcripts into rewind-fork families and decides which member survives.
    ///
    /// Claude forks a session when the user rewinds to an earlier prompt (or resumes after
    /// the app is quit mid-turn): it writes a NEW transcript file under a new session id
    /// and copies the entire prior history into it verbatim. Both files then parse as
    /// complete sessions with the same title and start time, so the sidebar shows what
    /// looks like the same conversation twice.
    ///
    /// Worse, only the newest file is reachable from Claude's own metadata -- the
    /// `local_*.json` record keys archive state by a single `cliSessionId`. Archiving in
    /// Claude therefore hides the newest file and leaves every ancestor behind as a card
    /// that no amount of archiving can ever dismiss.
    ///
    /// Because the fork copies the full history, the newest member already *is* the merged
    /// session; nothing needs splicing. Ancestors are suppressed outright.
    pub(crate) fn scan_fork_families(&self, paths: &[PathBuf]) -> ForkFamilies {
        let mut families = ForkFamilies::default();

        // Pass 1 -- cheap. Group by (project dir, root uuid). Anything unique here is an
        // ordinary session and never gets read again.
        let mut by_root: HashMap<(PathBuf, String), Vec<PathBuf>> = HashMap::new();
        for path in paths {
            if let Some(root) = Self::read_root_uuid(path) {
                let dir = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
                by_root.entry((dir, root)).or_default().push(path.clone());
            }
        }

        // Pass 2 -- only for the rare group with more than one file.
        for ((_, root), group) in by_root {
            if group.len() < 2 {
                continue;
            }
            let mut members: Vec<FamilyMember> = group
                .iter()
                .filter_map(|p| Self::read_family_member(p))
                .collect();
            if members.len() < 2 {
                continue;
            }
            // Newest last message wins: that is the branch the user is on. Ties break on
            // path so the choice is deterministic across scans.
            members.sort_by(|a, b| {
                b.last_message
                    .cmp(&a.last_message)
                    .then_with(|| a.path.cmp(&b.path))
            });

            let (winner, ancestors) = match members.split_first() {
                Some(split) => split,
                None => continue,
            };
            let winner_uuids: std::collections::HashSet<&str> =
                winner.uuids.iter().map(|s| s.as_str()).collect();

            let mut ids = vec![winner.session_id.clone()];
            let mut suppressed = Vec::new();
            for ancestor in ancestors {
                if !Self::winner_supersedes(&winner_uuids, ancestor) {
                    crate::log_warn!(
                        "[claude] {} shares root {} with {} but is not contained in it; \
                         keeping both rather than hiding history.",
                        ancestor.session_id,
                        root,
                        winner.session_id
                    );
                    continue;
                }
                ids.push(ancestor.session_id.clone());
                suppressed.push(ancestor.path.clone());
            }

            if suppressed.is_empty() {
                continue;
            }
            for path in suppressed {
                families.superseded.insert(path, winner.path.clone());
            }
            families.family_ids.insert(winner.path.clone(), ids);
        }

        families
    }

    /// True when `ancestor` is safe to hide behind the winner: everything it holds is
    /// either already in the winner, or belongs to one contiguous abandoned tail at the
    /// end. A gap in the middle would mean the winner is missing history the ancestor
    /// still has, so the ancestor keeps its own card.
    fn winner_supersedes(
        winner_uuids: &std::collections::HashSet<&str>,
        ancestor: &FamilyMember,
    ) -> bool {
        let divergence = ancestor
            .uuids
            .iter()
            .position(|u| !winner_uuids.contains(u.as_str()));
        match divergence {
            // Fully contained: a pure ancestor with no abandoned work at all.
            None => true,
            // Diverges at its very first record. The shared root is normally that record,
            // so this only happens when the two files do not actually line up at the start
            // (a truncated or rotated transcript). Not a copy; keep it.
            Some(0) => false,
            Some(i) => ancestor
                .uuids
                .get(i..)
                .is_some_and(|tail| tail.iter().all(|u| !winner_uuids.contains(u.as_str()))),
        }
    }

    fn resolve_is_archived(
        &self,
        session_id: &str,
        archived_map: Option<&HashMap<String, bool>>,
    ) -> bool {
        self.resolve_is_archived_for_ids(
            std::slice::from_ref(&session_id.to_string()),
            archived_map,
        )
    }

    /// Archive state for a whole fork family: archived if ANY member id is marked archived.
    ///
    /// Claude records archive state once per conversation, in a `local_*.json` whose
    /// `cliSessionId` names only the newest transcript. Ancestors are named by nothing, so
    /// looking each file up on its own id makes them permanently unarchivable -- archive
    /// the conversation in Claude and the ancestor's card survives. Suppression already
    /// hides ancestors, and the OR here means it stays correct even if a future Claude
    /// points `cliSessionId` at a different member of the family.
    ///
    /// A missing id still means "not archived": transcripts written by the SDK
    /// (`entrypoint: sdk-ts`) never get a desktop metadata record at all, and those are
    /// genuinely unarchived rather than orphaned.
    fn resolve_is_archived_for_ids(
        &self,
        session_ids: &[String],
        archived_map: Option<&HashMap<String, bool>>,
    ) -> bool {
        let lookup = |map: &HashMap<String, bool>| {
            session_ids
                .iter()
                .any(|id| map.get(id).copied().unwrap_or(false))
        };
        match archived_map {
            Some(map) => lookup(map),
            None => lookup(&self.load_archived_session_map()),
        }
    }

    async fn parse_session_impl(
        &self,
        file_path: &str,
        archived_map: Option<&HashMap<String, bool>>,
        family_ids: Option<&[String]>,
    ) -> Option<Session> {
        let path = Path::new(file_path);
        let file = File::open(path).ok()?;
        let metadata = file.metadata().ok()?;
        let last_modified = file_last_modified_millis(path);

        let size = metadata.len() as i64;

        if let Some(mut cached) = crate::parsers::cache::get_cache_manager()
            .get_cached_session_for_file(self.id(), file_path, last_modified, size)
        {
            let current_archived = match family_ids {
                Some(ids) => self.resolve_is_archived_for_ids(ids, archived_map),
                None => self.resolve_is_archived(&cached.id, archived_map),
            };
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

        let is_archived = match family_ids {
            Some(ids) => self.resolve_is_archived_for_ids(ids, archived_map),
            None => self.resolve_is_archived(&session_id, archived_map),
        };

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

    /// Guards the temp `$HOME` swap so every fork test gets an isolated projects tree,
    /// metadata dir, and session store.
    struct MockHome {
        _lock: std::sync::MutexGuard<'static, ()>,
        dir: tempfile::TempDir,
        original: Option<std::ffi::OsString>,
    }

    impl MockHome {
        fn new() -> Self {
            let lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
            let dir = tempfile::tempdir().unwrap();
            let original = std::env::var_os("HOME");
            std::env::set_var("HOME", dir.path());
            std::env::set_var(
                "CODEOBA_MOCK_HOME",
                dir.path().to_string_lossy().to_string(),
            );
            crate::parsers::cache::get_cache_manager().clear_in_memory_caches();
            Self {
                _lock: lock,
                dir,
                original,
            }
        }

        fn project_dir(&self) -> PathBuf {
            let dir = self.dir.path().join(".claude/projects/-tmp-demo");
            std::fs::create_dir_all(&dir).unwrap();
            dir
        }

        /// Writes the `local_*.json` record Claude uses to track a conversation. Note it
        /// names exactly one transcript, via `cliSessionId` — that single-pointer shape is
        /// the whole reason ancestors go stale.
        fn write_claude_metadata(&self, cli_session_id: &str, is_archived: bool) {
            let dir = self
                .dir
                .path()
                .join("Library/Application Support/Claude/claude-code-sessions/w1");
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(
                dir.join(format!("local_{cli_session_id}.json")),
                format!(
                    r#"{{"sessionId":"local_{cli_session_id}","cliSessionId":"{cli_session_id}","isArchived":{is_archived},"title":"Read Aloud deeplink scrolling issue"}}"#
                ),
            )
            .unwrap();
        }
    }

    impl Drop for MockHome {
        fn drop(&mut self) {
            match self.original.take() {
                Some(h) => std::env::set_var("HOME", h),
                None => std::env::remove_var("HOME"),
            }
            std::env::remove_var("CODEOBA_MOCK_HOME");
        }
    }

    /// One transcript line. `sid` mirrors reality: Claude stamps every record with the id
    /// of the file it lives in, rewriting it on the records it copies into a fork.
    fn msg(
        sid: &str,
        uuid: &str,
        parent: Option<&str>,
        ts: &str,
        role: &str,
        text: &str,
    ) -> String {
        let parent = match parent {
            Some(p) => format!("\"{p}\""),
            None => "null".to_string(),
        };
        format!(
            r#"{{"type":"{role}","uuid":"{uuid}","parentUuid":{parent},"timestamp":"{ts}","sessionId":"{sid}","cwd":"/tmp/demo","message":{{"role":"{role}","content":"{text}"}}}}"#
        )
    }

    /// The shared history a fork copies verbatim, stamped with `sid`'s session id.
    fn shared_history(sid: &str) -> String {
        [
            msg(sid, "u-root", None, "2026-07-27T00:37:43Z", "user", "start"),
            msg(
                sid,
                "a-1",
                Some("u-root"),
                "2026-07-27T00:38:00Z",
                "assistant",
                "working",
            ),
        ]
        .join("\n")
    }

    /// A rewind-fork must collapse to a single card, and that card must honour the archive
    /// state Claude recorded against the newest transcript.
    ///
    /// Rewinding to an earlier prompt makes Claude write a NEW transcript under a new
    /// session id with the entire prior history copied in verbatim. Parsed per-file, that
    /// is two sessions with one title and one start time — the duplicate the user sees.
    ///
    /// The archive half is the sharper bug. Claude's `local_*.json` names only the newest
    /// transcript in `cliSessionId`, so the ancestor is reachable from no metadata at all
    /// and `unwrap_or(false)` made it permanently unarchivable: archive the conversation in
    /// Claude and the ancestor's card stays on screen, looking like a session you know you
    /// just archived.
    #[test]
    fn claude_rewind_fork_collapses_and_inherits_archive_state() {
        let home = MockHome::new();
        let project = home.project_dir();
        let old_id = "aaaaaaaa-0000-0000-0000-000000000000";
        let new_id = "bbbbbbbb-0000-0000-0000-000000000000";

        // Ancestor: shared history plus the abandoned tail left behind when the app was
        // quit mid-turn.
        let ancestor = project.join(format!("{old_id}.jsonl"));
        std::fs::write(
            &ancestor,
            format!(
                "{}\n{}\n",
                shared_history(old_id),
                msg(
                    old_id,
                    "u-abandoned",
                    Some("a-1"),
                    "2026-07-27T01:41:02Z",
                    "user",
                    "interrupted"
                )
            ),
        )
        .unwrap();

        // Winner: the same history copied in, then the resubmitted prompt.
        let winner = project.join(format!("{new_id}.jsonl"));
        std::fs::write(
            &winner,
            format!(
                "{}\n{}\n{}\n",
                shared_history(new_id),
                msg(
                    new_id,
                    "u-retry",
                    Some("a-1"),
                    "2026-07-27T01:41:46Z",
                    "user",
                    "retry"
                ),
                msg(
                    new_id,
                    "a-2",
                    Some("u-retry"),
                    "2026-07-27T01:48:19Z",
                    "assistant",
                    "done"
                )
            ),
        )
        .unwrap();

        // Claude knows this conversation only by its newest transcript, and it is archived.
        home.write_claude_metadata(new_id, true);

        let src = ClaudeSource;
        let result = tauri::async_runtime::block_on(async { src.parse_all_sessions().await });
        let live: Vec<_> = result.sessions.iter().filter(|s| !s.is_deleted).collect();

        assert_eq!(
            live.len(),
            1,
            "a rewind-fork family must yield one session, got {:?}",
            live.iter().map(|s| &s.id).collect::<Vec<_>>()
        );
        assert_eq!(
            live[0].id, new_id,
            "the newest member survives; it already holds the copied history"
        );
        assert_eq!(
            live[0].turns.len(),
            2,
            "the surviving transcript keeps its own turns; the abandoned tail is not spliced in"
        );
        assert!(
            live[0].is_archived,
            "archiving in Claude must hide the whole family, not just the newest file"
        );
    }

    /// The ancestor inherits archive state even when Claude's record points at it rather
    /// than the newest file, because resolution ORs across the family.
    #[test]
    fn claude_fork_archive_resolves_from_any_member() {
        let home = MockHome::new();
        let project = home.project_dir();
        let old_id = "aaaaaaaa-1111-0000-0000-000000000000";
        let new_id = "bbbbbbbb-1111-0000-0000-000000000000";

        std::fs::write(
            project.join(format!("{old_id}.jsonl")),
            format!(
                "{}\n{}\n",
                shared_history(old_id),
                msg(
                    old_id,
                    "u-old",
                    Some("a-1"),
                    "2026-07-27T00:40:00Z",
                    "user",
                    "old"
                )
            ),
        )
        .unwrap();
        std::fs::write(
            project.join(format!("{new_id}.jsonl")),
            format!(
                "{}\n{}\n",
                shared_history(new_id),
                msg(
                    new_id,
                    "u-new",
                    Some("a-1"),
                    "2026-07-27T01:00:00Z",
                    "user",
                    "new"
                )
            ),
        )
        .unwrap();

        // Metadata points at the OLDER member, which suppression would otherwise discard.
        home.write_claude_metadata(old_id, true);

        let src = ClaudeSource;
        let result = tauri::async_runtime::block_on(async { src.parse_all_sessions().await });
        let live: Vec<_> = result.sessions.iter().filter(|s| !s.is_deleted).collect();

        assert_eq!(live.len(), 1, "still one card for the family");
        assert!(
            live[0].is_archived,
            "an archive flag on ANY family member archives the surviving session"
        );
    }

    /// Sessions that merely sit in the same project are not a family. Grouping keys on the
    /// root message uuid, so unrelated transcripts must both survive — and neither may
    /// inherit the other's archive state.
    #[test]
    fn claude_unrelated_sessions_are_not_a_fork_family() {
        let home = MockHome::new();
        let project = home.project_dir();

        let one = "cccccccc-0000-0000-0000-000000000000";
        let two = "dddddddd-0000-0000-0000-000000000000";
        std::fs::write(
            project.join(format!("{one}.jsonl")),
            format!(
                "{}\n",
                msg(
                    one,
                    "root-one",
                    None,
                    "2026-07-27T00:00:00Z",
                    "user",
                    "first"
                )
            ),
        )
        .unwrap();
        std::fs::write(
            project.join(format!("{two}.jsonl")),
            format!(
                "{}\n",
                msg(
                    two,
                    "root-two",
                    None,
                    "2026-07-27T01:00:00Z",
                    "user",
                    "second"
                )
            ),
        )
        .unwrap();
        home.write_claude_metadata(two, true);

        let src = ClaudeSource;
        let result = tauri::async_runtime::block_on(async { src.parse_all_sessions().await });
        let live: Vec<_> = result.sessions.iter().filter(|s| !s.is_deleted).collect();

        assert_eq!(live.len(), 2, "distinct roots are distinct sessions");
        let unarchived = live.iter().find(|s| s.id.starts_with("cccccccc")).unwrap();
        assert!(
            !unarchived.is_archived,
            "archive state must not leak between unrelated sessions"
        );
    }

    /// Suppression is only safe because a rewind-fork copies history forward. An ancestor
    /// may be hidden when what the winner lacks is one contiguous abandoned tail — the work
    /// the user rewound past. A HOLE in the middle is different: it means the winner is
    /// missing history the ancestor still holds, and hiding the ancestor would destroy it.
    /// Both cards survive in that case; a duplicate is the lesser failure.
    ///
    /// (Sharing only the root record is NOT such a case — that is an ordinary rewind to the
    /// very first prompt, and it collapses like any other.)
    #[test]
    fn claude_fork_with_a_gap_in_copied_history_keeps_both() {
        let home = MockHome::new();
        let project = home.project_dir();
        let old_id = "eeeeeeee-0000-0000-0000-000000000000";
        let new_id = "ffffffff-0000-0000-0000-000000000000";

        // Ancestor holds root -> middle -> late.
        std::fs::write(
            project.join(format!("{old_id}.jsonl")),
            format!(
                "{}\n{}\n{}\n",
                msg(
                    old_id,
                    "u-root",
                    None,
                    "2026-07-27T00:37:43Z",
                    "user",
                    "start"
                ),
                msg(
                    old_id,
                    "u-middle",
                    Some("u-root"),
                    "2026-07-27T00:50:00Z",
                    "user",
                    "middle"
                ),
                msg(
                    old_id,
                    "u-late",
                    Some("u-middle"),
                    "2026-07-27T00:55:00Z",
                    "user",
                    "late"
                ),
            ),
        )
        .unwrap();

        // Winner skipped `u-middle` but kept `u-late`: not a clean tail, so not a copy.
        std::fs::write(
            project.join(format!("{new_id}.jsonl")),
            format!(
                "{}\n{}\n{}\n",
                msg(
                    new_id,
                    "u-root",
                    None,
                    "2026-07-27T00:37:43Z",
                    "user",
                    "start"
                ),
                msg(
                    new_id,
                    "u-late",
                    Some("u-root"),
                    "2026-07-27T00:55:00Z",
                    "user",
                    "late"
                ),
                msg(
                    new_id,
                    "u-newer",
                    Some("u-late"),
                    "2026-07-27T01:50:00Z",
                    "user",
                    "newer"
                ),
            ),
        )
        .unwrap();

        let src = ClaudeSource;
        let result = tauri::async_runtime::block_on(async { src.parse_all_sessions().await });
        let live: Vec<_> = result.sessions.iter().filter(|s| !s.is_deleted).collect();

        assert_eq!(
            live.len(),
            2,
            "history missing from the middle of the winner must not be hidden"
        );
    }

    /// The everyday case that must still collapse: rewinding all the way to the first
    /// prompt, so the two files share only the root record.
    #[test]
    fn claude_rewind_to_the_first_prompt_still_collapses() {
        let home = MockHome::new();
        let project = home.project_dir();
        let old_id = "eeeeeeee-2222-0000-0000-000000000000";
        let new_id = "ffffffff-2222-0000-0000-000000000000";
        let root = |sid: &str| msg(sid, "u-root", None, "2026-07-27T00:37:43Z", "user", "start");

        std::fs::write(
            project.join(format!("{old_id}.jsonl")),
            format!(
                "{}\n{}\n",
                root(old_id),
                msg(
                    old_id,
                    "only-a",
                    Some("u-root"),
                    "2026-07-27T00:50:00Z",
                    "user",
                    "a"
                )
            ),
        )
        .unwrap();
        std::fs::write(
            project.join(format!("{new_id}.jsonl")),
            format!(
                "{}\n{}\n",
                root(new_id),
                msg(
                    new_id,
                    "only-b",
                    Some("u-root"),
                    "2026-07-27T01:50:00Z",
                    "user",
                    "b"
                )
            ),
        )
        .unwrap();

        let src = ClaudeSource;
        let result = tauri::async_runtime::block_on(async { src.parse_all_sessions().await });
        let live: Vec<_> = result.sessions.iter().filter(|s| !s.is_deleted).collect();

        assert_eq!(
            live.len(),
            1,
            "a rewind to the first prompt is still one session"
        );
        assert_eq!(live[0].id, new_id, "the branch the user continued on wins");
    }

    /// The watcher parses one changed file. Touching an ancestor must resolve to the
    /// surviving member instead of re-emitting the card the scan just removed.
    #[test]
    fn claude_watcher_redirects_an_ancestor_to_its_winner() {
        let home = MockHome::new();
        let project = home.project_dir();
        let old_id = "11111111-aaaa-0000-0000-000000000000";
        let new_id = "22222222-aaaa-0000-0000-000000000000";

        let ancestor = project.join(format!("{old_id}.jsonl"));
        std::fs::write(&ancestor, format!("{}\n", shared_history(old_id))).unwrap();
        std::fs::write(
            project.join(format!("{new_id}.jsonl")),
            format!(
                "{}\n{}\n",
                shared_history(new_id),
                msg(
                    new_id,
                    "u-new",
                    Some("a-1"),
                    "2026-07-27T01:00:00Z",
                    "user",
                    "new"
                )
            ),
        )
        .unwrap();

        let src = ClaudeSource;
        let path = ancestor.to_string_lossy().to_string();
        let session =
            tauri::async_runtime::block_on(async { src.parse_session(&path).await }).unwrap();

        assert_eq!(
            session.id, new_id,
            "a watcher event on an ancestor must yield the surviving session"
        );
    }
}
