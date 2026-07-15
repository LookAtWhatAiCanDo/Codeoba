#![allow(clippy::indexing_slicing, clippy::expect_used)]
use crate::models::{Session, Turn};
use crate::parsers::SourceAdapter;
use rusqlite::{Connection, OpenFlags};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub struct AntigravitySource {
    variant: crate::parsers::ParserVariant,
    antigravity_title_map: std::sync::RwLock<HashMap<String, String>>,
    last_pb_file_modified: std::sync::RwLock<i64>,
    /// Conversation ids that were spawned as subagents by some other session.
    ///
    /// Subagent-ness cannot be read off the subagent itself: its transcript has
    /// no self-marker, and Antigravity writes subagent conversations into
    /// agyhub_summaries_proto.pb exactly like top-level ones (which is why the
    /// old "absent from the title map" test never actually excluded anything).
    /// The only authoritative signal is on the PARENT side — an INVOKE_SUBAGENT
    /// step naming the child's conversationId — so it has to be collected across
    /// sessions and cached here.
    antigravity_subagent_ids: std::sync::RwLock<HashSet<String>>,
}

impl Default for AntigravitySource {
    fn default() -> Self {
        Self {
            variant: crate::parsers::ParserVariant::Standard,
            antigravity_title_map: std::sync::RwLock::new(HashMap::new()),
            last_pb_file_modified: std::sync::RwLock::new(0),
            antigravity_subagent_ids: std::sync::RwLock::new(HashSet::new()),
        }
    }
}

impl AntigravitySource {
    pub fn new(variant: crate::parsers::ParserVariant) -> Self {
        Self {
            variant,
            antigravity_title_map: std::sync::RwLock::new(HashMap::new()),
            last_pb_file_modified: std::sync::RwLock::new(0),
            antigravity_subagent_ids: std::sync::RwLock::new(HashSet::new()),
        }
    }

    /// Collect every conversation id that any transcript spawned as a subagent.
    ///
    /// The child's id is not a field on the step — it sits inside a JSON blob
    /// embedded in the step's `content` STRING:
    ///
    ///   {"type":"INVOKE_SUBAGENT","content":"...Created the following subagents:
    ///    \n{ \"conversationId\": \"<child-uuid>\", ... }"}
    ///
    /// Note the escaping: in the raw line those inner quotes are backslashed, so
    /// scanning the line text directly never matches. The line has to be decoded
    /// first and the pattern applied to the unescaped `content`.
    ///
    /// Two step types are read. INVOKE_SUBAGENT records the spawn. CHECKPOINT
    /// repeats the roster in its "# Subagents" summary, and that is what survives
    /// when a long transcript is compacted and the original INVOKE_SUBAGENT step
    /// gets truncated away — without it, subagents of compacted conversations
    /// would silently reappear as top-level sessions.
    /// The subagent ids recorded by a SINGLE transcript — i.e. the children that
    /// this one conversation spawned. Shared by the full scan and by the live
    /// watcher path, which re-scrapes a parent the moment it changes.
    fn scrape_subagent_ids(path: &Path) -> HashSet<String> {
        static SUBAGENT_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        let re = SUBAGENT_RE.get_or_init(|| {
            regex::Regex::new(r#""conversationId"\s*:\s*"([^"]+)""#).expect("valid static regex")
        });

        let mut ids = HashSet::new();
        let text = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return ids,
        };
        // Cheap prefilter: only the few transcripts that mention a subagent at
        // all pay for the per-line JSON decode.
        if !text.contains("conversationId") {
            return ids;
        }

        for line in text.lines() {
            let value: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let step_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if step_type != "INVOKE_SUBAGENT" && step_type != "CHECKPOINT" {
                continue;
            }
            let step_content = match value.get("content").and_then(|c| c.as_str()) {
                Some(c) => c,
                None => continue,
            };
            for cap in re.captures_iter(step_content) {
                ids.insert(cap[1].to_string());
            }
        }
        ids
    }

    fn build_antigravity_subagent_ids(&self) -> HashSet<String> {
        let mut ids = HashSet::new();
        let base_dir = self.get_base_dir();
        if !base_dir.exists() || !base_dir.is_dir() {
            return ids;
        }

        let mut walk_stack = vec![base_dir];
        while let Some(current_dir) = walk_stack.pop() {
            let entries = match fs::read_dir(current_dir) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk_stack.push(path);
                } else if path.file_name().and_then(|s| s.to_str()) == Some("transcript_full.jsonl")
                {
                    ids.extend(Self::scrape_subagent_ids(&path));
                }
            }
        }
        ids
    }

    fn get_variant_dir(&self) -> PathBuf {
        let home = crate::parsers::get_home_dir();
        match self.variant {
            crate::parsers::ParserVariant::Standard => home.join(".gemini/antigravity"),
            crate::parsers::ParserVariant::Ide => home.join(".gemini/antigravity-ide"),
        }
    }

    fn get_base_dir(&self) -> PathBuf {
        self.get_variant_dir().join("brain")
    }

    pub(crate) fn get_session_title(&self, session_id: &str) -> String {
        {
            let map = self
                .antigravity_title_map
                .read()
                .unwrap_or_else(|e| e.into_inner());
            if let Some(title) = map.get(session_id) {
                return title.clone();
            }
        }

        let pb_file = self.get_variant_dir().join("agyhub_summaries_proto.pb");
        let current_modified = if pb_file.exists() && pb_file.is_file() {
            pb_file
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
                .last_pb_file_modified
                .read()
                .unwrap_or_else(|e| e.into_inner())
        };
        if last_mod == 0 || current_modified > last_mod {
            let map = self.build_antigravity_title_map();
            {
                let mut map_guard = self
                    .antigravity_title_map
                    .write()
                    .unwrap_or_else(|e| e.into_inner());
                *map_guard = map;
                let mut mod_guard = self
                    .last_pb_file_modified
                    .write()
                    .unwrap_or_else(|e| e.into_inner());
                *mod_guard = current_modified;
            }
        }

        let map = self
            .antigravity_title_map
            .read()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(title) = map.get(session_id) {
            title.clone()
        } else if matches!(self.variant, crate::parsers::ParserVariant::Ide) {
            self.extract_title_from_ide_db(session_id)
                .unwrap_or_else(|| "Antigravity Session".to_string())
        } else {
            "Antigravity Session".to_string()
        }
    }

    fn extract_title_from_ide_db(&self, session_id: &str) -> Option<String> {
        let db_path = self
            .get_variant_dir()
            .join("conversations")
            .join(format!("{}.db", session_id));
        if !db_path.exists() {
            return None;
        }

        let conn = Connection::open_with_flags(
            &db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .ok()?;

        let mut stmt = conn
            .prepare("SELECT step_payload FROM steps ORDER BY idx ASC")
            .ok()?;

        let rows = stmt.query_map([], |row| row.get::<_, Vec<u8>>(0)).ok()?;

        for payload in rows.flatten() {
            if let Some(title) = extract_short_title_from_payload(&payload) {
                return Some(title);
            }
        }
        None
    }

    fn build_antigravity_title_map(&self) -> HashMap<String, String> {
        let mut map = HashMap::new();
        let pb_file = self.get_variant_dir().join("agyhub_summaries_proto.pb");
        if pb_file.exists() && pb_file.is_file() {
            if let Ok(bytes) = fs::read(&pb_file) {
                let mut offset = 0;
                while offset < bytes.len() {
                    let tag_res = read_varint(&bytes, &mut offset);
                    let tag = match tag_res {
                        Ok(t) => t,
                        Err(_) => break,
                    };
                    let wire_type = (tag & 0x07) as u8;
                    let field_number = (tag >> 3) as u32;

                    if field_number == 1 && wire_type == 2 {
                        let entry_len_res = read_varint(&bytes, &mut offset);
                        let entry_len = match entry_len_res {
                            Ok(l) => l as usize,
                            Err(_) => break,
                        };
                        let entry_end = offset + entry_len;
                        if entry_end > bytes.len() {
                            break;
                        }

                        let mut uuid: Option<String> = None;
                        let mut title: Option<String> = None;

                        while offset < entry_end {
                            let entry_tag_res = read_varint(&bytes, &mut offset);
                            let entry_tag = match entry_tag_res {
                                Ok(t) => t,
                                Err(_) => {
                                    break;
                                }
                            };
                            let entry_wire_type = (entry_tag & 0x07) as u8;
                            let entry_field_number = (entry_tag >> 3) as u32;

                            if entry_field_number == 1 && entry_wire_type == 2 {
                                let uuid_len_res = read_varint(&bytes, &mut offset);
                                let uuid_len = match uuid_len_res {
                                    Ok(l) => l as usize,
                                    Err(_) => {
                                        break;
                                    }
                                };
                                if offset + uuid_len <= entry_end {
                                    if let Ok(u) =
                                        String::from_utf8(bytes[offset..offset + uuid_len].to_vec())
                                    {
                                        uuid = Some(u);
                                    }
                                    offset += uuid_len;
                                } else {
                                    offset = entry_end;
                                }
                            } else if entry_field_number == 2 && entry_wire_type == 2 {
                                let info_len_res = read_varint(&bytes, &mut offset);
                                let info_len = match info_len_res {
                                    Ok(l) => l as usize,
                                    Err(_) => {
                                        break;
                                    }
                                };
                                let info_end = offset + info_len;
                                if info_end <= entry_end {
                                    while offset < info_end {
                                        let info_tag_res = read_varint(&bytes, &mut offset);
                                        let info_tag = match info_tag_res {
                                            Ok(t) => t,
                                            Err(_) => {
                                                offset = info_end;
                                                break;
                                            }
                                        };
                                        let info_wire_type = (info_tag & 0x07) as u8;
                                        let info_field_number = (info_tag >> 3) as u32;

                                        if info_field_number == 1 && info_wire_type == 2 {
                                            let str_len_res = read_varint(&bytes, &mut offset);
                                            let str_len = match str_len_res {
                                                Ok(l) => l as usize,
                                                Err(_) => {
                                                    offset = info_end;
                                                    break;
                                                }
                                            };
                                            if offset + str_len <= info_end {
                                                if let Ok(s) = String::from_utf8(
                                                    bytes[offset..offset + str_len].to_vec(),
                                                ) {
                                                    if title.is_none()
                                                        && !s.starts_with('\n')
                                                        && !s.starts_with("file://")
                                                    {
                                                        title = Some(s);
                                                    }
                                                }
                                                offset += str_len;
                                            } else {
                                                offset = info_end;
                                            }
                                        } else {
                                            skip_field(
                                                &bytes,
                                                &mut offset,
                                                info_wire_type,
                                                info_end,
                                            );
                                        }
                                    }
                                } else {
                                    offset = entry_end;
                                }
                            } else {
                                skip_field(&bytes, &mut offset, entry_wire_type, entry_end);
                            }
                        }

                        if let (Some(u), Some(t)) = (uuid, title) {
                            map.insert(u, t);
                        }
                        offset = entry_end;
                    } else {
                        skip_field(&bytes, &mut offset, wire_type, bytes.len());
                    }
                }
            }
        }
        if matches!(self.variant, crate::parsers::ParserVariant::Ide) {
            let conv_dir = self.get_variant_dir().join("conversations");
            if let Ok(entries) = fs::read_dir(&conv_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("db") {
                        if let Some(uuid) = path.file_stem().and_then(|s| s.to_str()) {
                            if !map.contains_key(uuid) {
                                if let Some(title) = self.extract_title_from_ide_db(uuid) {
                                    map.insert(uuid.to_string(), title);
                                }
                            }
                        }
                    }
                }
            }
        }

        map
    }
}

fn extract_short_title_from_payload(bytes: &[u8]) -> Option<String> {
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] >= 0x20 && bytes[i] != 0x7F {
            let start = i;
            while i < bytes.len() && (bytes[i] >= 0x20 || bytes[i] == b'\n') && bytes[i] != 0x7F {
                i += 1;
            }
            let run = &bytes[start..i];
            if let Ok(s) = std::str::from_utf8(run) {
                if let Some(first_line) = s.find('\n').and_then(|nl| s.get(..nl)) {
                    let len = first_line.len();
                    if (10..=100).contains(&len)
                        && !first_line.starts_with("file://")
                        && !first_line.starts_with('/')
                        && !first_line.starts_with('<')
                        && !first_line.starts_with('`')
                        && !is_uuid_like(first_line)
                    {
                        return Some(first_line.to_string());
                    }
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

fn is_uuid_like(s: &str) -> bool {
    let parts: Vec<&str> = s.splitn(6, '-').collect();
    parts.len() == 5
        && parts[0].len() == 8
        && parts[1].len() == 4
        && parts[4].len() == 12
        && parts
            .iter()
            .all(|p| p.chars().all(|c| c.is_ascii_hexdigit()))
}

fn read_varint(bytes: &[u8], offset: &mut usize) -> Result<u64, String> {
    let mut result = 0u64;
    let mut shift = 0;
    while *offset < bytes.len() {
        let b = bytes[*offset] as u64;
        *offset += 1;
        result |= (b & 0x7F) << shift;
        if (b & 0x80) == 0 {
            return Ok(result);
        }
        shift += 7;
        if shift >= 64 {
            return Err("Varint too long".to_string());
        }
    }
    Err("Unexpected EOF reading varint".to_string())
}

fn skip_field(bytes: &[u8], offset: &mut usize, wire_type: u8, limit: usize) {
    match wire_type {
        0 => {
            let _ = read_varint(bytes, offset);
        }
        1 => {
            *offset = (*offset + 8).min(limit);
        }
        2 => {
            if let Ok(len) = read_varint(bytes, offset) {
                *offset = (*offset + len as usize).min(limit);
            } else {
                *offset = limit;
            }
        }
        5 => {
            *offset = (*offset + 4).min(limit);
        }
        _ => {
            *offset = limit;
        }
    }
}

fn clean(text: &str) -> String {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| {
        regex::Regex::new(r"<truncated (\d+) bytes>\s*").expect("valid static regex")
    });
    let cleaned = re.replace_all(text, |caps: &regex::Captures| {
        let bytes = &caps[1];
        format!(
            "\n\n[⚠️ SYSTEM LIMIT: Truncated {} bytes of log output here]\n\n",
            bytes
        )
    });
    cleaned.trim().to_string()
}

fn remove_surrounding_quotes(s: &str) -> &str {
    if let Some(inner) = s.strip_prefix('"').and_then(|x| x.strip_suffix('"')) {
        inner
    } else {
        s
    }
}

fn escape_tool_tags(text: &str) -> String {
    text.replace("[[[TOOL", "\\[\\[\\[TOOL")
        .replace("[[[/TOOL", "\\[\\[\\[/TOOL")
}

fn format_tool_entry(
    tool_type: &str,
    content: &str,
    tool_calls: Option<&serde_json::Value>,
    timestamp: i64,
) -> String {
    let label = match tool_type {
        "VIEW_FILE" => "📄 View File",
        "RUN_COMMAND" => "⚡ Run Command",
        "CODE_ACTION" => "✏️ Code Edit",
        "GREP_SEARCH" => "🔍 Search",
        "LIST_DIRECTORY" => "📂 List Directory",
        "SEARCH_WEB" => "🌐 Web Search",
        "GENERIC" => "🔧 Tool",
        "SYSTEM_MESSAGE" => "⚙️ System Message",
        "ERROR_MESSAGE" => "❌ Error",
        _ => tool_type,
    };

    let mut header_parts = Vec::new();
    if let Some(serde_json::Value::Array(arr)) = tool_calls {
        for tc in arr {
            if let Some(tc_obj) = tc.as_object() {
                let name = tc_obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(args) = tc_obj.get("args").and_then(|v| v.as_object()) {
                    let summary = match name {
                        "view_file" => args
                            .get("AbsolutePath")
                            .and_then(|v| v.as_str())
                            .map(|s| clean(remove_surrounding_quotes(s))),
                        "run_command" => args
                            .get("CommandLine")
                            .and_then(|v| v.as_str())
                            .map(|s| clean(remove_surrounding_quotes(s))),
                        "grep_search" => {
                            let query = args
                                .get("Query")
                                .and_then(|v| v.as_str())
                                .map(|s| clean(remove_surrounding_quotes(s)));
                            let path = args
                                .get("SearchPath")
                                .and_then(|v| v.as_str())
                                .map(|s| clean(remove_surrounding_quotes(s)));
                            query.map(|q| {
                                if let Some(p) = path {
                                    format!("Query: {} in {}", q, p)
                                } else {
                                    format!("Query: {}", q)
                                }
                            })
                        }
                        "list_dir" => args
                            .get("DirectoryPath")
                            .and_then(|v| v.as_str())
                            .map(|s| clean(remove_surrounding_quotes(s))),
                        "replace_file_content" | "multi_replace_file_content" | "write_to_file" => {
                            args.get("TargetFile")
                                .and_then(|v| v.as_str())
                                .map(|s| clean(remove_surrounding_quotes(s)))
                        }
                        _ => None,
                    };
                    if let Some(sum) = summary {
                        header_parts.push(sum);
                    }
                }
            }
        }
    }

    let header = if !header_parts.is_empty() {
        format!("{}: {}", label, header_parts.join(", "))
    } else {
        label.to_string()
    };
    let header_escaped = escape_tool_tags(&header);
    let cleaned_content = escape_tool_tags(&clean(content));

    format!(
        "[[[TOOL:{}|{}|{}]]]\n{}\n[[[/TOOL]]]",
        tool_type, header_escaped, timestamp, cleaned_content
    )
}

struct Event {
    is_user: bool,
    text: String,
    timestamp: i64,
    model: Option<String>,
    is_compaction: bool,
    compaction_time_ms: i64,
}

struct ProtoDecoder<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> ProtoDecoder<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    fn read_varint(&mut self) -> Option<u64> {
        let mut result = 0u64;
        let mut shift = 0;
        while self.offset < self.data.len() {
            let b = self.data[self.offset];
            self.offset += 1;
            result |= ((b & 0x7f) as u64) << shift;
            if (b & 0x80) == 0 {
                return Some(result);
            }
            shift += 7;
            if shift >= 64 {
                return None;
            }
        }
        None
    }
}

fn get_proto_varint_at_path(data: &[u8], path: &[u32]) -> Option<u64> {
    if path.is_empty() {
        return None;
    }
    let target_field = path[0];
    let mut decoder = ProtoDecoder::new(data);
    while let Some(tag) = decoder.read_varint() {
        let wire_type = (tag & 0x07) as u8;
        let field_num = (tag >> 3) as u32;
        match wire_type {
            0 => {
                let val = decoder.read_varint()?;
                if field_num == target_field && path.len() == 1 {
                    return Some(val);
                }
            }
            1 => {
                if decoder.offset + 8 > decoder.data.len() {
                    return None;
                }
                decoder.offset += 8;
            }
            2 => {
                let len = decoder.read_varint()? as usize;
                if decoder.offset + len > decoder.data.len() {
                    return None;
                }
                let val_bytes = &decoder.data[decoder.offset..decoder.offset + len];
                decoder.offset += len;
                if field_num == target_field {
                    if path.len() == 1 {
                        // not a varint
                    } else if let Some(res) = get_proto_varint_at_path(val_bytes, &path[1..]) {
                        return Some(res);
                    }
                }
            }
            5 => {
                if decoder.offset + 4 > decoder.data.len() {
                    return None;
                }
                decoder.offset += 4;
            }
            _ => return None,
        }
    }
    None
}

fn get_proto_bytes_at_path<'a>(data: &'a [u8], path: &[u32]) -> Option<&'a [u8]> {
    if path.is_empty() {
        return Some(data);
    }
    let target_field = path[0];
    let mut decoder = ProtoDecoder::new(data);
    while let Some(tag) = decoder.read_varint() {
        let wire_type = (tag & 0x07) as u8;
        let field_num = (tag >> 3) as u32;
        match wire_type {
            0 => {
                let _val = decoder.read_varint()?;
            }
            1 => {
                if decoder.offset + 8 > decoder.data.len() {
                    return None;
                }
                decoder.offset += 8;
            }
            2 => {
                let len = decoder.read_varint()? as usize;
                if decoder.offset + len > decoder.data.len() {
                    return None;
                }
                let val_bytes = &decoder.data[decoder.offset..decoder.offset + len];
                decoder.offset += len;
                if field_num == target_field {
                    if path.len() == 1 {
                        return Some(val_bytes);
                    } else if let Some(res) = get_proto_bytes_at_path(val_bytes, &path[1..]) {
                        return Some(res);
                    }
                }
            }
            5 => {
                if decoder.offset + 4 > decoder.data.len() {
                    return None;
                }
                decoder.offset += 4;
            }
            _ => return None,
        }
    }
    None
}

fn load_jsonl_uncompacted_map(path: &Path) -> HashMap<(bool, i64), String> {
    let mut map = HashMap::new();
    let content_str = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return map,
    };

    static USER_REQ_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let user_req_re = USER_REQ_RE.get_or_init(|| {
        regex::Regex::new(
            r"(?i)^\s*<USER_REQUEST>([\s\S]*?)</USER_REQUEST>\s*(?:<ADDITIONAL_METADATA>|<USER_SETTINGS_CHANGE>|$)"
        ).expect("valid static regex")
    });

    for line in content_str.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(element) = serde_json::from_str::<serde_json::Value>(line) {
            let obj = match element.as_object() {
                Some(o) => o,
                None => continue,
            };
            let step_type = match obj.get("type").and_then(|v| v.as_str()) {
                Some(t) => t,
                None => continue,
            };
            let source = obj.get("source").and_then(|v| v.as_str()).unwrap_or("");
            let created_at_str = obj.get("created_at").and_then(|v| v.as_str());
            let timestamp = created_at_str
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp_millis())
                .unwrap_or(0);

            let content = obj.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let timestamp_secs = timestamp / 1000;

            if step_type == "USER_INPUT" && source == "USER_EXPLICIT" {
                let mut clean_content = content.trim().to_string();
                if let Some(caps) = user_req_re.captures(content) {
                    clean_content = caps[1].trim().to_string();
                }
                clean_content = clean(&clean_content);
                if !clean_content.is_empty() && clean_content != "[Compacted Request]" {
                    map.insert((true, timestamp_secs), clean_content);
                }
            } else if (step_type == "PLANNER_RESPONSE" || step_type == "ASK_QUESTION")
                && source == "MODEL"
            {
                let clean_content = escape_tool_tags(&clean(content));
                if !clean_content.is_empty() && clean_content != "[Compacted Response]" {
                    map.insert((false, timestamp_secs), clean_content);
                }
            }
        }
    }
    map
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn extract_model_from_blob(data: &[u8]) -> Option<String> {
    // Start searching after the "model_enum" field to avoid matching text in prompts/skills
    let start_pos = find_subsequence(data, b"model_enum").unwrap_or(0);
    let search_slice = &data[start_pos..];

    let prefixes = ["Gemini", "Claude", "gpt-", "o1-", "llama"];
    for prefix in &prefixes {
        let prefix_bytes = prefix.as_bytes();
        if let Some(pos) = find_subsequence(search_slice, prefix_bytes) {
            let absolute_pos = start_pos + pos;
            if absolute_pos > 0 {
                let len = data[absolute_pos - 1] as usize;
                if len >= prefix_bytes.len() && absolute_pos + len <= data.len() {
                    let candidate = &data[absolute_pos..absolute_pos + len];
                    if let Ok(model_str) = std::str::from_utf8(candidate) {
                        if model_str.chars().all(|c| c.is_ascii_graphic() || c == ' ') {
                            return Some(model_str.trim().to_string());
                        }
                    }
                }
            }
            // Fallback: scan printable chars
            let mut end = absolute_pos;
            while end < data.len() {
                let c = data[end];
                if (32..=126).contains(&c) {
                    end += 1;
                } else {
                    break;
                }
            }
            if end > absolute_pos {
                if let Ok(model_str) = std::str::from_utf8(&data[absolute_pos..end]) {
                    return Some(model_str.trim().to_string());
                }
            }
        }
    }
    None
}

fn parse_sqlite_session_db(
    db_path: &Path,
    cwd: &mut Option<String>,
    model: &mut Option<String>,
    uncompacted_map: &HashMap<(bool, i64), String>,
) -> Result<Vec<Event>, rusqlite::Error> {
    let path_str = db_path.to_string_lossy();
    let uri_path = format!("file:{}?mode=ro", path_str);
    let conn = Connection::open_with_flags(
        Path::new(&uri_path),
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;

    // Try to query the latest session metadata checkpoint blob from gen_metadata to extract the active model
    if let Ok(mut stmt) = conn.prepare("SELECT data FROM gen_metadata ORDER BY idx DESC") {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                let data: Vec<u8> = row.get(0).unwrap_or_default();
                if let Some(m) = extract_model_from_blob(&data) {
                    *model = Some(m);
                    break;
                }
            }
        }
    }

    let session_id = db_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

    let main_trajectory_id: Option<String> = conn.query_row(
        "SELECT trajectory_id FROM trajectory_meta WHERE cascade_id = ? AND trajectory_type = 4",
        [session_id],
        |row| row.get(0)
    ).ok();

    let main_trajectory_id = match main_trajectory_id {
        Some(id) => Some(id),
        None => conn
            .query_row(
                "SELECT trajectory_id FROM trajectory_meta WHERE cascade_id = ? LIMIT 1",
                [session_id],
                |row| row.get(0),
            )
            .ok(),
    };

    let mut main_trajectory_ids = std::collections::HashSet::new();
    if let Some(id) = main_trajectory_id {
        main_trajectory_ids.insert(id);
    }

    if let Ok(mut stmt) = conn.prepare("SELECT data FROM parent_references") {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                let data_blob: Vec<u8> = row.get(0).unwrap_or_default();
                if let Some(tb) = get_proto_bytes_at_path(&data_blob, &[1]) {
                    if let Ok(ts) = std::str::from_utf8(tb) {
                        main_trajectory_ids.insert(ts.to_string());
                    }
                }
            }
        }
    }

    let mut stmt = conn.prepare("SELECT idx, step_type, step_payload FROM steps WHERE step_type IN (14, 15, 98) ORDER BY idx")?;
    let mut rows = stmt.query([])?;

    static CWD_RE: std::sync::OnceLock<regex::bytes::Regex> = std::sync::OnceLock::new();
    let cwd_re = CWD_RE.get_or_init(|| {
        regex::bytes::Regex::new(r#""[Cc]wd"\s*:\s*"([^"]+)""#).expect("valid static regex")
    });

    let mut events = Vec::new();
    while let Some(row) = rows.next()? {
        let _idx: i64 = row.get(0)?;
        let step_type: i32 = row.get(1)?;
        let step_payload: Vec<u8> = row.get(2)?;

        if !main_trajectory_ids.is_empty() {
            let mut step_traj = None;
            if let Some(tb) = get_proto_bytes_at_path(&step_payload, &[5, 20, 1]) {
                if let Ok(ts) = std::str::from_utf8(tb) {
                    step_traj = Some(ts);
                }
            }
            if step_traj.is_none() {
                if let Some(tb) = get_proto_bytes_at_path(&step_payload, &[147, 2, 1]) {
                    if let Ok(ts) = std::str::from_utf8(tb) {
                        step_traj = Some(ts);
                    }
                }
            }
            if let Some(traj_str) = step_traj {
                if !main_trajectory_ids.contains(traj_str) {
                    continue;
                }
            }
        }

        if let Some(caps) = cwd_re.captures(&step_payload) {
            if let Ok(c) = std::str::from_utf8(&caps[1]) {
                *cwd = Some(c.to_string());
            }
        }

        let seconds = get_proto_varint_at_path(&step_payload, &[5, 1, 1]).unwrap_or(0);
        let timestamp = seconds as i64 * 1000;

        if step_type == 14 {
            let mut text = String::new();
            if let Some(bytes) = get_proto_bytes_at_path(&step_payload, &[19, 2]) {
                if let Ok(t) = std::str::from_utf8(bytes) {
                    text = t.trim().to_string();
                }
            }
            if text.is_empty() {
                let timestamp_secs = seconds as i64;
                if let Some(uncompacted) = uncompacted_map.get(&(true, timestamp_secs)) {
                    text = uncompacted.clone();
                } else {
                    text = "[Compacted Request]".to_string();
                }
            }
            events.push(Event {
                is_user: true,
                text,
                timestamp,
                model: model.clone(),
                is_compaction: false,
                compaction_time_ms: 0,
            });
        } else if step_type == 15 {
            let mut text = String::new();
            if let Some(bytes) = get_proto_bytes_at_path(&step_payload, &[20, 1]) {
                if let Ok(t) = std::str::from_utf8(bytes) {
                    text = t.trim().to_string();
                }
            }
            if text.is_empty() {
                let timestamp_secs = seconds as i64;
                if let Some(uncompacted) = uncompacted_map.get(&(false, timestamp_secs)) {
                    text = uncompacted.clone();
                } else {
                    text = "[Compacted Response]".to_string();
                }
            }
            events.push(Event {
                is_user: false,
                text,
                timestamp,
                model: model.clone(),
                is_compaction: false,
                compaction_time_ms: 0,
            });
        } else if step_type == 98 {
            let preceding_event = events.last();
            let duration = if let Some(pe) = preceding_event {
                if pe.is_user {
                    (timestamp - pe.timestamp).max(0)
                } else {
                    0
                }
            } else {
                0
            };
            events.push(Event {
                is_user: false,
                text: String::new(),
                timestamp,
                model: None,
                is_compaction: true,
                compaction_time_ms: duration,
            });
        }
    }

    Ok(events)
}

impl SourceAdapter for AntigravitySource {
    fn id(&self) -> &str {
        match self.variant {
            crate::parsers::ParserVariant::Standard => "antigravity",
            crate::parsers::ParserVariant::Ide => "antigravity_ide",
        }
    }

    fn display_name(&self) -> &str {
        match self.variant {
            crate::parsers::ParserVariant::Standard => "Antigravity",
            crate::parsers::ParserVariant::Ide => "Antigravity IDE",
        }
    }

    fn product_url(&self) -> Option<String> {
        Some("https://antigravity.google".to_string())
    }

    fn is_available(&self) -> bool {
        self.get_base_dir().exists()
    }

    fn get_default_log_paths(&self) -> Vec<String> {
        vec![self.get_base_dir().to_string_lossy().to_string()]
    }

    fn get_watch_paths(&self) -> Vec<String> {
        vec![self.get_variant_dir().to_string_lossy().to_string()]
    }

    fn get_watch_file_filter(&self) -> Option<fn(&str) -> bool> {
        Some(|path_str| {
            let path = std::path::Path::new(path_str);
            let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            filename == "transcript.jsonl"
                || filename == "transcript_full.jsonl"
                || filename == "agyhub_summaries_proto.pb"
                || (path_str.contains("annotations") && filename.ends_with(".pbtxt"))
                || (path_str.contains("tasks") && filename.ends_with(".log"))
                || (path_str.contains("messages") && filename.ends_with(".json"))
                || (path_str.contains("conversations")
                    && (filename.ends_with(".db") || filename.ends_with(".db-wal")))
        })
    }

    fn is_app_installed(&self) -> bool {
        if cfg!(target_os = "macos") {
            match self.variant {
                crate::parsers::ParserVariant::Standard => {
                    Path::new("/Applications/Antigravity.app").exists()
                }
                crate::parsers::ParserVariant::Ide => {
                    Path::new("/Applications/Antigravity IDE.app").exists()
                }
            }
        } else {
            self.get_variant_dir().exists()
        }
    }

    async fn parse_session(&self, file_path: &str) -> Option<Session> {
        let mut path_buf = PathBuf::from(file_path);
        let filename = path_buf.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let is_db_file = filename.ends_with(".db") || filename.ends_with(".db-wal");

        if is_db_file {
            let mut session_id = path_buf
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if let Some(stripped) = session_id.strip_suffix(".db") {
                session_id = stripped.to_string();
            }
            let full_path = self.get_variant_dir().join(format!(
                "brain/{}/.system_generated/logs/transcript_full.jsonl",
                session_id
            ));
            if full_path.exists() && full_path.is_file() {
                path_buf = full_path;
            }
        } else if filename != "transcript_full.jsonl" {
            let mut found = false;
            let mut current = path_buf.clone();
            while let Some(parent) = current.parent() {
                if parent.file_name().and_then(|s| s.to_str()) == Some(".system_generated") {
                    let full_path = parent.join("logs/transcript_full.jsonl");
                    if full_path.exists() && full_path.is_file() {
                        path_buf = full_path;
                        found = true;
                        break;
                    }
                }
                current = parent.to_path_buf();
            }
            if !found && path_buf.file_name().and_then(|s| s.to_str()) == Some("transcript.jsonl") {
                let full_path = path_buf
                    .parent()
                    .unwrap_or_else(|| std::path::Path::new(""))
                    .join("transcript_full.jsonl");
                if full_path.exists() && full_path.is_file() {
                    path_buf = full_path;
                }
            }
        }
        let path = path_buf.as_path();
        let target_file_path = path.to_string_lossy().to_string();

        let session_id = path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .and_then(|p| p.file_name())
            .and_then(|s| s.to_str())
            .unwrap_or_else(|| path.file_stem().and_then(|s| s.to_str()).unwrap_or(""))
            .to_string();

        // Live path: the transcript being parsed may itself be a parent that just
        // spawned a subagent. Fold the children it names into the shared set
        // BEFORE the gate below, so when the parent's write is processed first
        // (the common case — the INVOKE_SUBAGENT step is written as the child is
        // created) the child is never indexed at all. If the child happens to be
        // processed first it still slips in, and the watcher evicts it once the
        // parent reveals the relationship.
        {
            let found = Self::scrape_subagent_ids(path);
            if !found.is_empty() {
                let mut guard = self
                    .antigravity_subagent_ids
                    .write()
                    .unwrap_or_else(|e| e.into_inner());
                guard.extend(found);
            }
        }

        // Skip conversations that some other session spawned as a subagent.
        //
        // This used to test "absent from the pb title map", which never excluded
        // anything: Antigravity writes subagent conversations into
        // agyhub_summaries_proto.pb with titles, exactly like top-level ones, so
        // every subagent passed the check and showed up as its own conversation
        // in the sidebar while Antigravity's own UI showed one. The set below is
        // built from the parents' INVOKE_SUBAGENT steps, which is the only place
        // the relationship is actually recorded.
        if !cfg!(test) && !crate::keyring::get_index_subagents_setting() {
            let is_subagent = {
                let ids = self
                    .antigravity_subagent_ids
                    .read()
                    .unwrap_or_else(|e| e.into_inner());
                ids.contains(&session_id)
            };
            if is_subagent {
                return None;
            }
        }

        let metadata = path.metadata().ok()?;
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let size = metadata.len() as i64;

        let mut cache_modified = last_modified;
        let mut cache_size = size;

        let annotation_file = self
            .get_variant_dir()
            .join(format!("annotations/{}.pbtxt", session_id));
        if annotation_file.exists() && annotation_file.is_file() {
            if let Ok(anno_meta) = annotation_file.metadata() {
                let anno_modified = anno_meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                cache_modified += anno_modified;
                cache_size += anno_meta.len() as i64;
            }
        }

        if let Some(mut cached) = crate::parsers::cache::get_cache_manager()
            .get_cached_session_for_file(self.id(), &target_file_path, cache_modified, cache_size)
        {
            let current_title = self.get_session_title(&session_id);
            let annotation_file = self
                .get_variant_dir()
                .join(format!("annotations/{}.pbtxt", session_id));
            let current_archived = if annotation_file.exists() && annotation_file.is_file() {
                if let Ok(anno_text) = fs::read_to_string(&annotation_file) {
                    let normalized: String =
                        anno_text.chars().filter(|c| !c.is_whitespace()).collect();
                    normalized.contains("archived:true")
                } else {
                    false
                }
            } else {
                false
            };

            let title_changed = cached.thread_name.as_deref() != Some(current_title.as_str());
            let archived_changed = cached.is_archived != current_archived;

            if title_changed || archived_changed {
                cached.thread_name = Some(current_title);
                cached.is_archived = current_archived;
                crate::parsers::cache::get_cache_manager().put_cached_session(
                    self.id(),
                    &target_file_path,
                    cache_modified,
                    cache_size,
                    "",
                    cached.clone(),
                );
            } else {
                cached.thread_name = Some(current_title);
                cached.is_archived = current_archived;
            }

            // Re-resolve status dynamically to ensure it is not stale
            cached.status = crate::models::resolve_session_status(
                self.id(),
                &session_id,
                &target_file_path,
                &cached.turns,
                &cached.cwd,
            );
            crate::parsers::cache::get_cache_manager().update_cached_session(
                self.id(),
                &target_file_path,
                cached.clone(),
            );
            return Some(cached);
        }

        let content_str = fs::read_to_string(path).ok()?;

        let mut events = Vec::new();
        let mut cwd: Option<String> = None;
        let mut current_model: Option<String> = None;
        let mut last_asked_questions: Option<serde_json::Value> = None;

        static USER_REQ_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        let user_req_re = USER_REQ_RE.get_or_init(|| {
            regex::Regex::new(
                r"(?i)^\s*<USER_REQUEST>([\s\S]*?)</USER_REQUEST>\s*(?:<ADDITIONAL_METADATA>|<USER_SETTINGS_CHANGE>|$)"
            ).expect("valid static regex")
        });

        static SYS_MSG_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        let sys_msg_re = SYS_MSG_RE.get_or_init(|| {
            regex::Regex::new(r"(?i)^\s*<SYSTEM_MESSAGE>([\s\S]*?)</SYSTEM_MESSAGE>\s*$")
                .expect("valid static regex")
        });

        for line in content_str.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(element) = serde_json::from_str::<serde_json::Value>(line) {
                let obj = match element.as_object() {
                    Some(o) => o,
                    None => continue,
                };
                let step_type = match obj.get("type").and_then(|v| v.as_str()) {
                    Some(t) => t,
                    None => continue,
                };
                let source = obj.get("source").and_then(|v| v.as_str()).unwrap_or("");
                let created_at_str = obj.get("created_at").and_then(|v| v.as_str());
                let timestamp = created_at_str
                    .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                    .map(|dt| dt.timestamp_millis())
                    .unwrap_or(0);

                let content = obj.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let tool_calls = obj.get("tool_calls");

                // Track model selection changes
                if step_type == "USER_INPUT" {
                    if let Some(user_settings) =
                        obj.get("user_settings_change").and_then(|v| v.as_object())
                    {
                        if let Some(model_sel) = user_settings
                            .get("Model Selection")
                            .and_then(|v| v.as_str())
                        {
                            current_model = Some(model_sel.to_string());
                        }
                    }
                    if content.contains("<USER_SETTINGS_CHANGE>") {
                        let settings_content = content
                            .split("<USER_SETTINGS_CHANGE>")
                            .nth(1)
                            .unwrap_or("")
                            .split("</USER_SETTINGS_CHANGE>")
                            .next()
                            .unwrap_or("");
                        if let Some(line_with_model) = settings_content
                            .lines()
                            .find(|l| l.contains("`Model Selection`"))
                        {
                            let after_to = line_with_model.split(" to ").nth(1).unwrap_or("");
                            let model_name = after_to
                                .split(". ")
                                .next()
                                .unwrap_or("")
                                .trim()
                                .trim_end_matches('.');
                            if !model_name.is_empty() {
                                current_model = Some(model_name.to_string());
                            }
                        }
                    }
                }

                // Extract Cwd
                if let Some(serde_json::Value::Array(arr)) = tool_calls {
                    for tc in arr {
                        if let Some(tc_obj) = tc.as_object() {
                            if let Some(args) = tc_obj.get("args").and_then(|v| v.as_object()) {
                                if let Some(arg_cwd) = args
                                    .get("Cwd")
                                    .or_else(|| args.get("cwd"))
                                    .and_then(|v| v.as_str())
                                {
                                    cwd = Some(arg_cwd.trim_matches('"').to_string());
                                }
                            }
                        }
                    }
                }

                if step_type == "USER_INPUT" && source == "USER_EXPLICIT" {
                    let mut clean_content = content.trim().to_string();
                    if let Some(caps) = user_req_re.captures(content) {
                        clean_content = caps[1].trim().to_string();
                    }
                    clean_content = clean(&clean_content);
                    let text_to_push = clean_content;
                    events.push(Event {
                        is_user: true,
                        text: text_to_push,
                        timestamp,
                        model: current_model.clone(),
                        is_compaction: false,
                        compaction_time_ms: 0,
                    });
                } else if step_type == "PLANNER_RESPONSE" && source == "MODEL" {
                    if let Some(serde_json::Value::Array(arr)) = tool_calls {
                        for tc in arr {
                            if let Some(tc_obj) = tc.as_object() {
                                if tc_obj.get("name").and_then(|v| v.as_str())
                                    == Some("ask_question")
                                {
                                    if let Some(args) =
                                        tc_obj.get("args").and_then(|v| v.as_object())
                                    {
                                        if let Some(q_val) = args.get("questions") {
                                            let q_str = match q_val {
                                                serde_json::Value::String(s) => s.clone(),
                                                _ => q_val.to_string(),
                                            };
                                            if let Ok(parsed_q) =
                                                serde_json::from_str::<serde_json::Value>(&q_str)
                                            {
                                                if parsed_q.is_array() {
                                                    last_asked_questions = Some(parsed_q);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    let clean_content = escape_tool_tags(&clean(content));
                    let text_to_push = clean_content;
                    events.push(Event {
                        is_user: false,
                        text: text_to_push,
                        timestamp,
                        model: current_model.clone(),
                        is_compaction: false,
                        compaction_time_ms: 0,
                    });
                } else if step_type == "ASK_QUESTION" && source == "MODEL" {
                    let mut formatted = String::new();
                    if let Some(ref questions) = last_asked_questions {
                        if let Some(q_arr) = questions.as_array() {
                            for q_item in q_arr {
                                if let Some(q_obj) = q_item.as_object() {
                                    let question_text = q_obj
                                        .get("question")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");
                                    formatted
                                        .push_str(&format!("**Question:** {}\n\n", question_text));
                                    if let Some(opts) =
                                        q_obj.get("options").and_then(|v| v.as_array())
                                    {
                                        for opt_val in opts {
                                            if let Some(opt_str) = opt_val.as_str() {
                                                formatted.push_str(&format!("* {}\n", opt_str));
                                            }
                                        }
                                    }
                                    formatted.push('\n');
                                }
                            }
                        }
                    }

                    let mut answer = String::new();
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if !trimmed.is_empty()
                            && !trimmed.starts_with("Created At:")
                            && !trimmed.starts_with("Completed At:")
                        {
                            let clean_line = if let Some(rest) = trimmed.strip_prefix("A1:") {
                                rest.trim()
                            } else if let Some(rest) = trimmed.strip_prefix("A2:") {
                                rest.trim()
                            } else if let Some(rest) = trimmed.strip_prefix("A3:") {
                                rest.trim()
                            } else {
                                trimmed
                            };
                            if !clean_line.is_empty() {
                                if !answer.is_empty() {
                                    answer.push('\n');
                                }
                                answer.push_str(clean_line);
                            }
                        }
                    }

                    if !answer.is_empty() {
                        formatted.push_str(&format!("**Answer:** {}\n", answer));
                    }

                    let text_to_push = if formatted.is_empty() {
                        escape_tool_tags(&clean(content))
                    } else {
                        escape_tool_tags(&clean(&formatted))
                    };

                    events.push(Event {
                        is_user: false,
                        text: text_to_push,
                        timestamp,
                        model: current_model.clone(),
                        is_compaction: false,
                        compaction_time_ms: 0,
                    });

                    last_asked_questions = None;
                } else if matches!(
                    step_type,
                    "VIEW_FILE"
                        | "RUN_COMMAND"
                        | "CODE_ACTION"
                        | "GREP_SEARCH"
                        | "LIST_DIRECTORY"
                        | "SEARCH_WEB"
                        | "GENERIC"
                ) && source == "MODEL"
                {
                    let formatted = format_tool_entry(step_type, content, tool_calls, timestamp);
                    if !formatted.trim().is_empty() {
                        events.push(Event {
                            is_user: false,
                            text: formatted,
                            timestamp,
                            model: current_model.clone(),
                            is_compaction: false,
                            compaction_time_ms: 0,
                        });
                    }
                } else if step_type == "SYSTEM_MESSAGE" && source == "SYSTEM" {
                    let mut clean_content = content.trim().to_string();
                    if let Some(caps) = sys_msg_re.captures(&clean_content) {
                        clean_content = caps[1].trim().to_string();
                    } else {
                        let intro = "The following is a <SYSTEM_MESSAGE> not actually sent by the user. It is provided by the system as important information to pay attention to.";
                        if let Some(rest) = clean_content.strip_prefix(intro) {
                            clean_content = rest.trim().to_string();
                        }
                    }
                    let formatted =
                        format_tool_entry(step_type, &clean_content, tool_calls, timestamp);
                    if !formatted.trim().is_empty() {
                        events.push(Event {
                            is_user: false,
                            text: formatted,
                            timestamp,
                            model: current_model.clone(),
                            is_compaction: false,
                            compaction_time_ms: 0,
                        });
                    }
                } else if step_type == "CHECKPOINT" {
                    let preceding_event = events.last();
                    let duration = if let Some(pe) = preceding_event {
                        if pe.is_user {
                            (timestamp - pe.timestamp).max(0)
                        } else {
                            0
                        }
                    } else {
                        0
                    };
                    events.push(Event {
                        is_user: false,
                        text: String::new(),
                        timestamp,
                        model: current_model.clone(),
                        is_compaction: true,
                        compaction_time_ms: duration,
                    });
                } else if step_type == "ERROR_MESSAGE" && source == "SYSTEM" {
                    let formatted = format_tool_entry(step_type, content, tool_calls, timestamp);
                    if !formatted.trim().is_empty() {
                        events.push(Event {
                            is_user: false,
                            text: formatted,
                            timestamp,
                            model: current_model.clone(),
                            is_compaction: false,
                            compaction_time_ms: 0,
                        });
                    }
                }
            }
        }

        // Find the timestamp of the earliest user input or planner response in JSONL events
        let jsonl_start_time = events
            .iter()
            .filter(|e| !e.is_compaction)
            .map(|e| e.timestamp)
            .min()
            .unwrap_or(i64::MAX);

        // Attempt to load older events from the SQLite database
        let mut db_events = Vec::new();
        let db_path = self
            .get_variant_dir()
            .join(format!("conversations/{}.db", session_id));
        let mut db_model = None;
        if db_path.exists() && db_path.is_file() {
            let uncompacted_map = load_jsonl_uncompacted_map(path);
            let mut db_cwd = None;
            if let Ok(parsed_db_events) =
                parse_sqlite_session_db(&db_path, &mut db_cwd, &mut db_model, &uncompacted_map)
            {
                // Filter out events that occurred on or after the start of JSONL events
                db_events = parsed_db_events
                    .into_iter()
                    .filter(|e| e.timestamp < jsonl_start_time)
                    .collect();
                if db_cwd.is_some() && cwd.is_none() {
                    cwd = db_cwd;
                }
            }
        }

        // Prepend database events to the parsed JSONL events
        if !db_events.is_empty() {
            db_events.extend(events);
            events = db_events;
        }

        let has_jsonl_model_change = current_model.is_some();
        let resolved_model = current_model.or(db_model);
        if let Some(ref m) = resolved_model {
            if !has_jsonl_model_change {
                for ev in &mut events {
                    if ev.model.is_none() {
                        ev.model = Some(m.clone());
                    }
                }
            }
        }

        if events.is_empty() {
            return None;
        }

        let mut turns = Vec::new();
        let mut turn_count = 0;
        let mut idx = 0;

        // Group any leading non-user events (before the first user event) into a single initial turn
        if idx < events.len() && !events[idx].is_user {
            let mut assistant_parts = Vec::new();
            let mut turn_model: Option<String> = None;
            let mut active_time_ms = 0i64;
            let mut current_timestamp = events[idx].timestamp;
            let mut has_compaction = false;
            let mut compaction_time_ms = 0i64;

            while idx < events.len() && !events[idx].is_user {
                let ev = &events[idx];
                if ev.is_compaction {
                    has_compaction = true;
                    compaction_time_ms += ev.compaction_time_ms;
                } else {
                    if !ev.text.is_empty() {
                        assistant_parts.push(ev.text.clone());
                    }
                }
                let gap = (ev.timestamp - current_timestamp).max(0);
                active_time_ms += if gap > 120_000 { 15_000 } else { gap };
                current_timestamp = ev.timestamp;
                if ev.model.is_some() {
                    turn_model = ev.model.clone();
                }
                idx += 1;
            }

            // Deduplicate consecutive "[Compacted Response]" and filter them out if actual text is present
            let mut clean_parts = Vec::new();
            for part in assistant_parts {
                if part == "[Compacted Response]" {
                    if clean_parts.last() != Some(&"[Compacted Response]".to_string()) {
                        clean_parts.push(part);
                    }
                } else {
                    clean_parts.push(part);
                }
            }

            let has_actual_text = clean_parts
                .iter()
                .any(|part| !part.starts_with("[[[TOOL:") && part != "[Compacted Response]");

            if has_actual_text {
                clean_parts.retain(|part| part != "[Compacted Response]");
            }

            let assistant_message = clean_parts.join("\n\n");
            let mut extra_data = HashMap::new();
            extra_data.insert("computeTimeMs".to_string(), active_time_ms.to_string());
            let final_model = turn_model.unwrap_or_else(|| "Unknown".to_string());
            extra_data.insert("model".to_string(), final_model.clone());
            if has_compaction {
                extra_data.insert("isCompaction".to_string(), "true".to_string());
                extra_data.insert(
                    "compactionTimeMs".to_string(),
                    compaction_time_ms.to_string(),
                );
            }

            let output_toks = crate::tokenizer::estimate_tokens(&assistant_message, &final_model);

            turns.push(Turn {
                turn_id: format!("{}_{}", session_id, turn_count),
                user_message: String::new(),
                assistant_message,
                timestamp: current_timestamp,
                input_tokens: Some(0),
                output_tokens: Some(output_toks),
                extra_data,
                images: None,
            });
            turn_count += 1;
        }

        while idx < events.len() {
            let ev = &events[idx];
            if ev.is_user {
                let mut assistant_parts = Vec::new();
                let mut next_idx = idx + 1;
                let mut turn_model = ev.model.clone();
                let mut active_time_ms = 0i64;
                let mut current_timestamp = ev.timestamp;
                let mut has_compaction = false;
                let mut compaction_time_ms = 0i64;

                while next_idx < events.len() && !events[next_idx].is_user {
                    let next_ev = &events[next_idx];
                    if next_ev.is_compaction {
                        has_compaction = true;
                        compaction_time_ms += next_ev.compaction_time_ms;
                    } else {
                        if !next_ev.text.is_empty() {
                            assistant_parts.push(next_ev.text.clone());
                        }
                    }
                    let gap = (next_ev.timestamp - current_timestamp).max(0);
                    active_time_ms += if gap > 120_000 { 15_000 } else { gap };
                    current_timestamp = next_ev.timestamp;
                    if next_ev.model.is_some() {
                        turn_model = next_ev.model.clone();
                    }
                    next_idx += 1;
                }

                // Deduplicate consecutive "[Compacted Response]" and filter them out if actual text is present
                let mut clean_parts = Vec::new();
                for part in assistant_parts {
                    if part == "[Compacted Response]" {
                        if clean_parts.last() != Some(&"[Compacted Response]".to_string()) {
                            clean_parts.push(part);
                        }
                    } else {
                        clean_parts.push(part);
                    }
                }

                let has_actual_text = clean_parts
                    .iter()
                    .any(|part| !part.starts_with("[[[TOOL:") && part != "[Compacted Response]");

                if has_actual_text {
                    clean_parts.retain(|part| part != "[Compacted Response]");
                }

                let assistant_message = clean_parts.join("\n\n");
                let mut extra_data = HashMap::new();
                extra_data.insert("computeTimeMs".to_string(), active_time_ms.to_string());
                let final_model = turn_model.unwrap_or_else(|| "Unknown".to_string());
                extra_data.insert("model".to_string(), final_model.clone());
                if has_compaction {
                    extra_data.insert("isCompaction".to_string(), "true".to_string());
                    extra_data.insert(
                        "compactionTimeMs".to_string(),
                        compaction_time_ms.to_string(),
                    );
                }

                let input_toks = crate::tokenizer::estimate_tokens(&ev.text, &final_model);
                let output_toks =
                    crate::tokenizer::estimate_tokens(&assistant_message, &final_model);

                turns.push(Turn {
                    turn_id: format!("{}_{}", session_id, turn_count),
                    user_message: ev.text.clone(),
                    assistant_message,
                    timestamp: ev.timestamp,
                    input_tokens: Some(input_toks),
                    output_tokens: Some(output_toks),
                    extra_data,
                    images: None,
                });
                turn_count += 1;
                idx = next_idx;
            } else {
                if ev.is_compaction {
                    idx += 1;
                    continue;
                }

                let mut extra_data = HashMap::new();
                extra_data.insert("computeTimeMs".to_string(), "0".to_string());
                let final_model = ev.model.clone().unwrap_or_else(|| "Unknown".to_string());
                extra_data.insert("model".to_string(), final_model.clone());

                let output_toks = crate::tokenizer::estimate_tokens(&ev.text, &final_model);

                turns.push(Turn {
                    turn_id: format!("{}_{}", session_id, turn_count),
                    user_message: String::new(),
                    assistant_message: ev.text.clone(),
                    timestamp: ev.timestamp,
                    input_tokens: Some(0),
                    output_tokens: Some(output_toks),
                    extra_data,
                    images: None,
                });
                turn_count += 1;
                idx += 1;
            }
        }

        let first_time = events.first().map(|e| e.timestamp).unwrap_or(last_modified);
        let last_time = events.last().map(|e| e.timestamp).unwrap_or(last_modified);

        let annotation_file = self
            .get_variant_dir()
            .join(format!("annotations/{}.pbtxt", session_id));
        let is_archived = if annotation_file.exists() && annotation_file.is_file() {
            if let Ok(text) = fs::read_to_string(&annotation_file) {
                let normalized: String = text.chars().filter(|c| !c.is_whitespace()).collect();
                normalized.contains("archived:true")
            } else {
                false
            }
        } else {
            false
        };

        // Scan for media files in the brain directory
        let mut session_images = Vec::new();
        if let Some(brain_dir) = path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
        {
            if let Ok(entries) = fs::read_dir(brain_dir) {
                for entry in entries.filter_map(Result::ok) {
                    let entry_path = entry.path();
                    if entry_path.is_file() {
                        if let Some(filename) = entry_path.file_name().and_then(|s| s.to_str()) {
                            if filename.starts_with("media__") {
                                if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                                    let ext_lower = ext.to_lowercase();
                                    if ext_lower == "png"
                                        || ext_lower == "jpg"
                                        || ext_lower == "jpeg"
                                        || ext_lower == "gif"
                                        || ext_lower == "webp"
                                    {
                                        let ts_str = filename
                                            .strip_prefix("media__")
                                            .and_then(|s| s.split('.').next())
                                            .unwrap_or("");
                                        if let Ok(ts) = ts_str.parse::<i64>() {
                                            session_images.push((
                                                ts,
                                                entry_path.to_string_lossy().to_string(),
                                                ext_lower,
                                            ));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Match media files to the closest future turn by timestamp
        if !session_images.is_empty() && !turns.is_empty() {
            for (img_ts, img_path, ext) in session_images {
                let mut matched_index = None;
                for (i, turn) in turns.iter().enumerate() {
                    // Match the first turn that occurred after or roughly at the same time as the image (with a 5s leeway for prompt latency)
                    if turn.timestamp + 5000 >= img_ts {
                        matched_index = Some(i);
                        break;
                    }
                }
                let best_index = matched_index.unwrap_or(turns.len() - 1);
                let mime = match ext.as_str() {
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    _ => "image/png",
                };
                let img_ref = crate::models::ImageReference {
                    id: uuid::Uuid::new_v4().to_string(),
                    path: Some(img_path),
                    base64: None,
                    media_type: Some(mime.to_string()),
                };
                if let Some(ref mut img_list) = turns[best_index].images {
                    img_list.push(img_ref);
                } else {
                    turns[best_index].images = Some(vec![img_ref]);
                }
            }
        }

        let workspace_name = crate::models::resolve_workspace_name(&cwd);
        let status = crate::models::resolve_session_status(
            self.id(),
            &session_id,
            &target_file_path,
            &turns,
            &cwd,
        );

        let session = Session {
            id: session_id.clone(),
            source_id: self.id().to_string(),
            file_path: target_file_path.clone(),
            timestamp: first_time,
            updated_at: last_time,
            cwd,
            thread_name: Some(self.get_session_title(&session_id)),
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
            &target_file_path,
            cache_modified,
            cache_size,
            "",
            session.clone(),
        );

        Some(session)
    }

    fn excluded_session_ids(&self) -> HashSet<String> {
        if cfg!(test) || crate::keyring::get_index_subagents_setting() {
            return HashSet::new();
        }
        self.antigravity_subagent_ids
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    async fn parse_all_sessions(&self) -> Vec<Session> {
        let base_dir = self.get_base_dir();
        if !base_dir.exists() || !base_dir.is_dir() {
            return Vec::new();
        }

        let pb_file = self.get_variant_dir().join("agyhub_summaries_proto.pb");
        let current_modified = if pb_file.exists() && pb_file.is_file() {
            pb_file
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0)
        } else {
            0
        };
        {
            // Acquire in the same order as get_session_title (antigravity_title_map before
            // last_pb_file_modified). The reverse order here caused an AB-BA deadlock once the
            // source adapters became shared singletons: this method held last_pb_file_modified
            // waiting for antigravity_title_map while a concurrent get_session_title held the
            // opposite pair.
            let mut map_guard = self
                .antigravity_title_map
                .write()
                .unwrap_or_else(|e| e.into_inner());
            *map_guard = self.build_antigravity_title_map();
            let mut mod_guard = self
                .last_pb_file_modified
                .write()
                .unwrap_or_else(|e| e.into_inner());
            *mod_guard = current_modified;
        }

        // Refresh the parent->child map before the walk below, so parse_session
        // can tell a subagent from a real conversation as it goes. Built here
        // rather than per-file because the evidence lives in the PARENT's
        // transcript, not the subagent's.
        {
            let subagent_ids = self.build_antigravity_subagent_ids();
            let mut guard = self
                .antigravity_subagent_ids
                .write()
                .unwrap_or_else(|e| e.into_inner());
            *guard = subagent_ids;
        }

        crate::parsers::cache::get_cache_manager().start_scan(self.id());

        let mut sessions = Vec::new();
        let mut walk_stack = vec![base_dir];
        while let Some(current_dir) = walk_stack.pop() {
            if let Ok(entries) = fs::read_dir(current_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        walk_stack.push(path);
                    } else if path.is_file()
                        && path.file_name().and_then(|s| s.to_str()) == Some("transcript.jsonl")
                    {
                        if let Some(session) = self.parse_session(&path.to_string_lossy()).await {
                            sessions.push(session);
                        }
                    }
                }
            }
        }

        crate::parsers::cache::get_cache_manager().end_scan(self.id())
    }
}
