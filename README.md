# Codeoba — Tauri Desktop App (SolidJS + Rust)

Codeoba is a platform-agnostic, zero-dependency, 100% local search application that aggregates and indexes conversation transcripts from major AI coding assistants (Claude Code, Cursor, Copilot, Codex, and Google Antigravity) into a unified desktop dashboard.

This is the Tauri-based port of the desktop application, combining a highly efficient Rust backend core with a modern SolidJS + TypeScript + Tailwind CSS frontend.

> [!WARNING]
> **Pre-release Software (Pre-v1.0)**: Codeoba is currently alpha/beta quality under active development. You may encounter bugs, performance issues, or incomplete features. Please report any issues or submit feedback to the [Codeoba Issue Tracker](https://github.com/LookAtWhatAiCanDo/Codeoba/issues).

---

## 🛠️ Prerequisites

Before you run or compile the application, ensure you have the following installed on your machine:

### 🍎 macOS & 🐧 Linux
1. **Node.js** (v18.0.0 or newer)
2. **Rust & Cargo** (v1.75.0 or newer)
   * Install via: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. **System Dependencies (Linux Only)**:
   * GTK 3, WebKit2GTK, libappindicator, etc. (See CI workflow or Tauri docs).

### 🪟 Windows Setup (Fresh Machine)
Tauri on Windows compiles native binaries using the Microsoft C++ compiler (MSVC) and renders views using WebView2.

Open **PowerShell** as an **Administrator** and run the following commands:

1. **Install C++ Build Tools** (Selects MSVC v143, C++ CMake tools, and the Windows SDK):
   ```powershell
   winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22000 --passive --norestart" --source winget
   ```
   > [!WARNING]
   > **Existing VS Build Tools Gotcha**: If Visual Studio Build Tools is already installed on your system, `winget` will say *"already installed"* and skip it without adding workloads. If you get `linker link.exe not found` during build, you must manually select the workload by launching the installer modification GUI:
   > ```powershell
   > Start-Process -FilePath "C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe" -ArgumentList "modify --installPath `"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`"" -Verb RunAs
   > ```
   > Once the GUI opens, check **Desktop development with C++**, make sure **Windows 10/11 SDK** is checked on the right-hand panel, and click **Modify**.
2. **Install Node.js & Rustup**:
   ```powershell
   winget install --id OpenJS.NodeJS.LTS -e --source winget
   winget install --id Rustlang.Rustup -e --source winget
   ```
3. **Set Up MSVC Toolchain & WebView2**:
   * Restart PowerShell to refresh your `PATH` environment variable.
   * Ensure the MSVC toolchain is default: `rustup default stable-x86_64-pc-windows-msvc`
   * Modern Windows 10/11 already have WebView2 pre-installed. If missing, run: `winget install --id Microsoft.EdgeWebView2Runtime -e --source winget`

> [!IMPORTANT]
> **Windows Linker Environment Variable**:
> Codeoba compiles `esaxx-rs` (configured for dynamic linking). To prevent `LNK2038` compiler errors, you must set the `ESAXX_DYNAMIC_LINK` environment variable to `1`.
> * Set permanently in PowerShell: `[Environment]::SetEnvironmentVariable("ESAXX_DYNAMIC_LINK", "1", "User")` (requires shell restart to take effect).
> * Or temporarily in your current session: `$env:ESAXX_DYNAMIC_LINK="1"`

> [!TIP]
> **PowerShell Execution Policy Error (`npm.ps1 cannot be loaded...`)**:
> If running `npm` or `npx` in PowerShell throws a security error stating `File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system`, run this command to enable script execution for the current user:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## 🚀 Getting Started

Follow these steps to run the application in your local development environment:

### 1. Install Dependencies
Run the package installation command in the root of the `Codeoba` directory:
```bash
npm install
```

### 2. Run the Development Client
Launch the hot-reloading development server and compile/run the native desktop shell wrapper:
```bash
npm run tauri dev
# or
npm run tauri dev -- --release
```
*This command starts the Vite local server on port `1420` and loads the SolidJS UI into the native operating system webview. Changes to frontend views will hot-reload instantly. Changes to the Rust backend will trigger an automatic recompilation and restart.*

---

## 📖 Command-Line Interface (CLI) Usage

Codeoba can be configured or executed directly from your terminal using custom command-line options.

### 1. Terminal Search (Headless CLI)
You can run search operations directly in your shell without spawning the desktop graphical interface:
```bash
# Perform a standard lexical (keyword-based) search
cargo run --manifest-path src-tauri/Cargo.toml -- search "your search query"

# Perform an ONNX-powered semantic vector search
cargo run --manifest-path src-tauri/Cargo.toml -- search "your search query" --semantic
```

### 2. Reset Window Geometry & Layout
If you need to reset the app's window sizes, positions, and sidebar widths back to the default 3/4 monitor dimensions (for instance, after screen configurations change or monitors are disconnected), pass the reset argument.

Because of how package managers (`npm`), the Tauri CLI, and the Rust compiler (`cargo`) chain command-line arguments, the number of double-dash (`--`) separators required varies depending on how you run the application:

*   **Using `npm run tauri dev` (requires 3 separators):**
    ```bash
    # npm consumes the first --, Tauri CLI consumes the second --, and the third -- passes the flag to the app binary
    npm run tauri dev -- -- -- --reset-window
    
    # Or with the short reset flag
    npm run tauri dev -- -- -- --reset
    ```

*   **Using `npx tauri dev` (requires 2 separators):**
    ```bash
    # Tauri CLI consumes the first --, and the second -- passes the flag to the app binary
    npx tauri dev -- -- --reset-window
    ```

*   **Using `cargo run` directly (requires 1 separator):**
    ```bash
    # Cargo consumes the -- and passes the flag to the app binary
    cargo run --manifest-path src-tauri/Cargo.toml -- --reset-window
    ```

*   **Running the compiled production binary (no separator needed):**
    ```bash
    # Arguments are passed directly to the native executable
    ./codeoba --reset-window
    ```

---

## 🔒 Single Instance Mode

Codeoba is configured to run as a single-instance application to prevent duplicate directory watchers, file logging conflicts, and database write contentions.

### How it Works
The application uses the unique identifier `com.whataicando.codeoba` (defined in `tauri.conf.json`) to create a system-level lock (e.g., named pipe on Windows, Unix domain socket under `$TMPDIR` on macOS/Linux). 

* **Second Instance Interception**: If another instance of Codeoba is launched while the app is already running, the new instance detects the lock, forwards its launch arguments to the active instance, and immediately exits.
* **Focus Restoration**: The running instance intercepts the second instance request, logs the arguments, and brings the main window to the foreground.

### Development Note
Because the single-instance lock is keyed by the application identifier, running a locally compiled development build (e.g., via `npm run tauri dev`) while an installed production build is open will treat the dev build as a second instance (focusing the production app and terminating the dev build immediately).

To run a development version concurrently with your production version for testing, you must pass a custom identifier to the dev command:
```bash
npm run tauri dev -- --config '{"identifier": "com.whataicando.codeoba.dev"}'
```

---

## 🧪 Testing

To execute Rust backend tests (including log parsers, search algorithms, and signature checks):
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## 📦 Building for Production

To compile and package the application locally (generates both executable and installers, no signing required):
```bash
npm run build:local
```

To compile **only** the standalone release executable (skips wix/nsis installer packaging steps for faster builds):
```bash
npm run build:exe
```
Once the build completes, the compiled standalone release executable is located at:
*   **Windows**: `.\src-tauri\target\release\codeoba.exe`
*   **macOS / Linux**: `./src-tauri/target/release/codeoba`

You can run the executable directly in your terminal to test the production startup and client rendering:
```bash
# Windows
.\src-tauri\target\release\codeoba.exe

# macOS / Linux
./src-tauri/target/release/codeoba
```

For production builds (where updates are signed and verified using Minisign):
```bash
# Set private key and password before compiling
export TAURI_SIGNING_PRIVATE_KEY="your_private_key_content"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your_key_password"
npm run tauri build
```
*Tauri compiles the Rust source code in `--release` mode, minifies frontend SolidJS assets, bundles them into the binary, and packages the installer (`.dmg` on macOS, `.msi` / `.exe` setup on Windows, `.deb` on Linux). The generated installers are saved to `src-tauri/target/release/bundle/`.*

---

## 🏗️ Project Architecture Map

*   **`src/` (Frontend)**: Styled with Tailwind CSS, SolidJS components manage search layouts, settings panes, markdown renderings, and UI themes.
*   **`src-tauri/` (Backend)**: Rust crate that manages directory watchers (`notify`), SQLite cache databases (`rusqlite`), credential stores (`keyring`), ONNX semantic vector inference (`ort`), and signed WASM plugin loading (`wasmtime`).

---

## 🔄 Auto-Updates & CI/CD Release Pipeline

Codeoba features secure, cryptographically-signed auto-updates hosted on GitHub Releases, powered by the Tauri v2 Updater.

### 1. Cryptographic Update Signing
By default, the repository's [tauri.conf.json](src-tauri/tauri.conf.json) points to the development/staging proxy at:
`https://dev.codeoba.com/api/update`

During tagged production builds, the CI pipeline automatically rewrites this configuration to target the production update proxy at:
`https://codeoba.com/api/update`

This proxy handles client telemetry logging and retrieves the signed `latest.json` bundle configuration directly from GitHub Releases. Update packages must be signed using a **Minisign** keypair:
*   The public key is configured inside [tauri.conf.json](src-tauri/tauri.conf.json) under `plugins.updater.pubkey`.
*   The private key is stored locally (ignored by Git) and must be provided as an environment variable (`TAURI_SIGNING_PRIVATE_KEY`) to compile updates.

#### Local/Staging Testing
By default, the updater is disabled in the repository configuration (`"active": false` under `"updater"` in `tauri.conf.json`) to prevent unwanted network checks during development. Furthermore, the public key is cleared in the repo by default (`"pubkey": ""`).

To test update checking and download progress triggers locally (against either `dev.codeoba.com` or a local mock server on `localhost`), you must follow the verification and key registration steps documented in the [Local & Staging Update Testing Guide](docs/APP_SIGNING.md#🧪-local--staging-update-testing-guide).


To sign updates locally during a build, run:
```bash
# Set private key and password (if any) before compiling
export TAURI_SIGNING_PRIVATE_KEY="your_private_key_content"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your_key_password"
npm run tauri build
```
This generates the platform installer together with a `.sig` signature file and updater configuration block.

### 2. GitHub Actions CI/CD Pipeline
A release pipeline is configured in [.github/workflows/build-desktop.yml](.github/workflows/build-desktop.yml). It triggers automatically under two conditions:

1. **Staging / Dev Releases (Pushes to `main`)**: When code is pushed to `main`, the pipeline automatically builds and signs the packages using the staging key pair, publishes them under a unique pre-release tag (e.g. `v0.1.0-124`), and prunes previous dev pre-releases and tags to keep the release list clean. Staging clients query `dev.codeoba.com/api/update` to receive updates.
   * **Local Tag Cleanup:** To delete stale staging/dev tags from your local Git workspace (which aren't pruned automatically by standard git pulls), run:
     ```bash
     node scripts/prune-dev-releases.cjs --local
     ```
2. **Tagged Production Releases (`v*`)**: To publish a new stable production release:
   
   *   **Step 1: Bump the Version**: Synchronize the version across all project files to the target version (e.g. `0.1.3`) using the bump helper script:
       ```bash
       # Bump files locally
       npm run bump -- 0.1.3
       
       # Bump files and automatically commit the change to main
       npm run bump -- 0.1.3 --commit
       ```
       *(This consistently updates `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, and `Cargo.lock`).*

        > [!TIP]
        > **Automatic Stash Guard:** Running the bump command with the `--commit` flag automatically stashes any ongoing local changes (`git stash`) before modifying the files, commits the version changes cleanly, and then restores your workspace (`git stash pop`) in a `finally` block. This keeps the release commit isolated without polluting your active working directory.
   *   **Step 2: Tag and Push**: Create and push a git tag matching the new version:
       ```bash
       git tag v0.1.3
       git push origin v0.1.3
       ```
       *The pipeline compiles the stable binary using the tag name as the compiled version (e.g., `0.1.3`), and uploads the production `latest.json` manifest directly to the release page.*

       > [!IMPORTANT]
       > **Version Match Guard:** The CI release pipeline validates that the pushed tag version (e.g. `v0.1.3`) matches the static version in `package.json`. If they do not match, the CI job will fail immediately to prevent out-of-sync builds.

For complete instructions on setting up credentials, OIDC, keypairs, and rotation, see the detailed [App Signing Guide](docs/APP_SIGNING.md).

#### Required GitHub Secrets and Variables
To allow the release action to compile, sign, and notarize the packages successfully, configure the following secrets and variables under **Settings > Secrets and variables > Actions** in your GitHub repository:

##### Secrets (Sensitive)
| Secret Name | Description | Platform |
|---|---|---|
| `CODEOBA_TAURI_UPDATE_PRIVATE_KEY_DEV` | Minisign private key content for staging/dev updates. | All (Updater) |
| `CODEOBA_TAURI_UPDATE_PRIVATE_KEY_PASSWORD_DEV` | The password used to encrypt the dev minisign key. | All (Updater) |
| `CODEOBA_TAURI_UPDATE_PRIVATE_KEY_PROD` | Minisign private key content for production updates. | All (Updater) |
| `CODEOBA_TAURI_UPDATE_PRIVATE_KEY_PASSWORD_PROD` | The password used to encrypt the production minisign key. | All (Updater) |
| `MACOS_CERTIFICATE_P12` | Base64-encoded Developer ID Application `.p12` file. | macOS |
| `MACOS_CERTIFICATE_PASSWORD` | Password for the Developer ID Application `.p12` file. | macOS |
| `MACOS_INSTALLER_CERTIFICATE_P12` | Base64-encoded Developer ID Installer `.p12` file. | macOS |
| `MACOS_INSTALLER_CERTIFICATE_PASSWORD` | Password for the Developer ID Installer `.p12` file. | macOS |
| `APPLE_ID_PASSWORD` | App-specific password generated on `appleid.apple.com`. | macOS |
| `AZURE_CLIENT_ID` | Application (client) ID of your Entra ID app registration. | Windows |
| `AZURE_TENANT_ID` | Directory (tenant) ID of your Azure subscription. | Windows |
| `AZURE_SUBSCRIPTION_ID` | ID of your active Azure subscription. | Windows |

##### Variables (Non-Sensitive)
| Variable Name | Description | Platform |
|---|---|---|
| `CODEOBA_TAURI_UPDATE_PUBLIC_KEY_DEV` | Optional staging public key (overrides default in `tauri.conf.json`). | All (Updater) |
| `CODEOBA_TAURI_UPDATE_PUBLIC_KEY_PROD` | Production public key (compiled into production builds). | All (Updater) |
| `APPLE_ID` | Your Apple Developer email address. | macOS |
| `APPLE_TEAM_ID` | Your 10-character Apple Developer Team ID. | macOS |
| `AZURE_SIGNING_ACCOUNT_NAME` | The name of your Azure Artifact Signing Account. | Windows |
| `AZURE_CERTIFICATE_PROFILE_NAME` | The name of your Azure Certificate Profile. | Windows |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | Azure signing service endpoint (e.g. `https://cus.codesigning.azure.net/`). | Windows |

### 3. CI/CD Linker, Cache, and Notarization Optimizations
To support compilation of native dependencies in Rust (such as `esaxx-rs` and `wasmtime`) and run efficient packaging pipelines across different operating systems, the workflow has been optimized with the following configurations:

* **Dynamic MSVC C Runtime Linking (`ESAXX_DYNAMIC_LINK=1`):**  
  Windows MSVC builds use the dynamic CRT (`/MD`) by default. However, some dependencies like `esaxx-rs` historically force static CRT linking (`/MT`), causing `LNK2038` linker mismatches. The workflow compiles a patched dynamic-link-enabled fork and sets `ESAXX_DYNAMIC_LINK: '1'` globally to ensure consistent CRT linkage.
* **Automatic Workflow Cache Invalidation:**  
  The Rust cache step uses `prefix-key: ${{ hashFiles('.github/workflows/build-desktop.yml') }}`. This automatically invalidates the cache whenever the build configuration or environment variables are modified, preventing stale caching issues.
* **Skip Notarization Polling (`SKIP_STAPLING: 'true'`):**  
  By default, macOS notarization wait times can be highly unpredictable, taking hours for complex binaries that contain JIT compilers or embedded runtimes (such as `wasmtime`). The workflow introduces a global `SKIP_STAPLING` environment variable (default: `'true'`). When enabled, the workflow runs `tauri build -- --skip-stapling`, which submits the bundle to Apple's notarization server but returns immediately. Gatekeeper will verify the notarization online when online macOS clients first run the app. Setting `SKIP_STAPLING` to `'false'` restores full polling and stapling.

---

## 🌐 Localization & Translation Workflow

Codeoba supports multiple interface display languages. To maintain high-quality, context-aware translations while protecting variable interpolations (like `{count}`), the project uses a single-pass delta translation and reconciliation workflow:

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



