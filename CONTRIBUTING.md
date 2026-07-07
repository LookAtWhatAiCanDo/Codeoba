# Contributing to Codeoba

First off, thank you for taking the time to contribute! Codeoba is a 100% local, open-source tool, and community contributions are what make it better.

There are many ways to contribute: reporting bugs, suggesting features, writing code, or adding and improving translations.

---

## 🐛 Reporting Bugs & Suggesting Features

If you encounter issues or have an idea to improve the app:
1. Search the [GitHub Issue Tracker](https://github.com/LookAtWhatAiCanDo/Codeoba/issues) to see if it has already been reported.
2. If not, open a new issue. Please provide:
   * A clear, descriptive title.
   * Steps to reproduce the bug (for bug reports).
   * Your operating system (macOS, Windows, Linux).
   * What you expected to happen vs. what actually happened.

---

## 🔧 Git Workflow & Code Contributions

To contribute code changes:

### 1. Development Setup
Please read the [Developer & Contributor Guide](./DEVELOPMENT.md) first to set up your environment, install prerequisites, and learn how to run the application locally.

### 2. Branching & Pull Requests
1. Fork the repository and create a feature branch from the `main` branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes. Ensure code is clean, commented where necessary, and formatted correctly.
3. Write/run tests to verify your changes.

### 3. Testing Requirements
Before submitting a pull request, you **must** run the local test suite to ensure no regressions are introduced:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

### 4. Conventional Commits
All commit messages and pull request titles **must** follow the [Conventional Commits specification](https://www.conventionalcommits.org). This formatting is parsed by our release pipeline to generate release changelogs.

Format: `<type>(<scope>): <description>`

Common types:
* `feat`: A new user-facing feature (e.g., `feat(sidebar): add session filtering`)
* `fix`: A bug fix (e.g., `fix(parser): resolve crash on malformed jsonl`)
* `docs`: Documentation updates (e.g., `docs(readme): add installation guide`)
* `perf`: Performance optimizations (e.g., `perf(search): reduce memory usage in indexing`)
* `chore`: Maintenance tasks or script updates (e.g., `chore(deps): update dependency version`)

---

## 🌐 Contributing Translations

Codeoba supports multiple interface display languages. To maintain high-quality, context-aware translations while protecting variable interpolations (like `{count}`), the project uses a single-pass delta translation and reconciliation workflow powered by Gemini.

If you speak another language and want to add or improve translations:

### 1. Setup API Key
Obtain a free Gemini API key from [Google AI Studio](https://aistudio.google.com/) and export it:
```bash
export GEMINI_API_KEY="your_api_key_here"
```

### 2. Run the Script
The translation script compares the current workspace translations with the last git commit (`HEAD`) and identifies:
- Brand new keys that are missing or empty in your locale files.
- Keys that have changed or been deleted.

It only sends those specific differences to the Gemini API to reconcile or translate, preserving existing correct translations.

* **Preview the changes (Dry Run)**:
  Shows exactly which keys differ and what will be sent to Gemini without making API calls or modifying files:
  ```bash
  GEMINI_API_KEY=xxx npm run translate -- --dry-run
  ```

* **Run the translation**:
  Executes the script and updates the locale JSON files on disk:
  ```bash
  GEMINI_API_KEY=xxx npm run translate
  ```

Once the script finishes, review the changes in `/src/i18n/locales/*.json`, stage them, and commit them.
