# Manual Search Quality Verification Walkthrough

This document outlines the step-by-step procedure to manually verify the quality and effectiveness of Codeoba's **Lexical** and **Semantic** search features using a rich sandboxed telemetry dataset.

---

## 1. Setup the Rich Sandbox

1. **Initialize and Generate Mock Logs**:
   Clear your local mock sandbox and generate the rich, non-trivial mock sessions (optionally specify a custom folder using `--dir <path>`):

   ```bash
   python3 scripts/sandbox.py --init --dir mock_rich
   python3 scripts/sandbox.py --rich --dir mock_rich
   ```

2. **Launch the App in Sandbox Mode**:
   Launch the Tauri application redirecting the user home folder to the sandbox:

   ```bash
   CODEOBA_MOCK_HOME=$PWD/demo_mock npm run tauri dev
   ```

   _(Ensure `CODEOBA_MOCK_HOME` matches the custom path if you supplied a custom `--dir`)_.

3. **Verify App Loaded Correctly**:
   The app will boot, and you should see exactly 6 sessions listed in the left sidebar:
   - _SQLite WAL Mode Configuration_ (Cursor)
   - _Release Pipeline & Auto-Updater_ (Claude Code)
   - _Theme Variable Styling with Tailwind_ (Copilot)
   - _Signed WASM Premium Execution_ (Codex)
   - _Native Filesystem Directory Watcher_ (Antigravity)

---

## 2. Verify Lexical Search Queries

Lexical search relies on exact token and substring matches. Type the following queries into the sidebar search input and verify the expected results.

### Query 1: `"WAL"`

- **Expected Result**: _SQLite WAL Mode Configuration_ (Cursor) at Rank 1.
- **Why**: The term "WAL" is a unique keyword present in that thread's title and turns.

### Query 3: `"Tailwind"`

- **Expected Result**: _Theme Variable Styling with Tailwind_ (Copilot) at Rank 1.
- **Why**: The word "Tailwind" is present in the thread's title and contents.

### Query 4: `"ed25519-dalek"`

- **Expected Result**: _Signed WASM Premium Execution_ (Codex) at Rank 1.
- **Why**: The specific library name "ed25519-dalek" is only present in the Codex thread.
