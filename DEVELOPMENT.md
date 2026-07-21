# Codeoba — Developer & Contributor Guide

This document contains all development-related guidelines, building instructions, and release pipeline setup information for Codeoba. If you are a user looking to install and run the application, please refer to the main [README.md](./README.md).

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
   ```
   ```powershell
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
# Standard dev launch
npm run tauri dev

# Dev launch with a custom local updater and CSP base URL
npm run tauri dev -- --base-url=http://localhost:5000

# Dev launch in release mode
npm run tauri dev -- --release
```
*This command invokes our Node.js configuration wrapper (`scripts/tauri.cjs`), which spawns Vite on port `1420` and loads the SolidJS UI. If `--base-url` is passed, the wrapper dynamically appends the URL to the frontend's CSP (`connect-src`) and sets the active update check endpoint at compile time without modifying git-tracked files.*

---

## 📖 Command-Line Interface (CLI) Usage

Codeoba can be configured or executed directly from your terminal using custom command-line options.

### 1. Terminal Search (Headless CLI)
You can run search operations directly in your shell without spawning the desktop graphical interface:
```bash
# Perform a standard lexical (keyword-based) search
cargo run --manifest-path src-tauri/Cargo.toml -- search "your search query"
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
*   **`src-tauri/` (Backend)**: Rust crate that manages directory watchers (`notify`), SQLite workspace parsers (`rusqlite`), and local app configuration (`config.rs`).

---

## 🏁 Pre-Commit & Check-in Checklist

To maintain clean code and prevent build regressions, all changes must pass static analysis and formatting tests prior to being committed or pushed. The repository is equipped with a comprehensive validation suite accessible via root-level NPM commands.

### 1. Verification Scripts

Run the following commands in the root of the project to check and format your code:

*   **Run formatting auto-fixes (Frontend & Backend):**
    ```bash
    npm run format
    ```
    *(Runs `prettier --write` on frontend files and `cargo fmt` on Rust files).*
*   **Run ESLint static analysis (Frontend):**
    ```bash
    npm run lint:fe
    ```
*   **Run Clippy static analysis (Backend):**
    ```bash
    npm run clippy
    ```
*   **Run full lint pipeline (Frontend + Backend formatting and static analysis):**
    ```bash
    npm run lint
    ```
    *(Checks formatting and runs static analysis on all files. This is the command run by the pre-commit hook).*
*   **Run complete QA suite (Lints + Cargo Tests + Frontend build validation):**
    ```bash
    npm run qa
    ```
    *(Always run `npm run qa` before pushing code or submitting a pull request to ensure CI will pass).*

### 2. Automatically Enforcing Checks via Git Hooks

To guarantee formatting and lint checks are run and prevent accidental check-ins of formatting issues, the repository is configured to automatically set up local git hooks when running standard package installation (`npm install`).

The `"prepare"` script in `package.json` executes the path configuration behind the scenes:
```bash
git config core.hooksPath .githooks
```

Once dependencies are installed locally, any `git commit` will automatically invoke `npm run lint` and block the commit if any formatting or static analysis issues are detected.

---

## 🔄 Auto-Updates & CI/CD Release Pipeline

Codeoba features secure, cryptographically-signed auto-updates hosted on GitHub Releases, powered by the Tauri v2 Updater.

### 1. Cryptographic Update Signing
By default, the repository's [tauri.conf.json](src-tauri/tauri.conf.json) is security-hardened for local development. The updater is disabled (`"active": false`), the public key is cleared (`"pubkey": ""`), and the updater endpoints list is completely empty (`"endpoints": []`).

During tagged production or staging builds, the CI pipeline automatically calls `sync-version.cjs` to rewrite this configuration, enabling the updater and pointing it to:
* **Staging:** `https://dev.codeoba.com/api/update`
* **Production:** `https://codeoba.com/api/update`

This proxy handles client telemetry logging and retrieves the signed `latest.json` bundle configuration directly from GitHub Releases. Update packages must be signed using a **Minisign** keypair:
*   The public key is configured inside [tauri.conf.json](src-tauri/tauri.conf.json) under `plugins.updater.pubkey`.
*   The private key is stored locally (ignored by Git) and must be provided as an environment variable (`TAURI_SIGNING_PRIVATE_KEY`) to compile updates.

#### Local/Staging Testing
To test update checking and download progress triggers locally (against either `dev.codeoba.com` or a local mock server on `localhost`), you can run the app with the compile-time `--base-url` flag:

```bash
# Directs the updater to localhost:5000 and expands the CSP to allow connection
npm run tauri dev -- --base-url=http://localhost:5000
```
```bash
# Directs the updater to dev.codeoba.com and expands the CSP to allow connection
npm run tauri dev -- --base-url=https://dev.codeoba.com
```

You must also follow the verification and key registration steps documented in the [Local & Staging Update Testing Guide](docs/APP_SIGNING.md#🧪-local--staging-update-testing-guide).

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
       *The pipeline compiles the stable binary using the tag name as the compiled version (e.g., `0.1.3`), uploads the production `latest.json` manifest directly to the release page, and prunes any leftover development pre-releases to keep the release history clean.*

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

## 🧪 Native macOS Menu Features & Alignment Testing

Codeoba uses native operating system menus (drawn by the macOS Window Server or Windows/Linux shell) which exist outside the webview DOM. 

### 1. The Help Menu Developer Feature Flag (`enable-help-menu`)
By default, on macOS, native help search boxes swallow key events during local development. To prevent local developer debug friction, the **Help** menu is compiled out by default in local debug modes.
*   To force-enable the Help menu during local development (e.g. to inspect or test it), run the dev command with the `enable-help-menu` feature flag:
    ```bash
    npm run tauri dev -- --features enable-help-menu
    ```
    Or when using Cargo directly:
    ```bash
    cargo run --manifest-path src-tauri/Cargo.toml --features enable-help-menu
    ```

### 2. macOS Shortcut Alignment & Tab Stops
On macOS, alternate keyboard shortcuts (like `(fn+◀)`) are right-justified in the native menu dropdowns. Since these menu items are drawn by the OS, their alignment is managed by placing `\t` tab-stops directly in the translation files (e.g. `src/i18n/locales/en.json`) under layout keys like `sidebar_menu` or `home_menu_suffix`.
*   **Platform Conditional**: These tab suffixes are compiled and loaded **only on macOS** targets (`cfg!(target_os = "macos")`). On Windows and Linux, the application automatically strips tab-stops and alternate indicators to conform with native Windows/Linux keyboard standards.

### 3. Running the Automated Menu Alignment Test
To ensure that alternate shortcut keys align to the exact same vertical column across all languages and translations, you can run the automated GUI pixel scanner:
1.  Launch the Codeoba application (e.g. `npm run tauri dev`).
2.  In a separate terminal window, run:
    ```bash
    npm run test:menu
    ```
    This script programmatically uses AppleScript to click open the menu, captures a BMP screenshot of the dropdown coordinates, scans the text column bounds right-to-left, and asserts that they align within a 3px tolerance.
*   **Testing Specific Locales**: To test a specific language locale, pass the locale code as an argument to the test script:
    ```bash
    npm run test:menu es
    ```
*   **Correction Advisor**: If an item is staggered, the test calculates the offset relative to a standard 24px tab stop width and outputs a clear correction recommendation:
    ```text
    ❌ Detail Pane: Page Down       : Staggered (current: 224px, delta: 24px). Needs 1 more \t character(s).
    ```

---

## 📝 Logging Guidelines

Codeoba uses a unified logging system across the Rust backend and the SolidJS frontend. To keep production logs clean of noise while retaining deep troubleshooting info during development, adhere to these guidelines:

### 1. Backend Rust Logging Macros
Macros are defined in [logging.rs](file:///Users/pv/Dev/GitHub/LookAtWhatAiCanDo/Codeoba-All/Codeoba/src-tauri/src/logging.rs):
- `crate::log_info!`, `crate::log_warn!`, `crate::log_error!`: Log messages to stdout/stderr in all build configurations. Use for critical lifecycles (startup, DB modifications, network updates, and errors).
- `crate::log_debug!`, `crate::log_trace!`: Conditionally compiled logs wrapper inside `#[cfg(debug_assertions)]`. In production (`--release`) builds, these statements compile out completely (zero overhead). Use for high-frequency logs (file watcher loops, database change delta checks, and timing metrics).

### 2. Frontend Logging (`logFE`)
Defined in [logger.ts](file:///Users/pv/Dev/GitHub/LookAtWhatAiCanDo/Codeoba-All/Codeoba/src/utils/logger.ts):
```typescript
import { logFE } from "./utils/logger";

logFE("info" | "warn" | "error" | "debug" | "trace", "your log message");
```
- `"info"`, `"warn"`, `"error"`: Output to the browser console and forward to the backend's standard logger macros.
- `"debug"`, `"trace"`: Output to the browser console as `console.debug`/`console.trace` and forward to backend `log_debug!`/`log_trace!` macros (meaning they compile out in release builds). Use for styling details, rendering metrics, and interface state logs.

---

## 🌐 Localization & Translation Workflow

For details on how to translate the application interface or run the Gemini-powered automated translation scripts, please see the [Contributing Translations section in CONTRIBUTING.md](./CONTRIBUTING.md#🌐-contributing-translations).
