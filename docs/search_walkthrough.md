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
   *(Ensure `CODEOBA_MOCK_HOME` matches the custom path if you supplied a custom `--dir`)*.

3. **Verify App Loaded Correctly**:
   The app will boot, and you should see exactly 6 sessions listed in the left sidebar:
   - *SQLite WAL Mode Configuration* (Cursor)
   - *Release Pipeline & Auto-Updater* (Claude Code)
   - *Theme Variable Styling with Tailwind* (Copilot)
   - *Signed WASM Premium Execution* (Codex)
   - *Native Filesystem Directory Watcher* (Antigravity)

---

## 2. Verify Lexical Search Queries

Lexical search relies on exact token and substring matches. Type the following queries into the sidebar search input and verify the expected results.

> [!NOTE]
> Make sure **Semantic Search** (the sparkles button) is **disabled** (gray background) for this section.

### Query 1: `"WAL"`
* **Expected Result**: *SQLite WAL Mode Configuration* (Cursor) at Rank 1.
* **Why**: The term "WAL" is a unique keyword present in that thread's title and turns.

### Query 3: `"Tailwind"`
* **Expected Result**: *Theme Variable Styling with Tailwind* (Copilot) at Rank 1.
* **Why**: The word "Tailwind" is present in the thread's title and contents.

### Query 4: `"ed25519-dalek"`
* **Expected Result**: *Signed WASM Premium Execution* (Codex) at Rank 1.
* **Why**: The specific library name "ed25519-dalek" is only present in the Codex thread.

---

## 3. Verify Semantic Search Queries

Semantic search maps queries conceptually even when no exact matching keywords are shared.

> [!IMPORTANT]
> Click the **Semantic Search** (sparkles) button in the search bar to **enable** semantic search (colored/accent background). 
> *Note: If you have not downloaded the ONNX embeddings model, go to Settings -> Semantic Search and click "Download Model".*

### Query 1: `"database concurrency performance"`
* **Expected Result**: *SQLite WAL Mode Configuration* (Cursor) at Rank 1.
* **Why**: Even though "concurrency" and "performance" are not explicitly in the logs, the concepts of "WAL mode", "prevent lock conflicts", and "concurrent readers" map semantically.

### Query 2: `"clean dev tags release"`
* **Expected Result**: *Release Pipeline & Auto-Updater* (Claude Code) at Rank 1.
* **Why**: Concepts like "prune dev releases", "staging", and "delete old tag references" match this query semantically.

### Query 3: `"signature verification decryption"`
* **Expected Result**: *Signed WASM Premium Execution* (Codex) at Rank 1.
* **Why**: Discusses securing WASM runner, verifying signed modules using cryptographic public keys, matching the concepts in the query.
