# Codeoba — Tauri Desktop App (React + Rust)

Codeoba is a platform-agnostic, zero-dependency, 100% local search application that aggregates and indexes conversation transcripts from major AI coding assistants (Claude Code, Cursor, Aider, Copilot, Codex, and Google Antigravity) into a unified desktop dashboard.

This is the Tauri-based port of the desktop application, combining a highly efficient Rust backend core with a modern React + TypeScript + Tailwind CSS frontend.

---

## 🛠️ Prerequisites

Before you run or compile the application, ensure you have the following installed on your machine:

1. **Node.js** (v18.0.0 or newer)
2. **Rust & Cargo** (v1.75.0 or newer)
   * On macOS/Linux, install via: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
   * On Windows, install using the official [Rustup installer](https://rustup.rs/)

---

## 🚀 Getting Started

Follow these steps to run the application in your local development environment:

### 1. Install Dependencies
Run the package installation command in the root of the `Codeoba-Tauri` directory:
```bash
npm install
```

### 2. Run the Development Client
Launch the hot-reloading development server and compile/run the native desktop shell wrapper:
```bash
npm run tauri dev
```
*This command starts the Vite local server on port `1420` and loads the React UI into the native operating system webview. Changes to frontend views will hot-reload instantly. Changes to the Rust backend will trigger an automatic recompilation and restart.*

---

## 🧪 Testing

To execute Rust backend tests (including log parsers, search algorithms, and signature checks):
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## 📦 Building for Production

To compile and package the application into a single platform-specific installer (`.dmg`/`.pkg` on macOS, `.msi` on Windows, `.deb` on Linux):
```bash
npm run tauri build
```
*Tauri automatically compiles the Rust source code in `--release` mode, minifies frontend React assets, bundles them into the binary, and signs the resulting package if code-signing certificates are configured.*

---

## 🏗️ Project Architecture Map

*   **`src/` (Frontend)**: Styled with Tailwind CSS, React components manage search layouts, settings panes, markdown renderings, and UI themes.
*   **`src-tauri/` (Backend)**: Rust crate that manages directory watchers (`notify`), SQLite cache databases (`rusqlite`), credential stores (`keyring`), ONNX semantic vector inference (`ort`), and signed WASM plugin loading (`wasmtime`).
