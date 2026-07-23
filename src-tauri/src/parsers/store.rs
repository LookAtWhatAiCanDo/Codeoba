//! SQLite persistence for the session cache.
//!
//! This replaces the previous per-source `cache_<source>.json` files. The scan lifecycle
//! (the `seen` set, scan reference counting, `is_deleted` policy, completeness gating) is
//! unchanged and still lives in [`super::cache`]; only where the bytes land moved here.
//!
//! Schema is normalized: one row per session in `sessions`, one row per turn in `turns`
//! (cascade-deleted with their session). The natural cache key is `(source_id, file_path)`;
//! `session.id` is stored as a column rather than the primary key so a hypothetical id
//! collision across sources cannot clobber a row. Turns hang off the surrogate
//! `sessions.row_id`.
//!
//! Writes are incremental: [`save_source`] rewrites a session's row and turns only when its
//! parse-cache metadata (`hash`/`size`/`last_modified`) actually changed, flips just the
//! `is_deleted` column when only that differs, and leaves untouched sessions alone. That is
//! the win over the old JSON store, which re-serialized and rewrote the entire source file
//! on every scan.

use crate::models::{Session, Turn};
use crate::parsers::cache::CacheEntry;
use rusqlite::{params, Connection};
use std::collections::HashMap;

/// Bumped only when the schema changes in a way that requires a rebuild. A fresh re-parse
/// reseeds everything, so there is no data migration to write — a mismatch just means the
/// tables are (re)created empty and the next scan repopulates them.
const SCHEMA_VERSION: i64 = 1;

/// Opens the database at `path`, applying pragmas and ensuring the schema exists.
pub fn open(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version != SCHEMA_VERSION {
        conn.execute_batch(SCHEMA)?;
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }
    Ok(conn)
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS sessions (
    row_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    id             TEXT NOT NULL,
    source_id      TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    last_modified  INTEGER NOT NULL,
    size           INTEGER NOT NULL,
    hash           TEXT NOT NULL,
    timestamp      INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    cwd            TEXT,
    thread_name    TEXT,
    is_archived    INTEGER NOT NULL DEFAULT 0,
    is_pinned      INTEGER NOT NULL DEFAULT 0,
    is_deleted     INTEGER NOT NULL DEFAULT 0,
    status         TEXT,
    workspace_name TEXT,
    snippet        TEXT,
    summary_json   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source_path ON sessions(source_id, file_path);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source_id);

CREATE TABLE IF NOT EXISTS turns (
    session_row_id    INTEGER NOT NULL REFERENCES sessions(row_id) ON DELETE CASCADE,
    turn_index        INTEGER NOT NULL,
    turn_id           TEXT NOT NULL,
    user_message      TEXT NOT NULL,
    assistant_message TEXT NOT NULL,
    timestamp         INTEGER NOT NULL,
    input_tokens      INTEGER,
    output_tokens     INTEGER,
    extra_data_json   TEXT,
    images_json       TEXT,
    PRIMARY KEY (session_row_id, turn_index)
);
"#;

/// The parse-cache metadata an entry is keyed by; a change in any of these means the
/// session's row and turns must be rewritten.
struct Meta {
    hash: String,
    size: i64,
    last_modified: i64,
    is_deleted: bool,
}

/// Loads every cached session for `source_id`, keyed by `file_path` (the shape the scan
/// lifecycle expects from the old `load_cache`).
pub fn load_source(
    conn: &Connection,
    source_id: &str,
) -> rusqlite::Result<HashMap<String, CacheEntry>> {
    let mut stmt = conn.prepare(
        "SELECT row_id, id, file_path, last_modified, size, hash, timestamp, updated_at, cwd, \
         thread_name, is_archived, is_pinned, is_deleted, status, workspace_name, snippet, \
         summary_json FROM sessions WHERE source_id = ?1",
    )?;

    let rows = stmt.query_map(params![source_id], |r| {
        let row_id: i64 = r.get(0)?;
        let summary_json: Option<String> = r.get(16)?;
        let session = Session {
            id: r.get(1)?,
            source_id: source_id.to_string(),
            file_path: r.get(2)?,
            timestamp: r.get(6)?,
            updated_at: r.get(7)?,
            cwd: r.get(8)?,
            thread_name: r.get(9)?,
            turns: Vec::new(), // filled below
            is_archived: r.get::<_, i64>(10)? != 0,
            is_pinned: r.get::<_, i64>(11)? != 0,
            summary: summary_json
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok()),
            snippet: r.get(15)?,
            workspace_name: r.get(14)?,
            status: r.get(13)?,
            is_deleted: r.get::<_, i64>(12)? != 0,
        };
        let entry = CacheEntry {
            file_path: r.get(2)?,
            last_modified: r.get(3)?,
            size: r.get(4)?,
            hash: r.get(5)?,
            session,
        };
        Ok((row_id, entry))
    })?;

    let mut by_row: HashMap<i64, CacheEntry> = HashMap::new();
    for row in rows {
        let (row_id, entry) = row?;
        by_row.insert(row_id, entry);
    }

    // Load turns for every session of this source in one pass, then attach.
    let mut turn_stmt = conn.prepare(
        "SELECT t.session_row_id, t.turn_id, t.user_message, t.assistant_message, t.timestamp, \
         t.input_tokens, t.output_tokens, t.extra_data_json, t.images_json \
         FROM turns t JOIN sessions s ON s.row_id = t.session_row_id \
         WHERE s.source_id = ?1 ORDER BY t.session_row_id, t.turn_index",
    )?;
    let turn_rows = turn_stmt.query_map(params![source_id], |r| {
        let row_id: i64 = r.get(0)?;
        let extra_json: Option<String> = r.get(7)?;
        let images_json: Option<String> = r.get(8)?;
        let turn = Turn {
            turn_id: r.get(1)?,
            user_message: r.get(2)?,
            assistant_message: r.get(3)?,
            timestamp: r.get(4)?,
            input_tokens: r.get(5)?,
            output_tokens: r.get(6)?,
            extra_data: extra_json
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default(),
            images: images_json
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok()),
        };
        Ok((row_id, turn))
    })?;
    for row in turn_rows {
        let (row_id, turn) = row?;
        if let Some(entry) = by_row.get_mut(&row_id) {
            entry.session.turns.push(turn);
        }
    }

    Ok(by_row
        .into_values()
        .map(|e| (e.file_path.clone(), e))
        .collect())
}

/// Persists the full set of entries for `source_id`, incrementally.
///
/// Sessions whose `(hash, size, last_modified)` are unchanged are not rewritten; if only
/// `is_deleted` changed, just that column is updated; new or changed sessions are fully
/// upserted (row + turns); sessions no longer present are deleted (turns cascade). All in
/// one transaction, so a crash mid-write cannot leave a source half-persisted.
pub fn save_source(
    conn: &mut Connection,
    source_id: &str,
    entries: &[CacheEntry],
) -> rusqlite::Result<()> {
    let existing = load_meta(conn, source_id)?;
    let tx = conn.transaction()?;
    {
        for entry in entries {
            match existing.get(&entry.file_path) {
                Some(meta)
                    if meta.hash == entry.hash
                        && meta.size == entry.size
                        && meta.last_modified == entry.last_modified =>
                {
                    // Unchanged content. Only the delete flag can still differ.
                    if meta.is_deleted != entry.session.is_deleted {
                        tx.execute(
                            "UPDATE sessions SET is_deleted = ?1 WHERE source_id = ?2 AND file_path = ?3",
                            params![entry.session.is_deleted as i64, source_id, entry.file_path],
                        )?;
                    }
                }
                _ => upsert_entry(&tx, source_id, entry)?,
            }
        }

        // Delete sessions this scan no longer lists. `end_scan` has already applied the
        // orphan/prune policy, so `entries` is exactly the set that should remain.
        let keep: std::collections::HashSet<&str> =
            entries.iter().map(|e| e.file_path.as_str()).collect();
        for path in existing.keys() {
            if !keep.contains(path.as_str()) {
                tx.execute(
                    "DELETE FROM sessions WHERE source_id = ?1 AND file_path = ?2",
                    params![source_id, path],
                )?;
            }
        }
    }
    tx.commit()
}

fn load_meta(conn: &Connection, source_id: &str) -> rusqlite::Result<HashMap<String, Meta>> {
    let mut stmt = conn.prepare(
        "SELECT file_path, hash, size, last_modified, is_deleted FROM sessions WHERE source_id = ?1",
    )?;
    let rows = stmt.query_map(params![source_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            Meta {
                hash: r.get(1)?,
                size: r.get(2)?,
                last_modified: r.get(3)?,
                is_deleted: r.get::<_, i64>(4)? != 0,
            },
        ))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (path, meta) = row?;
        map.insert(path, meta);
    }
    Ok(map)
}

fn upsert_entry(
    tx: &rusqlite::Transaction,
    source_id: &str,
    entry: &CacheEntry,
) -> rusqlite::Result<()> {
    let s = &entry.session;
    let summary_json = s
        .summary
        .as_ref()
        .and_then(|v| serde_json::to_string(v).ok());
    tx.execute(
        "INSERT INTO sessions (id, source_id, file_path, last_modified, size, hash, timestamp, \
         updated_at, cwd, thread_name, is_archived, is_pinned, is_deleted, status, workspace_name, \
         snippet, summary_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17) \
         ON CONFLICT(source_id, file_path) DO UPDATE SET \
         id=excluded.id, last_modified=excluded.last_modified, size=excluded.size, \
         hash=excluded.hash, timestamp=excluded.timestamp, updated_at=excluded.updated_at, \
         cwd=excluded.cwd, thread_name=excluded.thread_name, is_archived=excluded.is_archived, \
         is_pinned=excluded.is_pinned, is_deleted=excluded.is_deleted, status=excluded.status, \
         workspace_name=excluded.workspace_name, snippet=excluded.snippet, \
         summary_json=excluded.summary_json",
        params![
            s.id,
            source_id,
            entry.file_path,
            entry.last_modified,
            entry.size,
            entry.hash,
            s.timestamp,
            s.updated_at,
            s.cwd,
            s.thread_name,
            s.is_archived as i64,
            s.is_pinned as i64,
            s.is_deleted as i64,
            s.status,
            s.workspace_name,
            s.snippet,
            summary_json,
        ],
    )?;

    let row_id: i64 = tx.query_row(
        "SELECT row_id FROM sessions WHERE source_id = ?1 AND file_path = ?2",
        params![source_id, entry.file_path],
        |r| r.get(0),
    )?;

    // Replace the turn set wholesale — a session's turns are only rewritten when its
    // content actually changed, so this runs rarely.
    tx.execute(
        "DELETE FROM turns WHERE session_row_id = ?1",
        params![row_id],
    )?;
    let mut turn_stmt = tx.prepare(
        "INSERT INTO turns (session_row_id, turn_index, turn_id, user_message, assistant_message, \
         timestamp, input_tokens, output_tokens, extra_data_json, images_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )?;
    for (idx, turn) in s.turns.iter().enumerate() {
        let extra_json = if turn.extra_data.is_empty() {
            None
        } else {
            serde_json::to_string(&turn.extra_data).ok()
        };
        let images_json = turn
            .images
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());
        turn_stmt.execute(params![
            row_id,
            idx as i64,
            turn.turn_id,
            turn.user_message,
            turn.assistant_message,
            turn.timestamp,
            turn.input_tokens,
            turn.output_tokens,
            extra_json,
            images_json,
        ])?;
    }
    Ok(())
}

/// Number of sessions stored (all sources).
pub fn count_sessions(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT count(*) FROM sessions", [], |r| r.get(0))
}

/// Streams every stored session (with its turns) through `f`, one at a time, holding only
/// one batch in memory at a time.
///
/// This is what lets search and listing run without loading the whole corpus into RAM:
/// callers score/collect each session and drop it. Pagination is keyset (`row_id > last`),
/// so it stays O(n) rather than degrading like `OFFSET`. Turns for a page are fetched by the
/// same `row_id` range that bounds the page, avoiding a per-session query.
pub fn for_each_session(
    conn: &Connection,
    batch_size: i64,
    mut f: impl FnMut(Session),
) -> rusqlite::Result<()> {
    let mut session_stmt = conn.prepare(
        "SELECT row_id, id, source_id, file_path, timestamp, updated_at, cwd, thread_name, \
         is_archived, is_pinned, is_deleted, status, workspace_name, snippet, summary_json \
         FROM sessions WHERE row_id > ?1 ORDER BY row_id LIMIT ?2",
    )?;
    let mut turn_stmt = conn.prepare(
        "SELECT session_row_id, turn_id, user_message, assistant_message, timestamp, \
         input_tokens, output_tokens, extra_data_json, images_json FROM turns \
         WHERE session_row_id > ?1 AND session_row_id <= ?2 ORDER BY session_row_id, turn_index",
    )?;

    let mut prev: i64 = 0;
    loop {
        let mut page: Vec<(i64, Session)> = Vec::new();
        let rows = session_stmt.query_map(params![prev, batch_size], |r| {
            let row_id: i64 = r.get(0)?;
            let summary_json: Option<String> = r.get(14)?;
            let session = Session {
                id: r.get(1)?,
                source_id: r.get(2)?,
                file_path: r.get(3)?,
                timestamp: r.get(4)?,
                updated_at: r.get(5)?,
                cwd: r.get(6)?,
                thread_name: r.get(7)?,
                turns: Vec::new(),
                is_archived: r.get::<_, i64>(8)? != 0,
                is_pinned: r.get::<_, i64>(9)? != 0,
                summary: summary_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok()),
                snippet: r.get(13)?,
                workspace_name: r.get(12)?,
                status: r.get(11)?,
                is_deleted: r.get::<_, i64>(10)? != 0,
            };
            Ok((row_id, session))
        })?;
        for row in rows {
            page.push(row?);
        }
        if page.is_empty() {
            break;
        }
        let page_len = page.len() as i64;
        let new_prev = page.last().map(|(id, _)| *id).unwrap_or(prev);

        // All of this page's turns live in (prev, new_prev]; fetch them in one query and
        // attach by row_id.
        let mut turns_by_row: HashMap<i64, Vec<Turn>> = HashMap::new();
        let turn_rows = turn_stmt.query_map(params![prev, new_prev], |r| {
            let row_id: i64 = r.get(0)?;
            let extra_json: Option<String> = r.get(7)?;
            let images_json: Option<String> = r.get(8)?;
            let turn = Turn {
                turn_id: r.get(1)?,
                user_message: r.get(2)?,
                assistant_message: r.get(3)?,
                timestamp: r.get(4)?,
                input_tokens: r.get(5)?,
                output_tokens: r.get(6)?,
                extra_data: extra_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default(),
                images: images_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok()),
            };
            Ok((row_id, turn))
        })?;
        for row in turn_rows {
            let (row_id, turn) = row?;
            turns_by_row.entry(row_id).or_default().push(turn);
        }

        for (row_id, mut session) in page {
            if let Some(turns) = turns_by_row.remove(&row_id) {
                session.turns = turns;
            }
            f(session);
        }

        prev = new_prev;
        if page_len < batch_size {
            break;
        }
    }
    Ok(())
}

/// Removes every cached session (and, by cascade, every turn). Used by the "reload,
/// bypassing cache" path.
pub fn clear_all(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("DELETE FROM turns; DELETE FROM sessions;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ImageReference, SessionSummary, Turn};

    fn conn() -> Connection {
        // An in-memory DB is enough to exercise the schema and (de)serialization.
        let c = Connection::open_in_memory().unwrap();
        c.pragma_update(None, "foreign_keys", "ON").unwrap();
        c.execute_batch(SCHEMA).unwrap();
        c
    }

    fn full_entry() -> CacheEntry {
        let mut extra = HashMap::new();
        extra.insert("model".to_string(), "opus".to_string());
        extra.insert("isCompaction".to_string(), "true".to_string());
        CacheEntry {
            file_path: "/home/a.jsonl".to_string(),
            last_modified: 111,
            size: 222,
            hash: "abc".to_string(),
            session: Session {
                id: "s1".to_string(),
                source_id: "codex".to_string(),
                file_path: "/home/a.jsonl".to_string(),
                timestamp: 10,
                updated_at: 20,
                cwd: Some("/work".to_string()),
                thread_name: Some("Thread".to_string()),
                turns: vec![
                    Turn {
                        turn_id: "t0".to_string(),
                        user_message: "u0".to_string(),
                        assistant_message: "a0".to_string(),
                        timestamp: 1,
                        input_tokens: Some(5),
                        output_tokens: Some(7),
                        extra_data: extra,
                        images: Some(vec![ImageReference {
                            id: "img1".to_string(),
                            path: Some("/img.png".to_string()),
                            base64: None,
                            media_type: Some("image/png".to_string()),
                        }]),
                    },
                    Turn {
                        turn_id: "t1".to_string(),
                        user_message: "u1".to_string(),
                        assistant_message: String::new(),
                        timestamp: 2,
                        input_tokens: None,
                        output_tokens: None,
                        extra_data: HashMap::new(),
                        images: None,
                    },
                ],
                is_archived: true,
                is_pinned: false,
                summary: Some(SessionSummary {
                    key_actions: vec!["did a thing".to_string()],
                    errors: vec![],
                    performance_charts: vec![],
                }),
                snippet: Some("snip".to_string()),
                workspace_name: Some("ws".to_string()),
                status: Some("idle".to_string()),
                is_deleted: false,
            },
        }
    }

    /// Every field of a session and its turns must survive a save -> load round trip,
    /// including the JSON-encoded ones (summary, per-turn extra_data, images).
    #[test]
    fn round_trips_all_session_and_turn_fields() {
        let mut c = conn();
        let entry = full_entry();
        save_source(&mut c, "codex", std::slice::from_ref(&entry)).unwrap();

        let loaded = load_source(&c, "codex").unwrap();
        assert_eq!(loaded.len(), 1);
        let got = &loaded["/home/a.jsonl"];
        assert_eq!(got.hash, entry.hash);
        assert_eq!(got.size, entry.size);
        assert_eq!(got.last_modified, entry.last_modified);
        // PartialEq on Session compares every field, including the full turn vec.
        assert_eq!(got.session, entry.session);
    }

    /// An unchanged session is not rewritten, a changed one is, a removed one is deleted,
    /// and an is_deleted-only change is applied — the incremental contract.
    #[test]
    fn save_is_incremental() {
        let mut c = conn();
        let a = full_entry();
        let mut b = full_entry();
        b.file_path = "/home/b.jsonl".to_string();
        b.session.id = "s2".to_string();
        b.session.file_path = "/home/b.jsonl".to_string();
        save_source(&mut c, "codex", &[a.clone(), b.clone()]).unwrap();

        // Flip only is_deleted on `a`, drop `b` entirely.
        let mut a_del = a.clone();
        a_del.session.is_deleted = true;
        save_source(&mut c, "codex", &[a_del]).unwrap();

        let loaded = load_source(&c, "codex").unwrap();
        assert_eq!(loaded.len(), 1, "the dropped session is deleted");
        assert!(
            loaded["/home/a.jsonl"].session.is_deleted,
            "the is_deleted flip is persisted"
        );
        assert!(!loaded.contains_key("/home/b.jsonl"));
    }
}
