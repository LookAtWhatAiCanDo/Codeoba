# Codeoba

Codeoba is a platform-agnostic, 100% local desktop application that aggregates, monitors, and searches conversation transcripts from your AI coding assistants. 

Instead of searching through hidden cache directories, terminal logs, or editor database files, Codeoba brings all your AI conversation histories together into a single, beautiful dashboard.

> [!WARNING]
> **Pre-release Software (Pre-v1.0)**: Codeoba is currently under active development. You may encounter minor bugs or incomplete features. Please report issues or submit feedback to the [Codeoba Issue Tracker](https://github.com/LookAtWhatAiCanDo/Codeoba/issues).

---

## ✨ Key Features

* **Unified Dashboard**: Browse conversation threads from all your AI tools in a single timeline, sorted by date or search relevance.
* **100% Local & Private**: Your data never leaves your computer. All file parsing, databases, search indexing, and vector calculations run entirely locally on your CPU. No cloud tracking, no metrics collection.
* **Hybrid Search**: 
  * **Keyword Search**: Instant lexical matching for specific terms or code snippets.
  * **Semantic Search**: AI-powered search (using a built-in, offline transformer model) that finds conversations based on meaning and context, even if the exact words don't match.
* **Rich Markdown Transcripts**: Read conversations with clean layouts, full Markdown formatting, code block syntax highlighting, and quick copy-to-clipboard controls.
* **Dynamic Visual Themes**: Personalize your workspace with curated color themes, including Obsidian, Nordic Frost, Emerald Forest, Sunset Copper, Royal Amethyst, Dracula, Cyberpunk Neon, and Monochrome Slate.

---

## 🔌 Supported AI Assistants

Codeoba automatically indexes transcripts from:
* 🤖 **Claude Code** (scans project session files)
* 🧭 **Cursor** (reads local SQLite workspace database files in WAL mode)
* 🐙 **GitHub Copilot** (deserializes session logs)
* 🧠 **OpenAI Codex** (reads stream log events)
* 🪐 **Google Antigravity** (parses JSONL trajectories and v2.0 session databases)

---

## 📥 Installation

Ready to install? Go to the official [Codeoba Releases page](https://github.com/LookAtWhatAiCanDo/Codeoba/releases) and download the appropriate installer:

* **🍎 macOS**: Download the **`DMG`** package (runs on both Apple Silicon and Intel Macs).
* **🪟 Windows**: Download the **`Standard Installer EXE`** for your system (x64 or ARM64).
* **🐧 Linux**: 
  * Download the **`DEB`** package if you are using **Ubuntu, Debian, Linux Mint, or Pop!_OS**.
  * Download the **`RPM`** package if you are using **Fedora, RedHat (RHEL), or openSUSE**.

---

## 🛠️ For Developers & Contributors

If you want to compile Codeoba from source, run local tests, or contribute code/translations to the project, please refer to the detailed [Developer & Contributor Guide](./DEVELOPMENT.md).

## 📄 License & Feedback

Codeoba is proprietary software. Copyright &copy; 2026 What AI Can Do, LLC. All rights reserved. Codeoba™ is a trademark of What AI Can Do, LLC. Any unauthorized copying, modification, or distribution is strictly prohibited. For full license terms, please refer to the [LICENSE](./LICENSE) file.

You can report bugs, request features, or check out ongoing developments in our [GitHub Issue Tracker](https://github.com/LookAtWhatAiCanDo/Codeoba/issues).
