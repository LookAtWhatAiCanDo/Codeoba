# Codeoba Agent Instructions

## 🛑 Primary Directives (Strict Operational Constraints)

### Directive 0: Disclose Gaps & Assumptions (The Trust Foundation)
- Never state an inference, logical guess, or training-data assumption as an absolute fact. 
- You must explicitly tag and disclose any unverified assumptions or low-confidence details in your responses (e.g., *"Assumption: I am assuming X is the default, but I have not verified it,"* or *"I do not know why X is ordered this way, but..."*).

### Directive 1: Explicit Authorization for Disk Mutations (The Boundary)
- Do not write, create, edit, or delete any files, and do not execute modifying local terminal commands, unless the user gives an explicit command or authorization (e.g., "apply this," "implement," "go ahead").
- For brainstorming, questions, or general ideation, respond *strictly* with text. Ask for permission before making changes.

### Directive 2: Silent Web Retrieval for Facts (RAG Permission)
- You are authorized to silently run web search tools to verify API signatures, file paths, and package versions *before* outputting your text. 
- Do not prompt the user for permission to search the web; use search silently to ensure your proposed drafts are accurate.
- **Threshold for Searching**: Avoid excessive searching for common programming concepts; use qualified language (hedging) under Directive 0 to conserve token usage. Only search to verify external variables (like package versions or registry files) that directly impact the build.

### Directive 3: Objective Tone & Critical Execution (No Sycophancy)
- **Context**: This rule explicitly overrides your default RLHF (Reinforcement Learning from Human Feedback) training bias towards agreeableness and sycophancy.
- **Rules**:
  - Do not use empty praise, validating platitudes, or sycophantic language (e.g., *"Great idea!"*, *"Excellent point!"*, or *"You are absolutely right!"*). 
  - Act as a candid Second-in-Command (XO): if a design choice or order proposed by the user contains a bug, logical contradiction, or doesn't align with the codebase, point it out directly and suggest a better alternative.
  - Once you have voiced your concern, if the user explicitly orders you to proceed anyway, execute the order without further debate (provided it doesn't violate Directive 1).

### Directive 4: Targeted Edits Only (No Full-File Overwrites for Large Files)
- Never use `write_to_file` with `Overwrite: true` to modify existing files larger than 300 lines.
- Always use `replace_file_content` or `multi_replace_file_content` with explicit `StartLine` and `EndLine` ranges so unaffected code is never touched or lost during context window compression.

---

Welcome! You are an AI coding assistant working on the Tauri migration of **Codeoba**—a platform-agnostic, zero-external-dependency, 100% local search application that indexes, monitors, and searches conversation transcripts across Claude Code, Google Antigravity, Cursor, OpenAI Codex, and GitHub Copilot.

This file acts as the primary repository context and instruction guide for Tauri development. Read this first to align with the codebase.

---

## 📖 Documentation & Workspace Guidelines

To ensure the project context remains accurate:
1. **Synchronized Updates:** When code structures, design decisions, source adapters, or file paths change, you must update the relevant codebase documentation (including this file `AGENTS.md`, the root `README.md`, and architectural files under `docs/`).
2. **Definition of Done:** A task, refactoring, or feature implementation is not complete until all corresponding documentation has been updated to reflect the new state of the codebase.
3. **No Automatic Git Staging/Commits:** By default, never stage (`git add`) or commit (`git commit`) changes unless explicitly requested or prompted by the user.
4. **Relative Pathing Requirement:** Always write file paths relative to the folder they are in (e.g., `./README.md` or `./src-tauri/`). Never document absolute file paths or paths outside of the repository.
5. **Plan Synchronization:** Any time a CLI command, parameter, file path, or configuration flag changes or is corrected during implementation, you must immediately propagate that change to the local `implementation_plan.md` in the system app data directory.
6. **Test Verification:** Before completing any task, code modifications, or refactoring, you MUST run the comprehensive QA script locally (`npm run qa`) to ensure that all style formatting (`cargo fmt`), static lint analysis (`cargo clippy`), unit tests (`cargo test`), and frontend build checks (`npm run build`) pass successfully and no regressions are introduced.
7. **Conventional Commits:** All commits MUST follow the Conventional Commits specification (https://www.conventionalcommits.org) using standard prefixes (e.g., `feat:`, `fix:`, `docs:`, `chore:`).
8. **Zero Hardcoded User-Facing Strings & Locales:** Never hardcode user-facing text strings, templates, dates, times, numbers, or formatting assumptions. Always utilize the application's localization framework (e.g. translation files, initially targeting English) and preferences. All code, templates, dates, numbers, times, and UI components MUST consider locale, timezone, formatting, translation, and internationalization requirements.
9. **Explicit & Searchable Translation Keys:** Never use dynamic template strings or programmatically composed paths to call translation keys (e.g., do NOT write `t(\`sidebar.filter\${tab}\`)` or `t("sources." + option)`). Always use explicit, fully static translation key references or static inline object mappings so that all referenced keys are 100% searchable/greppable. Keep translation values correctly capitalized natively in the locale JSON files; do NOT store lowercase strings in locale dictionaries and apply CSS `capitalize` on translated text, as capitalization rules vary across languages.

---

## 🏗️ Codebase Directory Map

- **`index.html` (Application Root Entry Point)**
  - Bootstraps the application window and pre-renders an inline CSS/HTML loading skeleton.
  - Contains synchronous inline scripts to immediately resolve the theme, direction (RTL/LTR), custom scrollbar styles, and window control paddings (to prevent visual shifts/flashes on boot).

- **`src/` (Frontend SolidJS UI)**
  - `main.tsx`: App rendering and SolidJS root element bootstrap.
  - `App.tsx`: App layout coordinator (managing navigation and pane displays).
  - `types.ts`: Central declaration of common type interfaces (Turn, Session, SearchResult, SourceMetadata).
  - `App.css`: Tailwind CSS entry stylesheet introducing variables.
  - `hooks/`: Custom application hooks (`useAppTheme.ts`, `useAutoUpdater.ts`).
  - `components/`: Reusable UI elements and panels:
    * `app/`: Top-level application coordinator components (`AppModalsCoordinator.tsx`).
    * `Sidebar.tsx`: Modular layout coordinator composing sub-components under `sidebar/` (`search/`, `filters/`, `groups/`, `list/`, `overlays/`, `hooks/`).
    * `sidebar/`: Domain sub-components for the sidebar panel (SidebarSearchControls, SearchHistoryOverlay, SidebarFilterBar, GroupTreeItem, DeleteGroupModal, SessionCard, SidebarContextMenu, and custom hooks).
    * `DetailPane.tsx`: Modular layout coordinator composing sub-components under `detail/` (`header/`, `turn/`, `overlays/`, `meta/`, `hooks/`).
    * `detail/`: Domain sub-components for the conversation viewer (DetailHeader, VirtualTurn, AssistantMessageRenderer, WorkedForBlock, ToolOutputBlock, DetailSearchOverlay, DateTimelineOverlay, DetailContextMenu, LightboxOverlay, SessionMetadataPanel, SessionSummaryCard, DetailSkeleton, DetailPaneEmptyState, and custom hooks).
    * `SettingsDialog.tsx`: Modular layout coordinator composing sub-components under `settings/` (`tabs/`, `SettingsNav.tsx`, `types.ts`).
    * `settings/`: Domain sub-components for the settings dialog (GeneralTab, ThemeTab, ReadAloudTab, SourcesTab, PermissionsTab, UpdatesTab, SettingsNav, and types).
  - `services/`: Bridges to call Tauri commands via TS functions (`tauriBridge.ts`).

- **`src-tauri/` (Backend Rust Core)**
  - `Cargo.toml`: Package dependencies (tauri, serde, rusqlite, notify, chrono).
  - `src/main.rs`: Minimal entry point that boots the library runner.
  - `src/lib.rs`: Tauri builder, setup hooks, and deep link integrations.
  - `src/menu.rs`: Native system menu builders, event handlers, and label updaters.
  - `src/commands.rs`: Rust command handlers exposed via IPC to the SolidJS frontend.
  - `src/models.rs`: Rust structs mapping unified types (`Session`, `Turn`, `SessionSummary`).
  - `src/parsers/`: Log adapters parsing files to models:
    * `claude.rs`: JSONL stream parser.
    * `cursor.rs`: SQLite workspace parser.
    * `antigravity.rs`: Hybrid parser supporting standard Google Antigravity and Antigravity IDE (VSCode fork) variants.
    * `copilot.rs` & `codex.rs`: Stream log event deserializers.
  - `src/search/`: Vector ONNX and lexical search logic.
  - `src/tokenizer.rs`: Offline BPE-based token count estimator (family scales, Hugging Face config loader).
  - `src/watcher.rs`: Native OS filesystem file monitoring.
  - `src/config.rs`: Local configuration storage (`~/.codeoba/config.json`).

- **`docs/` (Architectural Documentation)**
  - `tokenization_calibration.md`: Hybrid Offline/Online tokenization calibration & simulation system design.

- **`scripts/` (Developer & Build Utilities)**
  - `tauri.cjs`: Compile-time Node.js configuration wrapper. Dynamically overrides CSP (`connect-src`) and updater settings to allow connection to a custom `--base-url` at compile-time, keeping raw configuration files clean and avoiding runtime environment variable leakage.
  - `download-privacy.cjs`: Pulls down the latest `privacy.md` from the production site at build-time, checking standard caching headers for 304 Not Modified responses, with offline grace fallback.

---

## 🎨 UI Style Guidelines & Constraints (SolidJS + Tailwind CSS)

When modifying the frontend web components, adhere to these styling guidelines:

1. **Dynamic Color Theme Styling**:
   - Theme variables (e.g. background, surface, borders, highlight accents, text) are defined as CSS Custom Properties (variables) in `src/App.css`.
   - The SolidJS app loads the theme selection from the backend on startup and injects it as a CSS class or data attribute on the `<html>` or `<body>` element (e.g. `data-theme="nordic-frost"`).
   - Tailwind styles must use these semantic variable names (e.g., `bg-background`, `border-border`, `text-primary`, `text-accent-cyan`).
   - The 8 custom themes are: Obsidian, Nordic Frost, Emerald Forest, Sunset Copper, Royal Amethyst, Dracula, Cyberpunk Neon, and Monochrome Slate.

2. **Virtualized Lists (`@tanstack/solid-virtual`)**:
   - The sidebar session list is virtualized: only visible rows plus a small overscan are in the DOM. Rows are variable height (title wrap, optional snippet) and are measured at runtime via `measureElement`; `estimateSize` is only the pre-measure guess.
   - **Publish the scroll element and take row measurements in `onMount`, never straight from a `ref` callback.** SolidJS fires `ref` while the node still belongs to the inert `<template>` contents document, and that document's `defaultView` is `null`. Two distinct failures follow:
     * *Scroll container* — the virtualizer reads `ownerDocument.defaultView` exactly once, on the first `scrollElement` identity change, to set `targetWindow`. A `null` there makes `observeElementRect` return early, so **no ResizeObserver is ever attached**, `scrollRect` stays `{0,0}`, the computed range is empty, and **zero rows render**. Nothing re-subscribes afterward, because the element identity never changes again.
     * *Row measurement* — a manual `measureElement()` (no ResizeObserver entry) falls through to `offsetHeight`, which is `0` for a detached node, and a row's *first* measurement is not cache-guarded. A recorded `0` collapses every following row's offset, appearing as **overlapping cards**.
   - The scroll container must carry **no `padding-top`**: item offsets anchor to the sizer's top, so a top pad shifts every row out of alignment. Recreate the leading gap with padding on the row itself (it is then measured into the row height).
   - Anything that scrolls to a row (keyboard nav, selection) must use `virtualizer.scrollToIndex(...)`, not `document.getElementById(...).scrollIntoView()` — the target row is usually not in the DOM.

3. **Casing & Naming**:
   - Never display uppercase-only labels like "USER" or "ASSISTANT" in the transcripts. Use capitalized words (e.g. "User", "Assistant").

4. **Window Layout & Spacing (macOS vs Windows/Linux)**:
   - Clear a top-left padding/margin area (e.g., `80px` left padding) on macOS to avoid overlapping the macOS transparent titlebar window controls.
   - On Windows and Linux, native window decorations (title bar and borders) and standard system menus are enabled. Custom HTML window controls are removed, and padding on both left and right is set to standard `24px` because the webview client area begins below the native title/menu bar.
   - Maintain breadcrumb navigation: `Workspace Name / Active Session Title`.

5. **Markdown Rendering & Code Highlighting**:
   - Use `marked` on the frontend for rendering transcripts.
   - Syntactically highlight code snippets using `prismjs` or `shiki` within SolidJS code block layouts.
   - Handle markdown links inside chat bubbles by attaching clickable callback events that securely verify target paths with the backend before opening them.

6. **No CSS Capitalization on Localized Text**:
   - Avoid using Tailwind's `capitalize` or other CSS text-transform utilities on translated user-facing text. Define strings with their natural localized casing directly in the translation files, as capitalization grammar rules vary widely by language.

---

## ⚙️ Core Architecture Patterns

1. **Cursor State WAL & Orphan Filtering**:
   - SQLite connections to Cursor use read-only WAL mode (`mode=ro` in rusqlite) to query files without creating lock conflicts.
   - Skip database rows that are not listed in the active workspace's local `allComposers` list to automatically hide deleted sessions.

2. **Directory Watcher (notify crate)**:
   - Use Rust's `notify` crate to receive native OS file events.
   - Keep event-driven file monitoring filtered to specific target log extensions (`.jsonl`, `.md`, `.vscdb`) to prevent index-write loops on source codes or builds.
   - To avoid redundant rescans when editing files in Cursor, modifications under `workspaceStorage` are filtered by checking if the active composer list has actually changed.
   - To avoid duplicate reloads on database writes, database change events compute a file content hash. If the hash matches the previous state, the reload is skipped.
   - **One authority for session deletion; never delete on absence unless the scan completed.** A session is removed from the index only via `watcher::reindex_source_and_emit`, which snapshots `store::session_states` before the rescan, re-reads it after, and diffs the two — so deletion is derived from the store's actual post-scan state, never from a filesystem event or a scan's return value. `end_scan` is completeness-gated, so an incomplete scan leaves the store unchanged and the diff is empty. `parse_all_sessions` returns `ScanResult { sessions, complete }`. Distinguish three cases: (a) a source root that is missing or unreadable is *authoritatively empty* -- the adapter routes it to `SessionCacheManager::scan_absent_source`, a completed empty scan, so its sessions are marked deleted (soft `is_deleted`, hard-removed only under `prune_deleted_sessions`) and un-flagged if the root returns; (b) a failure *deeper* in the walk makes the scan incomplete (`complete = false`) and must change nothing; (c) a root present and readable but whose scan came back short is likewise never allowed to wipe the source (the concurrent-scan bug). Filesystem events (directory removed, inode changed) must NOT delete sessions directly — they trigger a rescan that reconciles. The only removals that bypass this authority are *positive-identification* ones (subagent eviction; a single observed-deleted file), never absence-across-a-scan. When changing any deletion/mutation of the session index, first grep every writer of `sessions` (`.write()`, `remove`, `retain`, `clear`, `session-deleted` emits) and route it through this authority rather than adding a parallel path.

   - **When a fallible read defaults on failure, ask what that default *means* to its consumer.** This codebase has produced the same bug at six different layers: a read fails, `.ok()` / `.unwrap_or_default()` / `unwrap_or(false)` substitutes an empty or falsy value, and something downstream reads that value as a *fact* — "this source has no sessions", "this session is gone" — rather than as "we failed to look". The symptom is always the same and always looks like something else: sessions intermittently missing from the sidebar, self-healing on relaunch. `ScanResult`'s `complete` flag exists solely to keep "genuinely empty" apart from "could not observe"; the recurring mistake is collapsing that distinction again somewhere else. The terse default is not automatically wrong — `source_has_sessions` defaulting to `false` merely skips a rescan, which is the safe direction — so the rule is not "never default", it is: **state, at the call site, what the default asserts to whoever consumes it, and confirm that assertion is safe to make while blind.** If it is not, propagate the failure instead (see `watcher::read_session_states`, which returns `Option` so an unreadable store cannot masquerade as an empty one).

   - **One authority for derived session fields: the cache entry points, never the parse path.** An adapter that cannot name a session from its own metadata emits a placeholder title (`"Claude Session"`, `"Cursor Session"`, ...), and `parsers::post_process_session` replaces it from the first user message. That derivation MUST run where a session *enters the cache* — `SessionCacheManager::put_cached_session` (freshly parsed files) and `update_cached_session` (unchanged files served from cache) — because everything reaching SQLite flows `end_scan` → `save_cache` → `store::save_source`. Running it any later (e.g. in `Source::parse_session`) only decorates the returned in-memory copy, which is never written back: the store keeps the placeholder and the UI reverts on the next launch. **`update_cached_session` is the path that matters for an existing corpus** — an unchanged transcript is never re-parsed, so it never reaches `put_cached_session` at all; fixing only the latter left 35 of 37 real sessions still reading "Claude Session". Note that `store::save_source` deliberately always upserts the metadata row and gates only the (bulk) turns on a content change, precisely so fields derived *outside* the transcript — titles, status, archival — can be corrected without a content edit.

3. **Local App Configuration & Cache Storage**:
   - Stores local user configuration options (pinned sessions, theme preferences, prune options) in `~/.codeoba/config.json`.
   - Stores parsed session transcripts in a SQLite database at `~/.codeoba/cache/sessions.db` (WAL mode), normalized into `sessions` (unique on `(source_id, file_path)`, surrogate `row_id`) and `turns` (cascading delete). The store is authoritative for reads: there is no parallel in-memory session corpus, and `search` streams from it via `store::for_each_session` (keyset-paginated).
   - This replaced per-source `cache_*.json` files. Those are now swept at startup by `SessionCacheManager::remove_legacy_json_caches` (called from the `.setup()` hook alongside the legacy `~/.codeoba/models` cleanup), so an upgraded install reclaims the space without the user having to run `clear_all_caches` — which also wipes `sessions.db` and forces a full re-index. The sweep is best-effort, non-recursive, and matches only `cache_*.json` directly inside the cache directory, so `sessions.db` and unrelated files are never touched.

4. **Auto-Updates & Deployment Pipeline**:
   - **Built-in Updater**: Utilizes Tauri's built-in updater (`tauri-plugin-updater`) for release checks and installer execution.
   - **Two-Tier Key Signing**: Uses development key pairs for pushes to `main` (staging builds) and production key pairs for tag pushes (`v*`). Private key variables are `CODEOBA_TAURI_UPDATE_PRIVATE_KEY_DEV` and `_PROD`. Public key variables are `CODEOBA_TAURI_UPDATE_PUBLIC_KEY_DEV` and `_PROD`.
   - **Version Suffixing**: The `./scripts/sync-version.cjs` script configures the target version:
     * Staging (pushes to `main`): appends `-<build_number>` suffix (e.g. `0.1.0-123`) and sets the update endpoint to `https://dev.codeoba.com/api/update`.
     * Production (tag pushes): uses clean semver version and sets the update endpoint to `https://codeoba.com/api/update`.
   - **Manifest Merging**: The `./scripts/merge-updater-manifests.cjs` script merges platform-specific `latest.json` files generated by matrix runners into a single, unified manifest and rewrites asset URLs.
   - **Staging Pre-Release Pruning**: The `./scripts/prune-dev-releases.cjs` script programmatically deletes previous dev pre-releases and tag references using the GitHub CLI to prevent release list spam. Running it locally with the `--local` flag (e.g., `node scripts/prune-dev-releases.cjs --local`) will scan and delete matching pre-release tags in the local Git repository instead.
   - **Staging Update Resolver**: Staging clients query `dev.codeoba.com/api/update`, which dynamically resolves the latest dev pre-release update manifest using the `CODEOBA_TAURI_LATEST_JSON_URL=DYNAMIC_DEV` backend configuration.

5. **Store Screenshot Generator & Mock Mode**:
   - Intercept log folders parsing and load canned mock datasets (`canned_apple.json` or `canned_microsoft.json`) if `--store microsoft` or `--store apple` flags are passed to the app cli entrypoint.

6. **Claude Code Directory Traversal Limit**:
   - Limit the folder scanning depth for Claude Code (`~/.claude/projects`) strictly to a maximum depth of `3` (`max_depth = 3`).
   - This prevents the directory scanner from traversing into massive project workspace folders or following cyclic symlinks under user projects, avoiding thread lockup and extreme performance degradation.
   - It also ensures search index correctness by preventing the scan from picking up subagent transcripts (located at depth 4). Because subagent logs share their parent's `sessionId`, parsing them would cause duplicate IDs and overwrite the parent session in the search index with incomplete subagent data.

7. **Tauri System Menu & Scroll Target Focus**:
   - Custom menu events are captured globally on the `tauri::Builder` instance (via `.on_menu_event`) instead of the app setup hook, ensuring compatibility with macOS's thread loop initialization.
   - Click events are dispatched both globally and window-specifically to guarantee all frontend listener types receive the signal.
   - To prevent WKWebView scroll layout suppression when clicking the native OS menu bar (where the webview window loses focus), the frontend listeners run an explicit `window.focus()`.
   - It then resolves the target container element (e.g., `#detail-pane-scroll-container` or `#sidebar-scroll-container`) within a deferred `setTimeout(..., 50)` block, programmatically focuses it (enabled via `tabindex="-1"` and `outline-none`), and mutates its `scrollTop` property. This focuses the target pane and initiates subsequent native keyboard navigation.

8. **Vite Hot-Reload Startup Rebuild Bypass**:
   - In development environments, saving workspace source files causes the Vite server to refresh the webview, mounting the root SolidJS application again and calling `rebuild_index`.
   - The backend tracks whether it has completed its initial index rebuild run via `has_rebuilt`. Any subsequent automatic rebuild requests originating from startup mounts short-circuit immediately, avoiding the 700ms index reload lag.

9. **Unified Tauri Structured Errors**:
    - Tauri command handlers exposed to SolidJS MUST return `Result<T, AppErrorPayload>` rather than raw, unlocalized `String` errors.
    - Errors are defined as u32 constants (e.g., 2000-2999 range) in `src-tauri/src/commands.rs` and mapped to user-facing translations under the `errors` section in locale dictionaries (e.g., `src/i18n/locales/en.json`).
    - Frontend callers catching these errors MUST pass the rejected promise payload through the `getLocalizedAppError(err, t)` helper in `src/utils/errorHelper.ts` to resolve and display translated error messages.

10. **Antigravity Session Status Resolution (v1 state machine)**:
    - Status is derived from the last line of the session transcript (`transcript_full.jsonl`/`transcript.jsonl` under the session's brain dir) plus one process heartbeat. There are deliberately **no time-based staleness caps** — any cap X mislabels a command that legitimately runs longer than X.
    - Resolution order (see `ag_status_decision` in `src-tauri/src/models.rs`):
      1. Antigravity[ IDE] app not running → `"idle"` (heartbeat failsafe for crash/quit; matched by app bundle path, not loose substrings).
      2. Last line is a `PLANNER_RESPONSE` with an `ask_question`/`ask_permission` tool call → `"waiting"` (a question is showing; the `ASK_QUESTION` line is only appended after the user answers, so both edges are reliably on disk).
      3. Last line is a bare `PLANNER_RESPONSE` with no unfinished background task → `"idle"` (turn over).
      4. Anything else → `"active"`.
    - **Known/accepted v1 gap**: a `run_command` proposal shows `"active"` whether approval is pending or the command is executing — Antigravity only flushes the `RUN_COMMAND` line when the command *finishes*, so the two states are indistinguishable on disk, and auto-approved commands never show a prompt at all. Distinguishing them requires process-table probing and is deferred.
    - **Task completion tracking**: `RUN_COMMAND`/`GENERIC` lines with status `RUNNING` launch background tasks (scoped per user turn); completion is detected via `SYSTEM_MESSAGE`/`ERROR_MESSAGE`/`GENERIC` lines carrying the task id plus a completion keyword (finished/status: done/completed/terminated/cancelled/expired). `sender=` is **not** a completion marker — every inter-task message envelope carries it.

11. **Search History & Dropdown Interaction**:
    - Persisted locally via `localStorage` (key: `codeoba-search-history`), capped at the 100 most recent unique queries.
    - Opaque dropdown container styled with `var(--surface)` to prevent background content overlap.
    - Dropping down intercepts `onMouseDown` with `preventDefault()` to prevent focus loss during scroll, row clicks, or entry deletion.
    - Input edits reset the active selection index to `-1` so pressing Enter submits the typed text.
    - Keyboard navigation (ArrowUp/ArrowDown to navigate list, Enter to submit, Escape/Tab to close) stops event propagation to avoid bubbling up to the sidebar's container layout handlers.

---

## 🛠️ Common Cargo & NPM Development Commands

- Install frontend packages: `npm install`
- Launch Tauri application in hot-reloading dev environment: `npm run tauri dev` (or with local override: `npm run tauri dev -- --base-url=http://localhost:5000`)
- Run Rust backend unit tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Compile production packages/installers locally (without updater signing): `npm run build:local`
