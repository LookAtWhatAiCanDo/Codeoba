use crate::parsers::antigravity::AntigravitySource;
use crate::parsers::claude::ClaudeSource;
use crate::parsers::codex::CodexSource;
use crate::parsers::copilot::CopilotSource;
use crate::parsers::cursor::CursorSource;
use crate::parsers::SourceAdapter;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, PartialEq)]
enum TempMessagePart {
    Text(String),
    Tool {
        tool_type: String,
        header: String,
        content: String,
        timestamp: i64,
    },
}

fn temp_is_escaped(text: &str, index: usize) -> bool {
    let mut count = 0;
    let mut i = index as i64 - 1;
    let bytes = text.as_bytes();
    while i >= 0 && bytes[i as usize] == b'\\' {
        count += 1;
        i -= 1;
    }
    count % 2 != 0
}

fn temp_unescape_tool_tags(text: &str) -> String {
    text.replace("\\[\\[\\[TOOL", "[[[TOOL")
        .replace("\\[\\[\\[/TOOL", "[[[/TOOL")
}

fn temp_parse_assistant_message(message: &str) -> Vec<TempMessagePart> {
    let mut parts = Vec::new();
    let mut current_index = 0;
    while current_index < message.len() {
        let mut start_idx = message[current_index..].find("[[[TOOL:");
        if let Some(idx) = start_idx {
            let actual_idx = current_index + idx;
            if temp_is_escaped(message, actual_idx) {
                let mut search_from = actual_idx + 8;
                loop {
                    if let Some(next_idx) = message[search_from..].find("[[[TOOL:") {
                        let actual_next = search_from + next_idx;
                        if !temp_is_escaped(message, actual_next) {
                            start_idx = Some(actual_next - current_index);
                            break;
                        }
                        search_from = actual_next + 8;
                    } else {
                        start_idx = None;
                        break;
                    }
                }
            }
        }

        let start_idx = match start_idx {
            Some(idx) => current_index + idx,
            None => {
                let remaining = &message[current_index..];
                if !remaining.is_empty() {
                    parts.push(TempMessagePart::Text(temp_unescape_tool_tags(remaining)));
                }
                break;
            }
        };

        if start_idx > current_index {
            let preceding = &message[current_index..start_idx];
            if !preceding.is_empty() {
                parts.push(TempMessagePart::Text(temp_unescape_tool_tags(preceding)));
            }
        }

        let header_end_idx = match message[start_idx..].find("]]]") {
            Some(idx) => start_idx + idx,
            None => {
                parts.push(TempMessagePart::Text(temp_unescape_tool_tags(
                    &message[start_idx..],
                )));
                break;
            }
        };

        let header_content = &message[start_idx + 8..header_end_idx];
        let parts_of_header: Vec<&str> = header_content.split('|').collect();
        let tool_type = parts_of_header.first().copied().unwrap_or("");
        let header = parts_of_header.get(1).copied().unwrap_or("");
        let timestamp = parts_of_header
            .get(2)
            .and_then(|t| t.parse::<i64>().ok())
            .unwrap_or(0);

        let mut end_idx = None;
        let mut search_from = header_end_idx + 3;
        while search_from <= message.len() {
            if let Some(idx) = message[search_from..].find("[[[/TOOL]]]") {
                let actual_end = search_from + idx;
                if !temp_is_escaped(message, actual_end) {
                    end_idx = Some(actual_end);
                    break;
                }
                search_from = actual_end + 11;
            } else {
                break;
            }
        }

        let end_idx = match end_idx {
            Some(idx) => idx,
            None => {
                let tag_start = &message[start_idx..start_idx + 8];
                parts.push(TempMessagePart::Text(temp_unescape_tool_tags(tag_start)));
                current_index = start_idx + 8;
                continue;
            }
        };

        let content = &message[header_end_idx + 3..end_idx];
        parts.push(TempMessagePart::Tool {
            tool_type: temp_unescape_tool_tags(tool_type),
            header: temp_unescape_tool_tags(header),
            content: temp_unescape_tool_tags(content),
            timestamp,
        });
        current_index = end_idx + 11;
    }
    parts
}

async fn with_mock_home<F, Fut>(f: F)
where
    F: FnOnce(PathBuf) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    let temp_dir = tempfile::tempdir().unwrap();
    let original_home = std::env::var_os("HOME");
    let original_userprofile = std::env::var_os("USERPROFILE");
    let original_appdata = std::env::var_os("APPDATA");
    let original_localappdata = std::env::var_os("LOCALAPPDATA");
    let original_mock_home = std::env::var_os("CODEOBA_MOCK_HOME");

    std::env::set_var("HOME", temp_dir.path());
    std::env::set_var("USERPROFILE", temp_dir.path());
    std::env::set_var("APPDATA", temp_dir.path().join("AppData/Roaming"));
    std::env::set_var("LOCALAPPDATA", temp_dir.path().join("AppData/Local"));
    std::env::remove_var("CODEOBA_MOCK_HOME");

    // Clear any previous global cache references before mock execution
    crate::parsers::cache::get_cache_manager().clear_in_memory_caches();

    f(temp_dir.path().to_path_buf()).await;

    // Clear the mock cache references before restoring home directory environment variables
    crate::parsers::cache::get_cache_manager().clear_in_memory_caches();

    if let Some(h) = original_home {
        std::env::set_var("HOME", h);
    } else {
        std::env::remove_var("HOME");
    }
    if let Some(up) = original_userprofile {
        std::env::set_var("USERPROFILE", up);
    } else {
        std::env::remove_var("USERPROFILE");
    }
    if let Some(ad) = original_appdata {
        std::env::set_var("APPDATA", ad);
    } else {
        std::env::remove_var("APPDATA");
    }
    if let Some(la) = original_localappdata {
        std::env::set_var("LOCALAPPDATA", la);
    } else {
        std::env::remove_var("LOCALAPPDATA");
    }
    if let Some(mh) = original_mock_home {
        std::env::set_var("CODEOBA_MOCK_HOME", mh);
    } else {
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}

fn encode_varint(value: u64) -> Vec<u8> {
    let mut list = Vec::new();
    let mut temp = value;
    loop {
        if (temp & !0x7F) == 0 {
            list.push(temp as u8);
            break;
        } else {
            list.push(((temp & 0x7F) | 0x80) as u8);
            temp >>= 7;
        }
    }
    list
}

fn encode_length_delimited(field_number: u32, bytes: &[u8]) -> Vec<u8> {
    let tag = (field_number << 3) | 2;
    let mut result = encode_varint(tag as u64);
    result.extend(encode_varint(bytes.len() as u64));
    result.extend_from_slice(bytes);
    result
}

#[test]
fn test_claude_source_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_file = tempfile::NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        fs::write(
            &temp_path,
            r#"{"type":"user","timestamp":"2026-05-20T02:00:00Z","message":{"role":"user","content":"Hello Claude"},"sessionId":"session123","cwd":"/path/to/project","slug":"test-session"}
{"type":"assistant","timestamp":"2026-05-20T02:01:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Hello User"}]}}
"#,
        ).unwrap();

        let source = crate::parsers::Source::Claude(ClaudeSource);
        let session = source.parse_session(&temp_path).await.unwrap();

        assert_eq!(session.id, "session123");
        assert_eq!(session.cwd, Some("/path/to/project".to_string()));
        assert_eq!(session.thread_name, Some("Hello Claude".to_string()));
        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.turns[0].user_message, "Hello Claude");
        assert_eq!(session.turns[0].assistant_message, "Hello User");
    });
}

#[test]
fn test_claude_compaction_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_file = tempfile::NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        fs::write(
            &temp_path,
            r#"{"type":"user","timestamp":"2026-05-20T02:00:00Z","message":{"role":"user","content":"Hello Claude"},"sessionId":"sessionCompact","cwd":"/path/to/project","slug":"test-session"}
{"parentUuid":null,"logicalParentUuid":"123","isSidechain":false,"type":"system","subtype":"compact_boundary","content":"Conversation compacted","isMeta":false,"timestamp":"2026-05-20T02:00:30Z","uuid":"abc","level":"info","compactMetadata":{"trigger":"auto","preTokens":1000,"postTokens":100,"durationMs":5000},"sessionId":"sessionCompact"}
{"type":"assistant","timestamp":"2026-05-20T02:01:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Hello User"}]}}
"#,
        ).unwrap();

        let source = crate::parsers::Source::Claude(ClaudeSource);
        let session = source.parse_session(&temp_path).await.unwrap();

        assert_eq!(session.id, "sessionCompact");
        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.turns[0].user_message, "Hello Claude");
        assert_eq!(session.turns[0].assistant_message, "Hello User");
        assert_eq!(
            session.turns[0]
                .extra_data
                .get("isCompaction")
                .map(|s| s.as_str()),
            Some("true")
        );
        assert_eq!(
            session.turns[0]
                .extra_data
                .get("compactionTimeMs")
                .map(|s| s.as_str()),
            Some("5000")
        );
    });
}

#[test]
fn test_antigravity_source_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_file = tempfile::NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        fs::write(
            &temp_path,
            r#"{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-05-20T02:00:00Z","content":"<USER_REQUEST>Hello Antigravity</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-05-20T02:01:00Z","content":"Hello back"}
{"step_index":2,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-05-20T02:02:00Z","content":"<USER_REQUEST>Another query</USER_REQUEST><USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from Gemini 3.5 Flash (High) to Claude Sonnet 4.6 (Thinking).\n</USER_SETTINGS_CHANGE>"}
{"step_index":3,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-05-20T02:03:00Z","content":"Sure"}
{"step_index":4,"source":"MODEL","type":"RUN_COMMAND","status":"DONE","created_at":"2026-05-20T02:04:00Z","content":"Running ls","tool_calls":[{"name":"run_command","args":{"CommandLine":"\"ls -la\"","Cwd":"\"/Users/pv/Dev/GitHub/LookAtWhatAiCanDo/Codeoba2\""}}]}
"#,
        ).unwrap();

        let source = AntigravitySource::default();
        let session = source.parse_session(&temp_path).await.unwrap();

        assert_eq!(session.turns.len(), 2);
        assert_eq!(session.turns[0].user_message, "Hello Antigravity");
        assert_eq!(session.turns[0].assistant_message, "Hello back");
        assert_eq!(
            session.turns[0].extra_data.get("model").map(|s| s.as_str()),
            Some("Unknown")
        );
        assert_eq!(
            session.turns[0]
                .extra_data
                .get("computeTimeMs")
                .map(|s| s.as_str()),
            Some("60000")
        );

        assert_eq!(session.turns[1].user_message, "Another query");
        assert!(session.turns[1].assistant_message.contains("Sure"));
        assert!(session.turns[1]
            .assistant_message
            .contains("[[[TOOL:RUN_COMMAND|⚡ Run Command: ls -la"));
        assert_eq!(
            session.turns[1].extra_data.get("model").map(|s| s.as_str()),
            Some("Claude Sonnet 4.6 (Thinking)")
        );
        assert_eq!(
            session.turns[1]
                .extra_data
                .get("computeTimeMs")
                .map(|s| s.as_str()),
            Some("120000")
        );
        assert_eq!(
            session.cwd,
            Some("/Users/pv/Dev/GitHub/LookAtWhatAiCanDo/Codeoba2".to_string())
        );
    });
}

#[test]
fn test_antigravity_system_and_error_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_file = tempfile::NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        fs::write(
            &temp_path,
            r#"{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-05-20T02:00:00Z","content":"<USER_REQUEST>Start</USER_REQUEST>"}
{"step_index":1,"source":"SYSTEM","type":"SYSTEM_MESSAGE","status":"DONE","created_at":"2026-05-20T02:01:00Z","content":"<SYSTEM_MESSAGE>Compilation complete</SYSTEM_MESSAGE>"}
{"step_index":2,"source":"SYSTEM","type":"ERROR_MESSAGE","status":"DONE","created_at":"2026-05-20T02:02:00Z","content":"Command failed with status 1"}
{"step_index":3,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-05-20T02:03:00Z","content":"Done"}
"#,
        ).unwrap();

        let source = AntigravitySource::default();
        let session = source.parse_session(&temp_path).await.unwrap();

        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.turns[0].user_message, "Start");
        assert!(session.turns[0]
            .assistant_message
            .contains("[[[TOOL:SYSTEM_MESSAGE|⚙️ System Message"));
        assert!(session.turns[0]
            .assistant_message
            .contains("Compilation complete"));
        assert!(session.turns[0]
            .assistant_message
            .contains("[[[TOOL:ERROR_MESSAGE|❌ Error"));
        assert!(session.turns[0]
            .assistant_message
            .contains("Command failed with status 1"));
        assert!(session.turns[0].assistant_message.contains("Done"));
    });
}

#[test]
fn test_codex_source_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_file = tempfile::Builder::new()
            .prefix("rollout-")
            .suffix(".jsonl")
            .tempfile()
            .unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        fs::write(
            &temp_path,
            r#"{"timestamp":"2026-05-20T02:00:00Z","type":"session_meta","payload":{"id":"codex123","timestamp":"2026-05-20T02:00:00Z","cwd":"/path/to/codex"}}
{"timestamp":"2026-05-20T02:01:00Z","type":"response_item","payload":{"role":"user","content":[{"text":"Hi Codex"}]}}
{"timestamp":"2026-05-20T02:02:00Z","type":"response_item","payload":{"role":"assistant","content":[{"text":"Hi human"}]}}
"#,
        ).unwrap();

        let source = CodexSource::new();
        let session = source.parse_session(&temp_path).await.unwrap();

        assert_eq!(session.id, "codex123");
        assert_eq!(session.cwd, Some("/path/to/codex".to_string()));
        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.turns[0].user_message, "Hi Codex");
        assert_eq!(session.turns[0].assistant_message, "Hi human");
    });
}

#[test]
fn test_copilot_source_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_dir = tempfile::tempdir().unwrap();
        let workspace_yaml = temp_dir.path().join("workspace.yaml");
        let events_jsonl = temp_dir.path().join("events.jsonl");

        fs::write(
            &workspace_yaml,
            r#"id: copilot-session-123
name: Code review audit
cwd: /path/to/project
branch: main
repository: LookAtWhatAiCanDo/Codeoba
created_at: 2026-06-10T14:10:14.691Z
updated_at: 2026-06-10T21:10:21.486Z
"#,
        )
        .unwrap();

        fs::write(
            &events_jsonl,
            r#"{"type":"user.message","timestamp":"2026-06-10T21:10:16.036Z","data":{"content":"review and audit this code"}}
{"type":"tool.execution_start","timestamp":"2026-06-10T21:10:21.480Z","data":{"toolCallId":"call_1","toolName":"run_command","arguments":{"CommandLine":"ls -la"}}}
{"type":"tool.execution_complete","timestamp":"2026-06-10T21:10:21.483Z","data":{"toolCallId":"call_1","success":true,"result":{"content":"Intent logged","detailedContent":"Reviewing codebase"}}}
{"type":"assistant.message","timestamp":"2026-06-10T21:10:21.479Z","data":{"content":"Reviewing the current diff now...","reasoningText":"Let me start by checking files.","model":"gpt-4o"}}
"#,
        ).unwrap();

        let source = CopilotSource::new();
        let session = source
            .parse_session(&events_jsonl.to_string_lossy())
            .await
            .unwrap();

        assert_eq!(session.id, "copilot-session-123");
        assert_eq!(session.cwd, Some("/path/to/project".to_string()));
        assert_eq!(session.thread_name, Some("Code review audit".to_string()));
        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.turns[0].user_message, "review and audit this code");

        let assistant_text = &session.turns[0].assistant_message;
        assert!(assistant_text.contains("> [!NOTE]"));
        assert!(assistant_text.contains("**Reasoning:**"));
        assert!(assistant_text.contains("Let me start by checking files."));
        assert!(assistant_text.contains("Reviewing the current diff now..."));
        assert!(assistant_text.contains("[[[TOOL:RUN_COMMAND|⚡ Run Command: ls -la"));
        assert!(assistant_text.contains("Reviewing codebase"));

        assert_eq!(
            session.turns[0].extra_data.get("model").map(|s| s.as_str()),
            Some("gpt-4o")
        );
    });
}

#[test]
fn test_antigravity_protobuf_wire_format_title_resolution() {
    tauri::async_runtime::block_on(async {
        with_mock_home(|mock_home| async move {
            let gemini_dir = mock_home.join(".gemini/antigravity");
            fs::create_dir_all(&gemini_dir).unwrap();

            let uuid_bytes = "session-12345".as_bytes();
            let uuid_field = encode_length_delimited(1, uuid_bytes);

            let title_bytes = "Exploring Quantum Physics".as_bytes();
            let title_field = encode_length_delimited(1, title_bytes);
            let info_field = encode_length_delimited(2, &title_field);
            let entry_field = encode_length_delimited(1, &[uuid_field, info_field].concat());

            let pb_file = gemini_dir.join("agyhub_summaries_proto.pb");
            fs::write(&pb_file, &entry_field).unwrap();

            let source = AntigravitySource::default();
            let title = source.get_session_title("session-12345");
            assert_eq!(title, "Exploring Quantum Physics");
        })
        .await;
    });
}

#[test]
fn test_antigravity_archived_parsing() {
    tauri::async_runtime::block_on(async {
        with_mock_home(|mock_home| async move {
            let gemini_dir = mock_home.join(".gemini/antigravity");
            let brain_dir = gemini_dir.join("brain");
            let session_dir = brain_dir.join("session-archived/.system_generated/logs");
            let annotations_dir = gemini_dir.join("annotations");

            fs::create_dir_all(&session_dir).unwrap();
            fs::create_dir_all(&annotations_dir).unwrap();

            let transcript_file = session_dir.join("transcript.jsonl");
            fs::write(
                &transcript_file,
                r#"{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-05-20T02:00:00Z","content":"<USER_REQUEST>Archived test</USER_REQUEST>"}
"#,
            ).unwrap();

            let source = AntigravitySource::default();

            let session1 = source.parse_session(&transcript_file.to_string_lossy()).await.unwrap();
            assert_eq!(session1.is_archived, false);

            let annotation_file = annotations_dir.join("session-archived.pbtxt");
            fs::write(&annotation_file, "archived:true last_user_view_time:{seconds:1234 nanos:567}").unwrap();

            let session2 = source.parse_session(&transcript_file.to_string_lossy()).await.unwrap();
            assert_eq!(session2.is_archived, true);

            fs::write(&annotation_file, "archived:false last_user_view_time:{seconds:1234 nanos:567}").unwrap();

            let session3 = source.parse_session(&transcript_file.to_string_lossy()).await.unwrap();
            assert_eq!(session3.is_archived, false);
        }).await;
    });
}

#[test]
fn test_codex_archived_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_dir = tempfile::tempdir().unwrap();
        let sessions_dir = temp_dir.path().join("sessions");
        let archived_sessions_dir = temp_dir.path().join("archived_sessions");

        fs::create_dir_all(&sessions_dir).unwrap();
        fs::create_dir_all(&archived_sessions_dir).unwrap();

        let active_file = sessions_dir.join("rollout-codex123.jsonl");
        fs::write(
            &active_file,
            r#"{"timestamp":"2026-05-20T02:00:00Z","type":"session_meta","payload":{"id":"codex123","timestamp":"2026-05-20T02:00:00Z","cwd":"/path/to/codex"}}
{"timestamp":"2026-05-20T02:01:00Z","type":"response_item","payload":{"role":"user","content":[{"text":"Hi Codex"}]}}
{"timestamp":"2026-05-20T02:02:00Z","type":"response_item","payload":{"role":"assistant","content":[{"text":"Hi human"}]}}
"#,
        ).unwrap();

        let archived_file = archived_sessions_dir.join("rollout-codex456.jsonl");
        fs::write(
            &archived_file,
            r#"{"timestamp":"2026-05-20T02:00:00Z","type":"session_meta","payload":{"id":"codex456","timestamp":"2026-05-20T02:00:00Z","cwd":"/path/to/codex"}}
{"timestamp":"2026-05-20T02:01:00Z","type":"response_item","payload":{"role":"user","content":[{"text":"Hi Codex"}]}}
{"timestamp":"2026-05-20T02:02:00Z","type":"response_item","payload":{"role":"assistant","content":[{"text":"Hi human"}]}}
"#,
        ).unwrap();

        let source = CodexSource::new();

        let active_session = source
            .parse_session(&active_file.to_string_lossy())
            .await
            .unwrap();
        assert_eq!(active_session.is_archived, false);

        let archived_session = source
            .parse_session(&archived_file.to_string_lossy())
            .await
            .unwrap();
        assert_eq!(archived_session.is_archived, true);
    });
}

#[test]
fn test_antigravity_tool_tags_edge_cases() {
    tauri::async_runtime::block_on(async {
        let temp_file = tempfile::NamedTempFile::new().unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        fs::write(
            &temp_path,
            r#"{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-05-20T02:00:00Z","content":"<USER_REQUEST>Search for [[[TOOL:</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-05-20T02:01:00Z","content":"I will search for `[[[TOOL:` now."}
{"step_index":2,"source":"MODEL","type":"GREP_SEARCH","status":"DONE","created_at":"2026-05-20T02:02:00Z","content":"Found: return \"[[[TOOL:\"","tool_calls":[{"name":"grep_search","args":{"Query":"\"[[[TOOL:\""}}]}
"#,
        ).unwrap();

        let source = AntigravitySource::default();
        let session = source.parse_session(&temp_path).await.unwrap();

        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.turns[0].user_message, "Search for [[[TOOL:");

        let assistant_text = &session.turns[0].assistant_message;
        assert!(assistant_text.contains("I will search for `\\[\\[\\[TOOL:` now."));
        assert!(assistant_text
            .contains("[[[TOOL:GREP_SEARCH|🔍 Search: Query: \\[\\[\\[TOOL:|1779242520000]]]"));
        assert!(assistant_text.contains("Found: return \"\\[\\[\\[TOOL:\""));
    });
}

#[test]
fn test_cursor_windows_path_stripping() {
    let paths = vec![
        ("file:///C:/Users/pv/Dev/Project", "C:/Users/pv/Dev/Project"),
        ("file:///D:/Work", "D:/Work"),
        ("file:///etc/hosts", "/etc/hosts"),
        ("/Users/pv/Dev", "/Users/pv/Dev"),
    ];
    for (input, expected) in paths {
        let mut folder_path = if input.starts_with("file://") {
            input.trim_start_matches("file://").to_string()
        } else {
            input.to_string()
        };
        if folder_path.starts_with('/')
            && folder_path.len() > 2
            && folder_path.as_bytes()[2] == b':'
        {
            folder_path = folder_path[1..].to_string();
        }
        assert_eq!(folder_path, expected);
    }
}

#[test]
fn test_cursor_sqlite_parsing() {
    tauri::async_runtime::block_on(async {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("state.vscdb");

        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
            [],
        )
        .unwrap();

        let value_str = r#"{"name":"Feature development","createdAt":1779242400000,"lastUpdatedAt":1779242460000,"conversation":[{"type":1,"text":"Create login screen","model":"gpt-4o"},{"type":2,"text":"Okay, creating..."}]}"#;
        conn.execute(
            "INSERT INTO cursorDiskKV (key, value) VALUES ('composerData:session123', ?1);",
            [value_str],
        )
        .unwrap();

        let ws_dir = temp_dir.path().join("workspaceStorage");
        let ws_sub_dir = ws_dir.join("workspace-abc");
        fs::create_dir_all(&ws_sub_dir).unwrap();

        let ws_json = ws_sub_dir.join("workspace.json");
        fs::write(&ws_json, r#"{"folder":"file:///Users/pv/Dev/Project"}"#).unwrap();

        let ws_db = ws_sub_dir.join("state.vscdb");
        let ws_conn = Connection::open(&ws_db).unwrap();
        ws_conn
            .execute(
                "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);",
                [],
            )
            .unwrap();
        ws_conn.execute(
            "INSERT INTO ItemTable (key, value) VALUES ('composer.composerData', '{\"allComposers\": [{\"composerId\": \"session123\"}]}');",
            [],
        ).unwrap();

        with_mock_home(|mock_home| async move {
            let cursor_dir = mock_home.join("Library/Application Support/Cursor/User");
            if cfg!(target_os = "windows") {
                let win_cursor_dir = mock_home.join("AppData/Roaming/Cursor/User");
                fs::create_dir_all(win_cursor_dir.join("globalStorage")).unwrap();
                fs::copy(&db_path, win_cursor_dir.join("globalStorage/state.vscdb")).unwrap();

                let ws_target_dir = win_cursor_dir.join("workspaceStorage");
                fs::create_dir_all(ws_target_dir.join("workspace-abc")).unwrap();
                fs::copy(&ws_json, ws_target_dir.join("workspace-abc/workspace.json")).unwrap();
                fs::copy(&ws_db, ws_target_dir.join("workspace-abc/state.vscdb")).unwrap();
            } else {
                fs::create_dir_all(cursor_dir.join("globalStorage")).unwrap();
                fs::copy(&db_path, cursor_dir.join("globalStorage/state.vscdb")).unwrap();

                let ws_target_dir = cursor_dir.join("workspaceStorage");
                fs::create_dir_all(ws_target_dir.join("workspace-abc")).unwrap();
                fs::copy(&ws_json, ws_target_dir.join("workspace-abc/workspace.json")).unwrap();
                fs::copy(&ws_db, ws_target_dir.join("workspace-abc/state.vscdb")).unwrap();
            }

            let source = CursorSource::new();
            let sessions = source.parse_all_sessions().await;

            assert_eq!(sessions.len(), 1);
            let s = &sessions[0];
            assert_eq!(s.id, "session123");
            assert_eq!(s.thread_name, Some("Feature development".to_string()));
            assert_eq!(s.turns.len(), 1);
            assert_eq!(s.turns[0].user_message, "Create login screen");
            assert_eq!(s.turns[0].assistant_message, "Okay, creating...");
        })
        .await;
    });
}

#[test]
fn test_antigravity_tool_tags_edge_cases_parser() {
    let text1 = "Preceding text [[[TOOL:GREP_SEARCH|Search|123]]] Tool content without closing tag.\nSubsequent dialogue text.";
    let parts1 = temp_parse_assistant_message(text1);
    assert_eq!(parts1.len(), 3);
    assert_eq!(
        parts1[0],
        TempMessagePart::Text("Preceding text ".to_string())
    );
    assert_eq!(parts1[1], TempMessagePart::Text("[[[TOOL:".to_string()));
    assert_eq!(parts1[2], TempMessagePart::Text("GREP_SEARCH|Search|123]]] Tool content without closing tag.\nSubsequent dialogue text.".to_string()));

    let text2 = "This is an escaped tag: \\[\\[\\[TOOL:GREP_SEARCH]]], and an unescaped tag: [[[TOOL:VIEW_FILE|View|456]]]\nContent\n[[[/TOOL]]]";
    let parts2 = temp_parse_assistant_message(text2);
    assert_eq!(parts2.len(), 2);
    assert_eq!(
        parts2[0],
        TempMessagePart::Text(
            "This is an escaped tag: [[[TOOL:GREP_SEARCH]]], and an unescaped tag: ".to_string()
        )
    );
    assert_eq!(
        parts2[1],
        TempMessagePart::Tool {
            tool_type: "VIEW_FILE".to_string(),
            header: "View".to_string(),
            content: "\nContent\n".to_string(),
            timestamp: 456,
        }
    );
}

#[test]
fn test_mock_subprocess_agent_run() {
    let temp_dir = tempfile::tempdir().unwrap();
    let log_file = temp_dir.path().join("mock_session.jsonl");

    // Write a mock agent script
    let script_file = temp_dir.path().join("mock_agent.sh");
    let script_content = format!(
        "#!/bin/sh\n\
         echo 'Prompt tokens: 1000, Completion tokens: 300'\n\
         echo '{{\"type\":\"user\",\"timestamp\":\"2026-05-20T02:00:00Z\",\"message\":{{\"role\":\"user\",\"content\":\"Hello\"}},\"sessionId\":\"mock123\"}}' > '{}'\n\
         echo '{{\"type\":\"assistant\",\"timestamp\":\"2026-05-20T02:01:00Z\",\"message\":{{\"role\":\"assistant\",\"content\":[{{\"type\":\"text\",\"text\":\"Hi\"}}]}}}}' >> '{}'\n",
        log_file.to_string_lossy(),
        log_file.to_string_lossy()
    );

    fs::write(&script_file, script_content).unwrap();

    // Make the script executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&script_file).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&script_file, perms).unwrap();
    }

    // Run the subprocess
    let output = std::process::Command::new(&script_file)
        .output()
        .expect("Failed to execute mock agent");

    let stdout_str = String::from_utf8_lossy(&output.stdout);

    // Parse stdout for token metrics
    let mut reported_prompt_tokens = 0;
    let mut reported_completion_tokens = 0;
    for line in stdout_str.lines() {
        if line.contains("Prompt tokens:") {
            let parts: Vec<&str> = line.split(',').collect();
            for part in parts {
                if part.contains("Prompt tokens:") {
                    reported_prompt_tokens = part
                        .split(':')
                        .nth(1)
                        .unwrap()
                        .trim()
                        .parse::<i64>()
                        .unwrap_or(0);
                } else if part.contains("Completion tokens:") {
                    reported_completion_tokens = part
                        .split(':')
                        .nth(1)
                        .unwrap()
                        .trim()
                        .parse::<i64>()
                        .unwrap_or(0);
                }
            }
        }
    }

    assert_eq!(reported_prompt_tokens, 1000);
    assert_eq!(reported_completion_tokens, 300);

    // Verify parser successfully reads the generated log file
    let source = ClaudeSource;
    let session = tauri::async_runtime::block_on(async {
        source.parse_session(&log_file.to_string_lossy()).await
    })
    .unwrap();

    assert_eq!(session.turns.len(), 1);
    assert_eq!(session.turns[0].user_message, "Hello");
    assert_eq!(session.turns[0].assistant_message, "Hi");
}

#[test]
fn test_cmd_get_sources() {
    let sources = crate::commands::get_sources();
    assert!(!sources.is_empty());
    assert!(sources.iter().any(|s| s.id == "claude" || s.id == "cursor"));
}

#[test]
fn test_cmd_credentials() {
    let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    let temp_dir = tempfile::tempdir().unwrap();
    let original_home = std::env::var_os("HOME");
    std::env::set_var("HOME", temp_dir.path());

    crate::commands::save_credential("test_key".to_string(), Some("test_secret".to_string()));
    let val = crate::commands::get_credential("test_key".to_string());
    assert_eq!(val, Some("test_secret".to_string()));

    crate::commands::save_credential("test_key".to_string(), None);
    let val2 = crate::commands::get_credential("test_key".to_string());
    assert_eq!(val2, None);

    if let Some(h) = original_home {
        std::env::set_var("HOME", h);
    } else {
        std::env::remove_var("HOME");
    }
}

#[test]
fn test_cmd_get_all_sessions() {
    tauri::async_runtime::block_on(async {
        with_mock_home(|mock_home| async move {
            let claude_dir = mock_home.join(".claude/projects");
            fs::create_dir_all(&claude_dir).unwrap();

            let log_file = claude_dir.join("test-session.jsonl");
            fs::write(
                &log_file,
                r#"{"type":"user","timestamp":"2026-05-20T02:00:00Z","message":{"role":"user","content":"Hello"},"sessionId":"session123","cwd":"/path/to/project","slug":"test-session"}
{"type":"assistant","timestamp":"2026-05-20T02:01:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]}}
"#,
            ).unwrap();

            use tauri::Manager;
            let app = tauri::test::mock_builder().build(tauri::test::mock_context(tauri::test::noop_assets())).unwrap();
            app.manage(crate::search::SearchIndexState::new());
            app.manage(crate::groups::GroupState::new());
            let handle = app.handle().clone();

            let state = handle.state::<crate::search::SearchIndexState>();
            state.rebuild(false, None::<tauri::AppHandle>).await.unwrap();

            let sessions = crate::commands::get_all_sessions(handle).await.unwrap();
            assert!(!sessions.is_empty());
            let s = sessions.iter().find(|x| x.id == "session123");
            assert!(s.is_some());
        }).await;
    });
}

#[test]
fn test_hash_semantic_embedder() {
    let embedder = crate::search::semantic::HashSemanticEmbedder::new(384);

    let text1 = "how to build a project with kotlin";
    let text2 = "how do I build kotlin projects";
    let text3 = "apples grow on trees in the autumn";

    let emb1 = embedder.get_embeddings(text1);
    let emb2 = embedder.get_embeddings(text2);
    let emb3 = embedder.get_embeddings(text3);

    assert_eq!(emb1.len(), 384);
    assert_eq!(emb2.len(), 384);
    assert_eq!(emb3.len(), 384);

    fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() || a.is_empty() {
            return 0.0;
        }
        let mut dot_product = 0.0;
        let mut norm_a = 0.0;
        let mut norm_b = 0.0;
        for i in 0..a.len() {
            dot_product += a[i] * b[i];
            norm_a += a[i] * a[i];
            norm_b += b[i] * b[i];
        }
        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }
        dot_product / (norm_a.sqrt() * norm_b.sqrt())
    }

    let sim_similar = cosine_similarity(&emb1, &emb2);
    let sim_disjoint = cosine_similarity(&emb1, &emb3);

    println!("simSimilar: {}, simDisjoint: {}", sim_similar, sim_disjoint);
    assert!(
        sim_similar > sim_disjoint,
        "Similar similarity ({}) should be greater than disjoint similarity ({})",
        sim_similar,
        sim_disjoint
    );
}

#[test]
fn test_word_piece_tokenizer() {
    use std::io::Write;
    let mut temp_vocab = tempfile::NamedTempFile::new().unwrap();
    writeln!(temp_vocab, "[PAD]").unwrap();
    writeln!(temp_vocab, "[UNK]").unwrap();
    writeln!(temp_vocab, "[CLS]").unwrap();
    writeln!(temp_vocab, "[SEP]").unwrap();
    writeln!(temp_vocab, "how").unwrap();
    writeln!(temp_vocab, "to").unwrap();
    writeln!(temp_vocab, "build").unwrap();
    writeln!(temp_vocab, "project").unwrap();
    writeln!(temp_vocab, "##s").unwrap();
    writeln!(temp_vocab, "kotlin").unwrap();

    let tokenizer = crate::search::tokenizer::WordPieceTokenizer::new(temp_vocab.path()).unwrap();
    let tokenized = tokenizer.tokenize_to_ids("how to build projects", 8);

    let ids = tokenized.input_ids;
    assert!(!ids.is_empty(), "Token IDs should not be empty");
    assert_eq!(ids[0], 2, "First token should be [CLS]");
    assert_eq!(
        tokenized.attention_mask[0], 1,
        "Attention mask for CLS should be 1"
    );
    assert_eq!(
        tokenized.attention_mask[6], 1,
        "Attention mask for SEP should be 1"
    );
    assert_eq!(
        tokenized.attention_mask[7], 0,
        "Attention mask for padding should be 0"
    );

    // Test long word to avoid hang
    let long_word = "a".repeat(1000);
    let tokenized_long = tokenizer.tokenize_to_ids(&long_word, 8);
    assert_eq!(
        tokenized_long.input_ids[1], 1,
        "Long word should resolve to [UNK] (id 1)"
    );
}

#[test]
fn test_onnx_semantic_embedder() {
    let (model_path, vocab_path) = crate::search::resolve_model_paths(None::<&tauri::AppHandle>);

    if model_path.exists() && vocab_path.exists() {
        let embedder =
            crate::search::semantic::OnnxSemanticEmbedder::new(&model_path, &vocab_path).unwrap();
        let text1 = "how to build a project with kotlin";
        let text2 = "how do I build kotlin projects";
        let text3 = "apples grow on trees in the autumn";

        let emb1 = embedder.get_embeddings(text1).unwrap();
        let emb2 = embedder.get_embeddings(text2).unwrap();
        let emb3 = embedder.get_embeddings(text3).unwrap();

        assert_eq!(emb1.len(), 384, "Embedding size should be 384");

        let mut sum1 = 0.0;
        for v in &emb1 {
            sum1 += v * v;
        }
        assert!(
            (sum1 - 1.0f32).abs() < 1e-3,
            "Vector should be unit normalized, but got magnitude {}",
            sum1
        );

        fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
            if a.len() != b.len() || a.is_empty() {
                return 0.0;
            }
            let mut dot_product = 0.0;
            let mut norm_a = 0.0;
            let mut norm_b = 0.0;
            for i in 0..a.len() {
                dot_product += a[i] * b[i];
                norm_a += a[i] * a[i];
                norm_b += b[i] * b[i];
            }
            if norm_a == 0.0 || norm_b == 0.0 {
                return 0.0;
            }
            dot_product / (norm_a.sqrt() * norm_b.sqrt())
        }

        let sim_similar = cosine_similarity(&emb1, &emb2);
        let sim_disjoint = cosine_similarity(&emb1, &emb3);
        println!(
            "ONNX Semantic Similarities: sim(1,2) = {}, sim(1,3) = {}",
            sim_similar, sim_disjoint
        );

        assert!(
            sim_similar > sim_disjoint,
            "Similar similarity ({}) should be greater than disjoint similarity ({})",
            sim_similar,
            sim_disjoint
        );
    } else {
        println!("Skipping test_onnx_semantic_embedder: model not downloaded.");
    }
}

#[test]
fn test_lexical_search_engine_filters() {
    let active_session = crate::models::Session {
        id: "session-active".to_string(),
        source_id: "claude".to_string(),
        file_path: "/path/to/active.jsonl".to_string(),
        timestamp: 1000,
        updated_at: 1000,
        cwd: Some("/workspace".to_string()),
        thread_name: Some("Active Session".to_string()),
        turns: vec![crate::models::Turn {
            turn_id: "1".to_string(),
            user_message: "user message".to_string(),
            assistant_message: "assistant response".to_string(),
            timestamp: 1000,
            input_tokens: None,
            output_tokens: None,
            extra_data: std::collections::HashMap::new(),
        }],
        is_archived: false,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("workspace".to_string()),
        status: None,
        is_deleted: false,
    };

    let archived_session = crate::models::Session {
        id: "session-archived".to_string(),
        source_id: "claude".to_string(),
        file_path: "/path/to/archived.jsonl".to_string(),
        timestamp: 2000,
        updated_at: 2000,
        cwd: Some("/workspace".to_string()),
        thread_name: Some("Archived Session".to_string()),
        turns: vec![crate::models::Turn {
            turn_id: "2".to_string(),
            user_message: "user message".to_string(),
            assistant_message: "assistant response".to_string(),
            timestamp: 2000,
            input_tokens: None,
            output_tokens: None,
            extra_data: std::collections::HashMap::new(),
        }],
        is_archived: true,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("workspace".to_string()),
        status: None,
        is_deleted: false,
    };

    let sessions = vec![active_session, archived_session];

    // 1. ALL filter returns both
    let mut filter_all = crate::search::SearchFilter::default();
    filter_all.archival_filter = crate::search::ArchivalFilter::All;
    let all_results = crate::search::lexical::lexical_search(&sessions, "message", &filter_all);
    assert_eq!(all_results.len(), 2);

    // 2. ACTIVE filter returns only active
    let mut filter_active = crate::search::SearchFilter::default();
    filter_active.archival_filter = crate::search::ArchivalFilter::Active;
    let active_results =
        crate::search::lexical::lexical_search(&sessions, "message", &filter_active);
    assert_eq!(active_results.len(), 1);
    assert_eq!(active_results[0].session.id, "session-active");

    // 3. ARCHIVED filter returns only archived
    let mut filter_archived = crate::search::SearchFilter::default();
    filter_archived.archival_filter = crate::search::ArchivalFilter::Archived;
    let archived_results =
        crate::search::lexical::lexical_search(&sessions, "message", &filter_archived);
    assert_eq!(archived_results.len(), 1);
    assert_eq!(archived_results[0].session.id, "session-archived");
}

#[test]
fn test_semantic_search_engine_filters() {
    let active_session = crate::models::Session {
        id: "session-active".to_string(),
        source_id: "claude".to_string(),
        file_path: "/path/to/active.jsonl".to_string(),
        timestamp: 1000,
        updated_at: 1000,
        cwd: Some("/workspace".to_string()),
        thread_name: Some("Active Session".to_string()),
        turns: vec![crate::models::Turn {
            turn_id: "1".to_string(),
            user_message: "user message".to_string(),
            assistant_message: "assistant response".to_string(),
            timestamp: 1000,
            input_tokens: None,
            output_tokens: None,
            extra_data: std::collections::HashMap::new(),
        }],
        is_archived: false,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("workspace".to_string()),
        status: None,
        is_deleted: false,
    };

    let archived_session = crate::models::Session {
        id: "session-archived".to_string(),
        source_id: "claude".to_string(),
        file_path: "/path/to/archived.jsonl".to_string(),
        timestamp: 2000,
        updated_at: 2000,
        cwd: Some("/workspace".to_string()),
        thread_name: Some("Archived Session".to_string()),
        turns: vec![crate::models::Turn {
            turn_id: "2".to_string(),
            user_message: "user message".to_string(),
            assistant_message: "assistant response".to_string(),
            timestamp: 2000,
            input_tokens: None,
            output_tokens: None,
            extra_data: std::collections::HashMap::new(),
        }],
        is_archived: true,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("workspace".to_string()),
        status: None,
        is_deleted: false,
    };

    let sessions = vec![active_session, archived_session];
    let embedder = crate::search::semantic::HashSemanticEmbedder::new(384);

    let mut embeddings = std::collections::HashMap::new();
    for session in &sessions {
        let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");
        let thread_emb = embedder.get_embeddings(thread_name);
        let mut turn_embeddings = Vec::new();
        for turn in &session.turns {
            let text = format!("{}\n{}", turn.user_message, turn.assistant_message);
            turn_embeddings.push(embedder.get_embeddings(&text));
        }
        embeddings.insert(
            session.id.clone(),
            crate::search::SessionVectorIndex {
                thread_name_embedding: thread_emb,
                turn_embeddings,
            },
        );
    }

    let query_vector = embedder.get_embeddings("message");

    // 1. ALL filter returns both
    let mut filter_all = crate::search::SearchFilter::default();
    filter_all.archival_filter = crate::search::ArchivalFilter::All;
    let all_results = crate::search::semantic::semantic_search(
        &sessions,
        &embeddings,
        &query_vector,
        0.1,
        &filter_all,
    );
    assert_eq!(all_results.len(), 2);

    // 2. ACTIVE filter returns only active
    let mut filter_active = crate::search::SearchFilter::default();
    filter_active.archival_filter = crate::search::ArchivalFilter::Active;
    let active_results = crate::search::semantic::semantic_search(
        &sessions,
        &embeddings,
        &query_vector,
        0.1,
        &filter_active,
    );
    assert_eq!(active_results.len(), 1);
    assert_eq!(active_results[0].session.id, "session-active");

    // 3. ARCHIVED filter returns only archived
    let mut filter_archived = crate::search::SearchFilter::default();
    filter_archived.archival_filter = crate::search::ArchivalFilter::Archived;
    let archived_results = crate::search::semantic::semantic_search(
        &sessions,
        &embeddings,
        &query_vector,
        0.1,
        &filter_archived,
    );
    assert_eq!(archived_results.len(), 1);
    assert_eq!(archived_results[0].session.id, "session-archived");
}

#[test]
fn test_print_actual_cache_loads() {
    let state = crate::search::SearchIndexState::new();
    state.load_cached_sessions();
    let guard = state.sessions.read().unwrap();
    println!("ACTUAL LOADED SESSIONS COUNT: {}", guard.len());
    let mut by_source = std::collections::HashMap::new();
    for s in guard.values() {
        *by_source.entry(s.source_id.clone()).or_insert(0) += 1;
    }
    for (source, count) in by_source {
        println!("  Source: {}, Count: {}", source, count);
    }
}

fn create_mock_cursor_logs(mock_home: &std::path::Path) {
    let cursor_dir = if cfg!(target_os = "windows") {
        mock_home.join("AppData/Roaming/Cursor/User")
    } else if cfg!(target_os = "macos") {
        mock_home.join("Library/Application Support/Cursor/User")
    } else {
        mock_home.join(".config/Cursor/User")
    };
    let global_dir = cursor_dir.join("globalStorage");
    let ws_dir = cursor_dir.join("workspaceStorage/workspace-demo");
    std::fs::create_dir_all(&global_dir).unwrap();
    std::fs::create_dir_all(&ws_dir).unwrap();

    let db_path = global_dir.join("state.vscdb");
    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT);",
        [],
    )
    .unwrap();

    let session_val_1 = r#"{
        "name": "Cursor Demo Session 1",
        "createdAt": 1779242400000,
        "lastUpdatedAt": 1779242460000,
        "conversation": [
            {"type": 1, "text": "Hey Cursor, this text is exactly twenty characters.", "model": "gpt-4o"},
            {"type": 2, "text": "Understood. The response contains exactly thirty-three characters."}
        ]
    }"#;
    conn.execute(
        "INSERT INTO cursorDiskKV (key, value) VALUES ('composerData:session-cursor-demo-1', ?1);",
        [session_val_1],
    )
    .unwrap();

    let session_val_2 = r#"{
        "name": "Cursor Demo Session 2",
        "createdAt": 1779242500000,
        "lastUpdatedAt": 1779242560000,
        "conversation": [
            {"type": 1, "text": "Hey Cursor, session two.", "model": "claude-3-5-sonnet"},
            {"type": 2, "text": "Sure."}
        ]
    }"#;
    conn.execute(
        "INSERT INTO cursorDiskKV (key, value) VALUES ('composerData:session-cursor-demo-2', ?1);",
        [session_val_2],
    )
    .unwrap();

    let ws_json = ws_dir.join("workspace.json");
    std::fs::write(
        &ws_json,
        r#"{"folder":"file:///Users/pv/Dev/GitHub/LookAtWhatAiCanDo/Codeoba"}"#,
    )
    .unwrap();

    let ws_db = ws_dir.join("state.vscdb");
    let conn_ws = Connection::open(&ws_db).unwrap();
    conn_ws
        .execute(
            "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);",
            [],
        )
        .unwrap();
    conn_ws.execute(
        "INSERT INTO ItemTable (key, value) VALUES ('composer.composerData', '{\"allComposers\": [{\"composerId\": \"session-cursor-demo-1\"}, {\"composerId\": \"session-cursor-demo-2\"}]}');",
        [],
    ).unwrap();
}

fn create_mock_claude_logs(mock_home: &std::path::Path) {
    let claude_projects_dir = mock_home.join(".claude/projects/project-demo");
    let claude_plans_dir = mock_home.join(".claude/plans");
    std::fs::create_dir_all(&claude_projects_dir).unwrap();
    std::fs::create_dir_all(&claude_plans_dir).unwrap();

    let log_file = claude_projects_dir.join("session-claude-demo.jsonl");
    let log_content_clean = r#"{"type":"user","timestamp":"2026-05-20T02:00:00Z","message":{"role":"user","content":"Verify Claude fallback formula."},"sessionId":"session-claude-demo","cwd":"/Users/pv/Dev/GitHub/LookAtWhatAiCanDo/Codeoba","slug":"claude-plan-slug"}
{"type":"system","subtype":"compact_boundary","timestamp":"2026-05-20T02:00:05Z","compactMetadata":{"durationMs":8000},"sessionId":"session-claude-demo"}
{"type":"assistant","timestamp":"2026-05-20T02:00:10Z","message":{"role":"assistant","model":"claude-3-5-sonnet","content":[{"type":"text","text":"Claude reply verified."}]}}
"#;
    std::fs::write(&log_file, log_content_clean).unwrap();

    let plan_file = claude_plans_dir.join("claude-plan-slug.md");
    std::fs::write(
        &plan_file,
        "# Goal: Claude Demo Session\nVerification plan.",
    )
    .unwrap();
}

struct TelemetryStats {
    total_conversations: usize,
    total_turns: usize,
    total_prompt_tokens: i64,
    total_response_tokens: i64,
    total_estimated_tokens: i64,
    avg_turns_per_session: f64,
    avg_session_duration_ms: f64,
    avg_turn_duration_ms: f64,
    avg_speed_tps: f64,
    total_compactions: usize,
    total_compaction_time_ms: i64,
}

fn calculate_telemetry_stats(sessions: &[crate::models::Session]) -> TelemetryStats {
    let total_conversations = sessions.len();
    let mut total_turns = 0;
    let mut total_prompt_tokens = 0;
    let mut total_response_tokens = 0;
    let mut total_elapsed_ms = 0;
    let mut total_compute_time_ms = 0;
    let mut total_compactions = 0;
    let mut total_compaction_time_ms = 0;

    for s in sessions {
        total_turns += s.turns.len();
        let elapsed = (s.updated_at - s.timestamp).max(0);
        total_elapsed_ms += elapsed;

        for t in &s.turns {
            total_prompt_tokens += t.input_tokens.unwrap_or(0);
            total_response_tokens += t.output_tokens.unwrap_or(0);

            let ms = t
                .extra_data
                .get("computeTimeMs")
                .and_then(|val| val.parse::<i64>().ok());
            if let Some(compute_ms) = ms {
                if compute_ms > 0 {
                    total_compute_time_ms += compute_ms.min(900_000);
                } else if !t.assistant_message.is_empty() {
                    let est_ms = (t.assistant_message.len() as f64 / 120.0 * 1000.0) as i64;
                    total_compute_time_ms += est_ms.clamp(2000, 60000);
                }
            } else if !t.assistant_message.is_empty() {
                let est_ms = (t.assistant_message.len() as f64 / 120.0 * 1000.0) as i64;
                total_compute_time_ms += est_ms.clamp(2000, 60000);
            }

            if t.extra_data.get("isCompaction").map(|v| v.as_str()) == Some("true") {
                total_compactions += 1;
                if let Some(comp_ms) = t
                    .extra_data
                    .get("compactionTimeMs")
                    .and_then(|v| v.parse::<i64>().ok())
                {
                    total_compaction_time_ms += comp_ms;
                }
            }
        }
    }

    let total_estimated_tokens = total_prompt_tokens + total_response_tokens;
    let avg_turns_per_session = if total_conversations > 0 {
        total_turns as f64 / total_conversations as f64
    } else {
        0.0
    };
    let avg_session_duration_ms = if total_conversations > 0 {
        total_elapsed_ms as f64 / total_conversations as f64
    } else {
        0.0
    };
    let avg_turn_duration_ms = if total_turns > 0 {
        total_compute_time_ms as f64 / total_turns as f64
    } else {
        0.0
    };
    let avg_speed_tps = if total_compute_time_ms > 0 {
        (total_estimated_tokens as f64 * 1000.0) / total_compute_time_ms as f64
    } else {
        0.0
    };

    TelemetryStats {
        total_conversations,
        total_turns,
        total_prompt_tokens,
        total_response_tokens,
        total_estimated_tokens,
        avg_turns_per_session,
        avg_session_duration_ms,
        avg_turn_duration_ms,
        avg_speed_tps,
        total_compactions,
        total_compaction_time_ms,
    }
}

#[test]
fn test_hybrid_telemetry_validation_harness() {
    tauri::async_runtime::block_on(async {
        with_mock_home(|mock_home| async move {
            crate::tokenizer::clear_custom_tokenizers_cache();
            create_mock_cursor_logs(&mock_home);
            create_mock_claude_logs(&mock_home);

            let cursor_source = CursorSource::new();
            let claude_source = ClaudeSource;

            let cursor_sessions = cursor_source.parse_all_sessions().await;
            let claude_sessions = claude_source.parse_all_sessions().await;

            assert_eq!(cursor_sessions.len(), 2);
            let c1 = cursor_sessions
                .iter()
                .find(|s| s.id == "session-cursor-demo-1")
                .unwrap();
            assert_eq!(c1.turns.len(), 1);
            assert_eq!(c1.turns[0].input_tokens, Some(15));
            assert_eq!(c1.turns[0].output_tokens, Some(19));
            assert_eq!(
                c1.turns[0].extra_data.get("model").map(|s| s.as_str()),
                Some("gpt-4o")
            );
            assert_eq!(
                c1.turns[0]
                    .extra_data
                    .get("computeTimeMs")
                    .map(|s| s.as_str()),
                Some("0")
            );

            let c2 = cursor_sessions
                .iter()
                .find(|s| s.id == "session-cursor-demo-2")
                .unwrap();
            assert_eq!(c2.turns.len(), 1);
            assert_eq!(c2.turns[0].input_tokens, Some(9));
            assert_eq!(c2.turns[0].output_tokens, Some(4));

            assert_eq!(claude_sessions.len(), 1);
            let cl = &claude_sessions[0];
            assert_eq!(cl.id, "session-claude-demo");
            assert_eq!(cl.turns.len(), 1);
            assert_eq!(cl.turns[0].input_tokens, Some(10));
            assert_eq!(cl.turns[0].output_tokens, Some(8));
            assert_eq!(
                cl.turns[0]
                    .extra_data
                    .get("isCompaction")
                    .map(|s| s.as_str()),
                Some("true")
            );
            assert_eq!(
                cl.turns[0]
                    .extra_data
                    .get("compactionTimeMs")
                    .map(|s| s.as_str()),
                Some("8000")
            );
            assert_eq!(cl.thread_name.as_deref(), Some("Claude Demo Session"));

            let mut all_sessions = Vec::new();
            all_sessions.extend(cursor_sessions);
            all_sessions.extend(claude_sessions);

            let stats = calculate_telemetry_stats(&all_sessions);

            assert_eq!(stats.total_conversations, 3);
            assert_eq!(stats.total_turns, 3);
            assert_eq!(stats.total_prompt_tokens, 34);
            assert_eq!(stats.total_response_tokens, 31);
            assert_eq!(stats.total_estimated_tokens, 65);
            assert_eq!(stats.avg_turns_per_session, 1.0);

            let expected_elapsed = 60000 + 60000 + 10000;
            let expected_avg_session_duration = expected_elapsed as f64 / 3.0;
            assert_eq!(stats.avg_session_duration_ms, expected_avg_session_duration);

            assert_eq!(stats.avg_turn_duration_ms, 14000.0 / 3.0);
            assert_eq!(stats.avg_speed_tps, 65000.0 / 14000.0);
            assert_eq!(stats.total_compactions, 1);
            assert_eq!(stats.total_compaction_time_ms, 8000);
        })
        .await;
    });
}

#[test]
fn test_hybrid_tokenizer_calibration() {
    let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    let temp_dir = tempfile::tempdir().unwrap();
    let original_home = std::env::var_os("HOME");
    let original_mock_home = std::env::var_os("CODEOBA_MOCK_HOME");

    std::env::set_var("HOME", temp_dir.path());
    std::env::remove_var("CODEOBA_MOCK_HOME");

    crate::tokenizer::clear_custom_tokenizers_cache();

    let text_claude = "Verify Claude fallback formula."; // 31 bytes
    let count_claude = crate::tokenizer::estimate_tokens(text_claude, "claude-3-5-sonnet");
    assert_eq!(count_claude, 10); // 31 * 0.256 + 3 = 10.936 -> 10

    let text_gpt = "Hey Cursor, this text is exactly twenty characters."; // 52 bytes
    let count_gpt = crate::tokenizer::estimate_tokens(text_gpt, "gpt-4o");
    assert_eq!(count_gpt, 15); // 52 * 0.263 + 2 = 15.676 -> 15

    let config_dir = temp_dir.path().join(".codeoba/tokenizers");
    std::fs::create_dir_all(&config_dir).unwrap();

    let simple_config = r#"{
        "version": "1.0",
        "normalizer": null,
        "pre_tokenizer": {
            "type": "Whitespace"
        },
        "post_processor": null,
        "decoder": null,
        "model": {
            "type": "WordLevel",
            "vocab": {
                "[UNK]": 0,
                "Hey": 1,
                "Cursor": 2
            },
            "unk_token": "[UNK]"
        }
    }"#;
    std::fs::write(config_dir.join("cl100k_base.json"), simple_config).unwrap();

    crate::tokenizer::clear_custom_tokenizers_cache();

    let count_custom = crate::tokenizer::estimate_tokens("Hey Cursor", "gpt-4o");
    assert_eq!(count_custom, 2);

    if let Some(h) = original_home {
        std::env::set_var("HOME", h);
    } else {
        std::env::remove_var("HOME");
    }
    if let Some(mh) = original_mock_home {
        std::env::set_var("CODEOBA_MOCK_HOME", mh);
    } else {
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }
}

#[test]
fn test_search_effectiveness() {
    // 1. Set up mock sessions in memory
    let session_db = crate::models::Session {
        id: "session-db".to_string(),
        source_id: "cursor".to_string(),
        file_path: "/path/to/cursor.vscdb".to_string(),
        timestamp: 1000,
        updated_at: 1000,
        cwd: Some("/workspace/db".to_string()),
        thread_name: Some("SQLite WAL Mode Configuration".to_string()),
        turns: vec![
            crate::models::Turn {
                turn_id: "db-1".to_string(),
                user_message: "Hey Cursor, how do we enable WAL mode on our SQLite database connections to prevent lock conflicts?".to_string(),
                assistant_message: "Understood. You can execute PRAGMA journal_mode=WAL; on the connection to enable Write-Ahead Logging. This allows multiple readers to read concurrently without database locked errors.".to_string(),
                timestamp: 1000,
                input_tokens: None,
                output_tokens: None,
                extra_data: std::collections::HashMap::new(),
            }
        ],
        is_archived: false,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("db-workspace".to_string()),
        status: None,
        is_deleted: false,
    };

    let session_tailwind = crate::models::Session {
        id: "session-tailwind".to_string(),
        source_id: "copilot".to_string(),
        file_path: "/path/to/copilot.yaml".to_string(),
        timestamp: 2000,
        updated_at: 2000,
        cwd: Some("/workspace/ui".to_string()),
        thread_name: Some("Theme Variable Styling with Tailwind".to_string()),
        turns: vec![
            crate::models::Turn {
                turn_id: "ui-1".to_string(),
                user_message: "How do we style the sidebar using CSS variables and Tailwind?".to_string(),
                assistant_message: "Define theme colors in index.css (e.g. data-theme=\"nordic-frost\") using CSS custom properties. Then reference them in tailwind.config.js to allow utility classes like bg-background and text-accent to adjust automatically.".to_string(),
                timestamp: 2000,
                input_tokens: None,
                output_tokens: None,
                extra_data: std::collections::HashMap::new(),
            }
        ],
        is_archived: false,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("ui-workspace".to_string()),
        status: None,
        is_deleted: false,
    };

    let session_ml = crate::models::Session {
        id: "session-ml".to_string(),
        source_id: "claude".to_string(),
        file_path: "/path/to/claude.jsonl".to_string(),
        timestamp: 3000,
        updated_at: 3000,
        cwd: Some("/workspace/ml".to_string()),
        thread_name: Some("Neural Net Inference Model".to_string()),
        turns: vec![
            crate::models::Turn {
                turn_id: "ml-1".to_string(),
                user_message: "What model are we using for embeddings in Codeoba?".to_string(),
                assistant_message: "We are using the all-MiniLM-L6-v2 transformer model running locally on the ONNX runtime engine to generate text embeddings.".to_string(),
                timestamp: 3000,
                input_tokens: None,
                output_tokens: None,
                extra_data: std::collections::HashMap::new(),
            }
        ],
        is_archived: false,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("ml-workspace".to_string()),
        status: None,
        is_deleted: false,
    };

    let sessions = vec![session_db, session_tailwind, session_ml];

    // 2. Lexical Search Testing
    let filter = crate::search::SearchFilter::default();

    // Query A: "WAL" should match session-db
    let results_wal = crate::search::lexical::lexical_search(&sessions, "WAL", &filter);
    assert!(
        !results_wal.is_empty(),
        "Lexical search for 'WAL' returned no results"
    );
    assert_eq!(results_wal[0].session.id, "session-db");

    // Query B: "Tailwind" should match session-tailwind
    let results_tailwind = crate::search::lexical::lexical_search(&sessions, "Tailwind", &filter);
    assert!(
        !results_tailwind.is_empty(),
        "Lexical search for 'Tailwind' returned no results"
    );
    assert_eq!(results_tailwind[0].session.id, "session-tailwind");

    // Query C: "ONNX" should match session-ml
    let results_onnx = crate::search::lexical::lexical_search(&sessions, "ONNX", &filter);
    assert!(
        !results_onnx.is_empty(),
        "Lexical search for 'ONNX' returned no results"
    );
    assert_eq!(results_onnx[0].session.id, "session-ml");

    // 3. Semantic Search Testing (using actual OnnxSemanticEmbedder conditionally)
    let (model_path, vocab_path) = crate::search::resolve_model_paths(None::<&tauri::AppHandle>);
    if model_path.exists() && vocab_path.exists() {
        let embedder = crate::search::semantic::OnnxSemanticEmbedder::new(&model_path, &vocab_path)
            .expect("Failed to initialize OnnxSemanticEmbedder");

        // Build session vector index map
        let mut embeddings = std::collections::HashMap::new();
        for session in &sessions {
            let thread_name = session.thread_name.as_deref().unwrap_or("Untitled Session");
            let thread_emb = embedder.get_embeddings(thread_name).unwrap();
            let mut turn_embeddings = Vec::new();
            for turn in &session.turns {
                let text = format!("{}\n{}", turn.user_message, turn.assistant_message);
                turn_embeddings.push(embedder.get_embeddings(&text).unwrap());
            }
            embeddings.insert(
                session.id.clone(),
                crate::search::SessionVectorIndex {
                    thread_name_embedding: thread_emb,
                    turn_embeddings,
                },
            );
        }

        // Semantic Query A: "database concurrency performance" -> should rank SQLite session first
        let query_vec_db = embedder
            .get_embeddings("database concurrency performance")
            .unwrap();
        let results_sem_db = crate::search::semantic::semantic_search(
            &sessions,
            &embeddings,
            &query_vec_db,
            0.2,
            &filter,
        );
        assert!(
            !results_sem_db.is_empty(),
            "Semantic search for 'database concurrency' returned no results"
        );
        assert_eq!(
            results_sem_db[0].session.id, "session-db",
            "Semantic query 'database concurrency performance' did not rank DB session first: {:?}",
            results_sem_db
        );

        // Semantic Query B: "button visual theme design" -> should rank Tailwind session first
        let query_vec_ui = embedder
            .get_embeddings("button visual theme design")
            .unwrap();
        let results_sem_ui = crate::search::semantic::semantic_search(
            &sessions,
            &embeddings,
            &query_vec_ui,
            0.2,
            &filter,
        );
        assert!(
            !results_sem_ui.is_empty(),
            "Semantic search for 'button visual theme' returned no results"
        );
        assert_eq!(
            results_sem_ui[0].session.id, "session-tailwind",
            "Semantic query 'button visual theme design' did not rank Tailwind session first"
        );

        // Semantic Query C: "deep learning model runtimes" -> should rank ML/Claude session first
        let query_vec_ml = embedder
            .get_embeddings("deep learning model runtimes")
            .unwrap();
        let results_sem_ml = crate::search::semantic::semantic_search(
            &sessions,
            &embeddings,
            &query_vec_ml,
            0.2,
            &filter,
        );
        assert!(
            !results_sem_ml.is_empty(),
            "Semantic search for 'deep learning model runtimes' returned no results"
        );
        assert_eq!(
            results_sem_ml[0].session.id, "session-ml",
            "Semantic query 'deep learning model runtimes' did not rank ML session first"
        );
    } else {
        println!("Skipping neural semantic search rankings validation since ONNX model files are not downloaded.");
    }
}

#[test]
fn test_title_cleanup_and_extraction() {
    // Test XML tag extraction and cleanup
    let raw_msg_1 = "<USER_SETTINGS_CHANGE>\nChanged settings\n</USER_SETTINGS_CHANGE>\n<USER_REQUEST>please configure the project indexer</USER_REQUEST>";
    let title_1 = crate::parsers::extract_title_from_first_query(raw_msg_1);
    assert_eq!(title_1, "Configure the project indexer");

    let raw_msg_2 = "i need to fix the context menu boundary checking";
    let title_2 = crate::parsers::extract_title_from_first_query(raw_msg_2);
    assert_eq!(title_2, "Fix the context menu boundary checking");

    let raw_msg_long = "how do i implement a very long query that should be truncated nicely at a word boundary to prevent sidebar layout shifts in the Codeoba client UI";
    let title_long = crate::parsers::extract_title_from_first_query(raw_msg_long);
    assert!(title_long.len() <= 55);
    assert!(title_long.ends_with("..."));

    // Test friendly slug stripping simulated
    let slug = "composed-pascal";
    let raw_title = "Goal make it easy composed pascal";
    let formatted_slug_space = slug.replace("-", " ").to_lowercase();
    let clean_title = if raw_title.to_lowercase().ends_with(&formatted_slug_space) {
        raw_title[..raw_title.len() - formatted_slug_space.len()]
            .trim()
            .to_string()
    } else {
        raw_title.to_string()
    };
    assert_eq!(clean_title, "Goal make it easy");
}

#[test]
fn test_cache_orphan_preservation() {
    tauri::async_runtime::block_on(async {
        with_mock_home(|_mock_home| async move {
            use crate::models::{Session, Turn};
            use crate::parsers::cache::get_cache_manager;

            let cache_mgr = get_cache_manager();
            let source_id = "test_preservation_source";
            cache_mgr.clear_all_caches();

            let session = Session {
                id: "preserved-session".to_string(),
                source_id: source_id.to_string(),
                file_path: "/path/to/old_file.jsonl".to_string(),
                timestamp: 1000,
                updated_at: 1000,
                cwd: None,
                thread_name: Some("Preserved Conversation".to_string()),
                turns: vec![Turn {
                    turn_id: "turn1".to_string(),
                    user_message: "Hello".to_string(),
                    assistant_message: "Hi".to_string(),
                    timestamp: 1000,
                    input_tokens: None,
                    output_tokens: None,
                    extra_data: std::collections::HashMap::new(),
                }],
                is_archived: false,
                is_pinned: false,
                summary: None,
                snippet: None,
                workspace_name: None,
                status: None,
                is_deleted: false,
            };

            // Put directly to disk cache
            cache_mgr.put_cached_session(
                source_id,
                "/path/to/old_file.jsonl",
                1000,
                100,
                "",
                session,
            );

            // Start scan (this loads from disk cache into memory cache AND initializes seen_paths as empty)
            cache_mgr.start_scan(source_id);

            // End scan (this cleans up orphans that were not seen during this scan)
            let sessions = cache_mgr.end_scan(source_id);
            assert_eq!(sessions.len(), 1);
            assert_eq!(sessions[0].id, "preserved-session");
            assert!(
                sessions[0].is_deleted,
                "Preserved orphan session should have is_deleted set to true"
            );

            // Verify it is NOT pruned since turns is not empty
            let cache_map = cache_mgr.load_cache(source_id);
            assert!(
                cache_map.contains_key("/path/to/old_file.jsonl"),
                "Session with turns was incorrectly pruned from cache"
            );
        })
        .await;
    });
}

#[test]
fn test_antigravity_variants() {
    use crate::parsers::antigravity::AntigravitySource;
    use crate::parsers::{ParserVariant, SourceAdapter};

    let standard = AntigravitySource::new(ParserVariant::Standard);
    let ide = AntigravitySource::new(ParserVariant::Ide);

    assert_eq!(standard.id(), "antigravity");
    assert_eq!(ide.id(), "antigravity_ide");

    assert_eq!(standard.display_name(), "Antigravity");
    assert_eq!(ide.display_name(), "Antigravity IDE");

    assert!(standard.get_default_log_paths()[0].contains("antigravity"));
    assert!(ide.get_default_log_paths()[0].contains("antigravity-ide"));
}

#[test]
fn test_parse_query_terms_helper() {
    use crate::search::lexical::parse_query_terms;

    let terms = parse_query_terms("Goal \"make it easy\"");
    assert_eq!(terms, vec!["Goal".to_string(), "make it easy".to_string()]);

    let terms2 = parse_query_terms("   hello    \"world wide web\"   nested ");
    assert_eq!(
        terms2,
        vec![
            "hello".to_string(),
            "world wide web".to_string(),
            "nested".to_string()
        ]
    );

    let terms3 = parse_query_terms("\"unclosed quote");
    assert_eq!(terms3, vec!["unclosed quote".to_string()]);
}

#[test]
fn test_lexical_search_multi_term_and() {
    let session_a = crate::models::Session {
        id: "session-a".to_string(),
        source_id: "cursor".to_string(),
        file_path: "/path/a".to_string(),
        timestamp: 1000,
        updated_at: 1000,
        cwd: Some("/workspace/a".to_string()),
        thread_name: Some("Goal: Make it easy".to_string()),
        turns: vec![crate::models::Turn {
            turn_id: "turn-1".to_string(),
            user_message: "How to run local index search".to_string(),
            assistant_message: "Just query it".to_string(),
            timestamp: 1000,
            input_tokens: None,
            output_tokens: None,
            extra_data: std::collections::HashMap::new(),
        }],
        is_archived: false,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("workspace-a".to_string()),
        status: None,
        is_deleted: false,
    };

    let session_b = crate::models::Session {
        id: "session-b".to_string(),
        source_id: "cursor".to_string(),
        file_path: "/path/b".to_string(),
        timestamp: 2000,
        updated_at: 2000,
        cwd: Some("/workspace/b".to_string()),
        thread_name: Some("Just random thread".to_string()),
        turns: vec![crate::models::Turn {
            turn_id: "turn-2".to_string(),
            user_message: "make it simple and clean".to_string(),
            assistant_message: "Sure thing".to_string(),
            timestamp: 2000,
            input_tokens: None,
            output_tokens: None,
            extra_data: std::collections::HashMap::new(),
        }],
        is_archived: false,
        is_pinned: false,
        summary: None,
        snippet: None,
        workspace_name: Some("workspace-b".to_string()),
        status: None,
        is_deleted: false,
    };

    let sessions = vec![session_a, session_b];
    let filter = crate::search::SearchFilter::default();

    // Query 1: "Goal" - should match session_a
    let res1 = crate::search::lexical::lexical_search(&sessions, "Goal", &filter);
    assert_eq!(res1.len(), 1);
    assert_eq!(res1[0].session.id, "session-a");

    // Query 2: "Goal simple" - should match nothing (since "Goal" is in session_a, but "simple" is in session_b)
    let res2 = crate::search::lexical::lexical_search(&sessions, "Goal simple", &filter);
    assert_eq!(res2.len(), 0);

    // Query 3: "make it" - should match both session_a ("Make it" in thread_name) and session_b ("make it" in turn-2)
    let res3 = crate::search::lexical::lexical_search(&sessions, "make it", &filter);
    assert_eq!(res3.len(), 2);

    // Query 4: "Goal \"make it\"" - should match session_a only (since only session_a has both "Goal" and "make it")
    let res4 = crate::search::lexical::lexical_search(&sessions, "Goal \"make it\"", &filter);
    assert_eq!(res4.len(), 1);
    assert_eq!(res4[0].session.id, "session-a");
}
