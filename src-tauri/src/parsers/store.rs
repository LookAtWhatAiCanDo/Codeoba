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
//! Writes are incremental: [`save_source`] always syncs a session's cheap metadata row but
//! rewrites its turns — the bulk — only when the parse-cache metadata
//! (`hash`/`size`/`last_modified`) actually changed. That is the win over the old JSON store,
//! which re-serialized and rewrote the entire source file on every scan.

use crate::models::{Session, Turn};
use crate::parsers::cache::CacheEntry;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

/// Bumped only when the schema changes in a way that requires a rebuild. A fresh re-parse
/// reseeds everything, so there is no data migration to write — a mismatch just means the
/// tables are (re)created empty and the next scan repopulates them.
/// v2: Claude titles now come from the transcript's `custom-title` lines. Existing rows
/// were cached from an unchanged file, so without a rebuild they would keep their derived
/// title forever — the cache is keyed on mtime/size and those files never change again.
const SCHEMA_VERSION: i64 = 2;

/// How long `open` is willing to wait out another connection's write lock, both via SQLite's
/// own busy handler and via the hand-rolled retry on the WAL conversion below.
const BUSY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// Whether an error is SQLite telling us another connection holds the lock — i.e. retrying
/// later is the correct response, as opposed to a real failure.
fn is_busy(e: &rusqlite::Error) -> bool {
    matches!(
        e,
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::DatabaseBusy
                || err.code == rusqlite::ErrorCode::DatabaseLocked
    )
}

/// Opens the database at `path`, applying pragmas and ensuring the schema exists.
pub fn open(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    // WAL lets readers run alongside a writer, but still permits only ONE writer at a time,
    // and sources are reindexed on independent tasks (`spawn_reindex_source`), so two
    // sources finishing a scan together do contend. Without a busy timeout the loser gets
    // SQLITE_BUSY immediately, `save_cache` logs it and drops the entire scan result — a
    // whole source silently fails to persist and reappears only after the next successful
    // scan. Wait instead; the writes are short.
    //
    // Installed before any other statement so that everything below — the schema rebuild in
    // particular — is covered by it.
    conn.busy_timeout(BUSY_TIMEOUT)?;

    // Converting a rollback-journal database to WAL needs exclusive access, and SQLite does
    // NOT run the busy handler for this pragma: a connection arriving while another holds a
    // write lock gets SQLITE_BUSY back immediately, however long the busy timeout is. So the
    // wait has to be hand-rolled. (Only the *conversion* is exposed. Once the store is WAL
    // the pragma is a no-op and returns Ok even against a live writer, which is why this only
    // ever bites on a freshly created store — exactly the case in tests, where every temp
    // home starts with no database at all.)
    //
    // Failing here is not cosmetic: `open_db` reports it as `None`, and callers turn that
    // into a whole source's scan silently not persisting.
    let deadline = std::time::Instant::now() + BUSY_TIMEOUT;
    loop {
        match conn.pragma_update(None, "journal_mode", "WAL") {
            Ok(()) => break,
            Err(e) if is_busy(&e) && std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Err(e) => return Err(e),
        }
    }

    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version != SCHEMA_VERSION {
        // Drop before recreating. `SCHEMA` is entirely `CREATE TABLE IF NOT EXISTS`, so on a
        // version bump against an EXISTING database it would be a silent no-op: the old
        // tables survive with the old columns, yet `user_version` is stamped to the new
        // value — which also makes the breakage self-concealing, because the next open sees
        // a matching version and never retries. Dropping first is what makes the "recreated
        // empty, next scan repopulates" contract above actually true.
        //
        // Nothing durable is lost: sessions/turns are wholly derived from the source
        // transcripts, `is_pinned` lives in config.json, and `is_archived` is re-parsed.
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;\
             DROP TABLE IF EXISTS turns;\
             DROP TABLE IF EXISTS sessions;\
             PRAGMA foreign_keys=ON;",
        )?;
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

/// Deserializes a JSON blob column, logging instead of silently discarding a parse failure.
///
/// These columns (`summary_json`, `extra_data_json`, `images_json`) were read with a bare
/// `.ok()`, which collapses two very different states into `None`: the column was NULL, or
/// the column held damaged JSON. The second is data loss — `extra_data` carries `model`,
/// `computeTimeMs` and `isCompaction`, so a truncated blob silently blanks a session's model
/// and quietly under-counts the dashboard aggregates — and nothing anywhere said so.
///
/// Behavior is unchanged (still `None` on failure): the values are all regenerable by
/// re-parsing the source transcript, so failing loudly would be worse than degrading. This
/// only makes the degradation observable.
///
/// The blob itself is never logged: it holds transcript content, and this app is local-first
/// precisely so that content stays out of places like log files. The column name plus serde's
/// own line/column position is enough to identify the row and the damage.
fn parse_json_column<T: serde::de::DeserializeOwned>(raw: &str, _column: &str) -> Option<T> {
    match serde_json::from_str(raw) {
        Ok(value) => Some(value),
        Err(_e) => {
            crate::log_debug!(
                "[store] Ignoring malformed {} ({} bytes): {}",
                _column,
                raw.len(),
                _e
            );
            None
        }
    }
}

/// The parse-cache metadata an entry is keyed by; a change in any of these means the
/// session's turns must be rewritten (the row's metadata is always synced regardless).
struct Meta {
    hash: String,
    size: i64,
    last_modified: i64,
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
                .and_then(|s| parse_json_column(s, "summary_json")),
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
                .and_then(|s| parse_json_column(s, "extra_data_json"))
                .unwrap_or_default(),
            images: images_json
                .as_deref()
                .and_then(|s| parse_json_column(s, "images_json")),
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
/// Every session's metadata row is upserted (cheap, and required because derived fields such
/// as the antigravity title can change without the content hash changing); its turns — the
/// bulk — are rewritten only when `(hash, size, last_modified)` changed. Sessions no longer
/// present are deleted (turns cascade). All in one transaction, so a crash mid-write cannot
/// leave a source half-persisted.
pub fn save_source(
    conn: &mut Connection,
    source_id: &str,
    entries: &[CacheEntry],
) -> rusqlite::Result<()> {
    let existing = load_meta(conn, source_id)?;
    let tx = conn.transaction()?;
    {
        for entry in entries {
            let content_changed = match existing.get(&entry.file_path) {
                Some(meta) => {
                    meta.hash != entry.hash
                        || meta.size != entry.size
                        || meta.last_modified != entry.last_modified
                }
                None => true,
            };
            // Always sync the session row's metadata columns: fields derived from a
            // separate file — the antigravity title (from a summaries .pb), archival
            // annotations, status — can change without the content hash changing, and the
            // store is authoritative for reads. Only the turns (the bulk) are gated on a
            // real content change, which preserves the incremental-write win.
            upsert_entry(&tx, source_id, entry, content_changed)?;
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
        "SELECT file_path, hash, size, last_modified FROM sessions WHERE source_id = ?1",
    )?;
    let rows = stmt.query_map(params![source_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            Meta {
                hash: r.get(1)?,
                size: r.get(2)?,
                last_modified: r.get(3)?,
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

/// Upserts a session's row (always) and, when `rewrite_turns`, replaces its turns. Turns are
/// the bulk, so they are rewritten only on a genuine content change; the row's metadata is
/// always kept current.
fn upsert_entry(
    tx: &rusqlite::Transaction,
    source_id: &str,
    entry: &CacheEntry,
    rewrite_turns: bool,
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

    if !rewrite_turns {
        return Ok(());
    }

    // Replace the turn set wholesale — only reached on a genuine content change.
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
/// Like [`for_each_session`], but does not read the message text of turns that nobody will
/// look at.
///
/// The list payload (`Session::to_lightweight`) strips every turn's text before it crosses
/// the IPC boundary, yet the read still pulled all of it off disk first — megabytes of
/// transcript loaded solely to be discarded on the next line. That defeated at the storage
/// layer what the slim DTO won at the transport layer.
///
/// The *last* turn's text is still loaded, because it is not actually discarded: it is what
/// `to_lightweight` derives the sidebar snippet from when `snippet` is NULL (which it is for
/// every real session), and what `resolve_session_status` inspects to decide whether the
/// final turn was answered. Everything earlier comes back with empty message strings and
/// full structure (timestamps, token counts, `extra_data`), which is all the frontend sorts
/// on.
///
/// Use [`for_each_session`] when the text genuinely matters — search does.
pub fn for_each_session_list_payload(
    conn: &Connection,
    batch_size: i64,
    mut f: impl FnMut(Session),
) -> rusqlite::Result<()> {
    let mut session_stmt = conn.prepare(
        "SELECT row_id, id, source_id, file_path, timestamp, updated_at, cwd, thread_name, \
         is_archived, is_pinned, is_deleted, status, workspace_name, snippet, summary_json \
         FROM sessions WHERE row_id > ?1 ORDER BY row_id LIMIT ?2",
    )?;
    // Deliberately omits user_message/assistant_message — that is the whole point.
    let mut turn_stmt = conn.prepare(
        "SELECT session_row_id, turn_id, timestamp, input_tokens, output_tokens, \
         extra_data_json FROM turns \
         WHERE session_row_id > ?1 AND session_row_id <= ?2 ORDER BY session_row_id, turn_index",
    )?;
    // One row per session: the text of its final turn.
    let mut last_text_stmt = conn.prepare(
        "SELECT t.session_row_id, t.user_message, t.assistant_message FROM turns t \
         JOIN (SELECT session_row_id, MAX(turn_index) AS mx FROM turns \
               WHERE session_row_id > ?1 AND session_row_id <= ?2 GROUP BY session_row_id) m \
           ON m.session_row_id = t.session_row_id AND m.mx = t.turn_index",
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
                    .and_then(|s| parse_json_column(s, "summary_json")),
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

        let mut turns_by_row: HashMap<i64, Vec<Turn>> = HashMap::new();
        let turn_rows = turn_stmt.query_map(params![prev, new_prev], |r| {
            let row_id: i64 = r.get(0)?;
            let extra_json: Option<String> = r.get(5)?;
            let turn = Turn {
                turn_id: r.get(1)?,
                user_message: String::new(),
                assistant_message: String::new(),
                timestamp: r.get(2)?,
                input_tokens: r.get(3)?,
                output_tokens: r.get(4)?,
                extra_data: extra_json
                    .as_deref()
                    .and_then(|s| parse_json_column(s, "extra_data_json"))
                    .unwrap_or_default(),
                images: None,
            };
            Ok((row_id, turn))
        })?;
        for row in turn_rows {
            let (row_id, turn) = row?;
            turns_by_row.entry(row_id).or_default().push(turn);
        }

        // Refill the final turn's text so snippet/status derivation still works.
        let last_rows = last_text_stmt.query_map(params![prev, new_prev], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?;
        for row in last_rows {
            let (row_id, user_message, assistant_message) = row?;
            if let Some(last) = turns_by_row.get_mut(&row_id).and_then(|v| v.last_mut()) {
                last.user_message = user_message;
                last.assistant_message = assistant_message;
            }
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
                    .and_then(|s| parse_json_column(s, "summary_json")),
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
                    .and_then(|s| parse_json_column(s, "extra_data_json"))
                    .unwrap_or_default(),
                images: images_json
                    .as_deref()
                    .and_then(|s| parse_json_column(s, "images_json")),
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

/// Loads one full session (with turns) by its natural key. Used by the detail pane, which
/// needs the complete session regardless of source type (a direct store read works for
/// DB-backed sources whose `file_path` is not a real file).
pub fn get_session_by_path(
    conn: &Connection,
    source_id: &str,
    file_path: &str,
) -> rusqlite::Result<Option<Session>> {
    let row: Option<(i64, Session)> = conn
        .query_row(
            "SELECT row_id, id, timestamp, updated_at, cwd, thread_name, is_archived, \
             is_pinned, is_deleted, status, workspace_name, snippet, summary_json \
             FROM sessions WHERE source_id = ?1 AND file_path = ?2",
            params![source_id, file_path],
            |r| {
                let summary_json: Option<String> = r.get(12)?;
                Ok((
                    r.get::<_, i64>(0)?,
                    Session {
                        id: r.get(1)?,
                        source_id: source_id.to_string(),
                        file_path: file_path.to_string(),
                        timestamp: r.get(2)?,
                        updated_at: r.get(3)?,
                        cwd: r.get(4)?,
                        thread_name: r.get(5)?,
                        turns: Vec::new(),
                        is_archived: r.get::<_, i64>(6)? != 0,
                        is_pinned: r.get::<_, i64>(7)? != 0,
                        summary: summary_json
                            .as_deref()
                            .and_then(|s| parse_json_column(s, "summary_json")),
                        snippet: r.get(11)?,
                        workspace_name: r.get(10)?,
                        status: r.get(9)?,
                        is_deleted: r.get::<_, i64>(8)? != 0,
                    },
                ))
            },
        )
        .optional()?;

    let (row_id, mut session) = match row {
        Some(v) => v,
        None => return Ok(None),
    };

    let mut turn_stmt = conn.prepare(
        "SELECT turn_id, user_message, assistant_message, timestamp, input_tokens, \
         output_tokens, extra_data_json, images_json FROM turns \
         WHERE session_row_id = ?1 ORDER BY turn_index",
    )?;
    let turns = turn_stmt.query_map(params![row_id], |r| {
        let extra_json: Option<String> = r.get(6)?;
        let images_json: Option<String> = r.get(7)?;
        Ok(Turn {
            turn_id: r.get(0)?,
            user_message: r.get(1)?,
            assistant_message: r.get(2)?,
            timestamp: r.get(3)?,
            input_tokens: r.get(4)?,
            output_tokens: r.get(5)?,
            extra_data: extra_json
                .as_deref()
                .and_then(|s| parse_json_column(s, "extra_data_json"))
                .unwrap_or_default(),
            images: images_json
                .as_deref()
                .and_then(|s| parse_json_column(s, "images_json")),
        })
    })?;
    for turn in turns {
        session.turns.push(turn?);
    }
    Ok(Some(session))
}

/// The minimal per-session fingerprint the sidebar cares about, used to decide — by
/// diffing a source's state before and after a scan — which live events to emit. Equality
/// means "nothing worth a `session-updated` changed": `hash` captures any content change
/// (it is the file/content hash), `is_deleted` captures a soft delete, `is_archived`
/// captures an archival toggle. Status is excluded (it drifts on its own and rides the
/// separate status heartbeat); pins are frontend-only.
#[derive(PartialEq, Clone, Debug)]
pub struct SessionState {
    pub hash: String,
    pub is_deleted: bool,
    pub is_archived: bool,
    /// Part of the fingerprint because a title can change with the transcript untouched:
    /// Antigravity reads it from a separate summaries `.pb`, and `post_process_session`
    /// derives one for a placeholder. [`save_source`] therefore always syncs the metadata
    /// row even when `hash` is unchanged — but the watcher diffs *this* struct to decide
    /// what to emit, so leaving the title out meant the store was updated and no
    /// `session-updated` ever fired, stranding a stale title in the sidebar until the next
    /// full refresh.
    pub thread_name: Option<String>,
}

/// Every session of `source_id` as an id -> fingerprint map. Cheap (no turns).
pub fn session_states(
    conn: &Connection,
    source_id: &str,
) -> rusqlite::Result<HashMap<String, SessionState>> {
    let mut stmt = conn.prepare(
        "SELECT id, hash, is_deleted, is_archived, thread_name FROM sessions WHERE source_id = ?1",
    )?;
    let rows = stmt.query_map(params![source_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            SessionState {
                hash: r.get(1)?,
                is_deleted: r.get::<_, i64>(2)? != 0,
                is_archived: r.get::<_, i64>(3)? != 0,
                thread_name: r.get(4)?,
            },
        ))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (id, state) = row?;
        map.insert(id, state);
    }
    Ok(map)
}

/// Whether the source has any stored sessions (used by the watcher to decide if a missing
/// directory is worth reacting to).
pub fn source_has_sessions(conn: &Connection, source_id: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE source_id = ?1)",
        params![source_id],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n != 0)
}

/// Hard-removes the given session ids (turns cascade). Used only for positive-identification
/// removals — subagents that must not be indexed — not absence-based deletion.
pub fn delete_sessions(
    conn: &mut Connection,
    source_id: &str,
    ids: &[String],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for id in ids {
        // Scoped by source_id on purpose: `id` is deliberately NOT the primary key (see the
        // module docs) so that an id collision across sources cannot clobber a row. Deleting
        // on a bare `id` would reintroduce exactly the collision the schema defends against.
        tx.execute(
            "DELETE FROM sessions WHERE source_id = ?1 AND id = ?2",
            params![source_id, id],
        )?;
    }
    tx.commit()
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

    /// `open` must wait out a concurrent writer, not fail.
    ///
    /// A second connection arriving while the first held a write lock on a not-yet-converted
    /// store used to get SQLITE_BUSY from `journal_mode=WAL` — which `open_db` reports as
    /// `None`, which `save_cache` turns into a whole source's scan silently failing to
    /// persist (and which surfaced as an intermittent `unwrap` panic on a locked store in the
    /// watcher tests, where every temp home starts with no database).
    ///
    /// Note that the busy *timeout* is not what makes this pass: SQLite does not run the busy
    /// handler for a journal-mode conversion, so the retry loop is load-bearing. Keep the
    /// blocker below in rollback-journal mode — against an already-WAL store the pragma is a
    /// no-op that succeeds even with a writer live, and the test would pass vacuously.
    #[test]
    fn open_waits_for_a_concurrent_writer_instead_of_failing_busy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sessions.db");

        // A plain (rollback-journal) connection holding a write lock. The delete -> WAL
        // transition is what needs exclusive access, so this reproduces the first open
        // against a store another process just created.
        let blocker = Connection::open(&path).unwrap();
        blocker
            .execute_batch("CREATE TABLE t (x); BEGIN IMMEDIATE; INSERT INTO t VALUES (1);")
            .unwrap();

        let (tx, rx) = std::sync::mpsc::channel();
        let releaser = std::thread::spawn(move || {
            // Long enough that an un-waiting `open` cannot finish first by luck, short
            // enough to stay well inside the 5s timeout.
            std::thread::sleep(std::time::Duration::from_millis(300));
            blocker.execute_batch("COMMIT").unwrap();
            let _ = tx.send(());
        });

        let opened = open(&path);
        assert!(
            opened.is_ok(),
            "open must block on the writer and succeed, got {:?}",
            opened.err()
        );
        assert!(
            rx.try_recv().is_ok(),
            "open returned before the writer released the lock, so it never contended \
             for it — the test no longer proves anything"
        );
        releaser.join().unwrap();
    }

    /// The list-payload read must be indistinguishable from the full read once the payload
    /// is actually built.
    ///
    /// `for_each_session_list_payload` skips the message text of every turn but the last, so
    /// the only thing keeping it honest is that `to_lightweight` strips that text anyway.
    /// Asserting on the post-`to_lightweight` values (not the raw rows) is the point: it
    /// pins the *observable* result, so if `to_lightweight` ever starts consuming text this
    /// optimization silently dropped, this test fails instead of the sidebar quietly losing
    /// its snippets.
    #[test]
    fn list_payload_read_matches_the_full_read_after_to_lightweight() {
        let mut c = conn();
        let mut entry = full_entry();
        entry.session.snippet = None; // real sessions store NULL; snippet is derived
        save_source(&mut c, "codex", std::slice::from_ref(&entry)).unwrap();

        let mut full = Vec::new();
        for_each_session(&c, 2, |s| full.push(s.to_lightweight())).unwrap();
        let mut light = Vec::new();
        for_each_session_list_payload(&c, 2, |s| light.push(s.to_lightweight())).unwrap();

        assert_eq!(full, light, "list payload diverged from the full read");
        // Guard the specific thing the optimization risks: the derived snippet.
        assert!(
            light[0].snippet.as_deref().is_some_and(|s| !s.is_empty()),
            "snippet must still be derived from the last turn"
        );
    }

    /// A title-only change must be visible in the fingerprint the watcher diffs.
    ///
    /// `reindex_source_and_emit` decides whether to emit `session-updated` purely by
    /// comparing `session_states` before and after a scan. A title can change with the
    /// transcript byte-identical (Antigravity keeps it in a separate summaries `.pb`, and
    /// `post_process_session` derives one to replace a placeholder), so `save_source`
    /// deliberately syncs the metadata row even when `hash` is unchanged. If the title were
    /// left out of `SessionState`, that write would produce an identical fingerprint, no
    /// event would fire, and the sidebar would keep showing the old title until a full
    /// refresh.
    #[test]
    fn session_states_fingerprint_changes_when_only_the_title_does() {
        let mut c = conn();
        let mut entry = full_entry();
        entry.session.thread_name = Some("Claude Session".to_string());
        save_source(&mut c, "codex", std::slice::from_ref(&entry)).unwrap();
        let before = session_states(&c, "codex").unwrap();

        // Same hash/size/last_modified: only the resolved title differs.
        entry.session.thread_name = Some("Refactor the session store".to_string());
        save_source(&mut c, "codex", std::slice::from_ref(&entry)).unwrap();
        let after = session_states(&c, "codex").unwrap();

        assert_ne!(
            before.get("s1"),
            after.get("s1"),
            "a title-only change must alter the fingerprint, or no session-updated is emitted"
        );
        assert_eq!(
            after.get("s1").unwrap().thread_name.as_deref(),
            Some("Refactor the session store")
        );
    }

    /// `id` is deliberately not unique across sources, so a hard delete must be scoped.
    #[test]
    fn delete_sessions_only_touches_the_named_source() {
        let mut c = conn();
        let mut a = full_entry();
        a.session.source_id = "codex".to_string();
        let mut b = full_entry();
        b.session.source_id = "claude".to_string();
        b.file_path = "/home/b.jsonl".to_string();
        b.session.file_path = "/home/b.jsonl".to_string();
        // Same session id in two different sources.
        save_source(&mut c, "codex", std::slice::from_ref(&a)).unwrap();
        save_source(&mut c, "claude", std::slice::from_ref(&b)).unwrap();

        delete_sessions(&mut c, "codex", &["s1".to_string()]).unwrap();

        assert!(
            session_states(&c, "codex").unwrap().is_empty(),
            "the targeted source's session should be gone"
        );
        assert!(
            session_states(&c, "claude").unwrap().contains_key("s1"),
            "a colliding id in another source must survive"
        );
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
