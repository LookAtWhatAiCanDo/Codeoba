# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the Codeoba project.

## Workflows

### 🔨 CI Build (`ci.yml`)

**Triggers:**
- Push to `main`, `develop`, or any `copilot/**` branch
- Pull requests to `main` or `develop`
- Manual trigger via workflow_dispatch

**Jobs:**
1. **build-core** - Builds the `:core` Kotlin Multiplatform module
2. **build-desktop** - Builds the `:app-desktop` module
3. **test** - Runs all tests across modules
4. **package-desktop** - Packages desktop distributions for Linux, macOS, and Windows
5. **code-quality** - Runs code quality checks (detekt, ktlint if configured)
6. **build-status** - Aggregates status of all jobs

**Artifacts:**
- Core build artifacts (7 days retention)
- Desktop build artifacts (7 days retention)
- Test results (7 days retention)
- Desktop packages for each OS (7 days retention)

### 📦 Release (`release.yml`)

**Triggers:**
- Git tags matching `v*` (e.g., `v1.0.0`)
- Manual trigger with version input

**Jobs:**
1. **build-and-release** - Builds and packages for all platforms (Linux, macOS, Windows)
2. **create-release** - Creates GitHub release with distribution packages

**Artifacts:**
- OS-specific distribution packages (7 days retention)
- Attached to GitHub releases

**Usage:**
```bash
# Create and push a tag
git tag v1.0.0
git push origin v1.0.0

# Or trigger manually from GitHub Actions UI
```

### 🔒 Security and Dependencies (`security.yml`)

**Triggers:**
- Weekly schedule (Monday 8:00 AM UTC)
- Push to `main`
- Pull requests to `main`
- Manual trigger

**Jobs:**
1. **dependency-check** - OWASP dependency vulnerability scan
2. **codeql-analysis** - CodeQL security analysis for Java/Kotlin (requires GitHub Advanced Security)
3. **dependency-review** - Reviews dependency changes in PRs (requires GitHub Advanced Security)
4. **gradle-wrapper-validation** - Validates Gradle wrapper integrity

**Security Features:**
- Scans for known vulnerabilities in dependencies
- Analyzes code for security issues
- Blocks PRs with moderate+ severity vulnerabilities
- Rejects GPL-2.0 and GPL-3.0 licenses

**⚠️ Important Notes:**
- **CodeQL** and **Dependency Review** require GitHub Advanced Security to be enabled
- These features are available on:
  - GitHub Enterprise Cloud/Server
  - Public repositories in GitHub Free (with some limitations)
  - Private repositories with GitHub Advanced Security enabled
- Jobs will gracefully skip or continue on error if Advanced Security is not available
- To enable: Go to repository Settings → Security & analysis → Enable features

### 📚 Documentation (`docs.yml`)

**Triggers:**
- Push to `main` with changes to docs, README, or any markdown files
- Manual trigger

**Jobs:**
1. **build-docs** - Builds documentation site from markdown files
2. **deploy-docs** - Deploys to GitHub Pages (main branch only)

**Published Documentation:**
- Architecture Overview
- Development Setup Guide
- Android Module Status
- MVP Implementation Summary
- Framework Evaluation
- README

**Accessing Docs:**
Visit: `https://<username>.github.io/Codeoba/` (after enabling GitHub Pages)

## Environment Variables

All workflows use these Gradle options for consistency:
```yaml
env:
  GRADLE_OPTS: -Dorg.gradle.daemon=false -Dorg.gradle.parallel=true -Dorg.gradle.caching=true
```

## Required Secrets

No secrets are currently required for these workflows. Future additions may include:
- `OPENAI_API_KEY` - For integration tests with OpenAI Realtime API
- `GITHUB_TOKEN` - Automatically provided for releases
- Signing keys for mobile app distribution

## Branch Protection Rules

Recommended branch protection for `main`:
- ✅ Require pull request reviews (1 approver)
- ✅ Require status checks to pass:
  - `build-core`
  - `build-desktop`
  - `test`
  - `codeql-analysis`
- ✅ Require branches to be up to date
- ✅ Include administrators

## Workflow Badges

Add to README.md:

```markdown
[![CI Build](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/ci.yml/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/ci.yml)
[![Security](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/security.yml/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/security.yml)
[![Documentation](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/docs.yml/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/docs.yml)
```

## Customization

### Adding Android Builds

When Android module is re-enabled, add to `ci.yml`:

```yaml
build-android:
  name: Build Android App
  runs-on: ubuntu-latest
  needs: build-core
  
  steps:
  - name: Checkout code
    uses: actions/checkout@v4
    
  - name: Set up JDK 17
    uses: actions/setup-java@v4
    with:
      java-version: '17'
      distribution: 'temurin'
      cache: gradle
      
  - name: Grant execute permission for gradlew
    run: chmod +x gradlew
    
  - name: Build Android APK
    run: ./gradlew :app-android:assembleDebug --no-daemon --stacktrace
    
  - name: Upload APK
    uses: actions/upload-artifact@v4
    with:
      name: android-debug-apk
      path: app-android/build/outputs/apk/debug/*.apk
      retention-days: 7
```

### Adding Code Coverage

Add to `ci.yml` test job:

```yaml
- name: Generate coverage report
  run: ./gradlew jacocoTestReport --no-daemon
  
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./build/reports/jacoco/test/jacocoTestReport.xml
```

### Custom Lint Rules

Add before test job in `ci.yml`:

```yaml
lint:
  name: Lint Check
  runs-on: ubuntu-latest
  
  steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-java@v4
    with:
      java-version: '17'
      distribution: 'temurin'
      cache: gradle
  - run: chmod +x gradlew
  - run: ./gradlew lint --no-daemon
  - uses: actions/upload-artifact@v4
    if: always()
    with:
      name: lint-results
      path: '**/build/reports/lint-results*.html'
```

## Troubleshooting

### Build Timeouts
If builds timeout, increase the timeout:
```yaml
timeout-minutes: 30  # Default is 360 (6 hours)
```

### Cache Issues
Clear caches from GitHub Actions UI or add to workflow:
```yaml
- name: Clear Gradle cache
  run: rm -rf ~/.gradle/caches
```

### macOS Build Issues
For macOS-specific issues, check Xcode version:
```yaml
- name: Select Xcode version
  run: sudo xcode-select -s /Applications/Xcode_15.0.app
```

### CodeQL/Dependency Review Errors

**Error:** "Advanced Security must be enabled for this repository to use code scanning"

**Cause:** CodeQL and Dependency Review require GitHub Advanced Security features.

**Solutions:**
1. **Enable Advanced Security:**
   - Go to Settings → Security & analysis
   - Enable "Dependency graph" and "Dependabot alerts"
   - For private repos: Enable "GitHub Advanced Security"
   
2. **Workflow already handles this:**
   - Jobs use `continue-on-error: true` to prevent workflow failure
   - Jobs conditionally skip when features aren't available
   - No action needed - workflows will work without Advanced Security

3. **Alternative for public repos:**
   - Most public repos have access to some security features automatically
   - If errors persist, ensure repository visibility is set correctly

**Note:** These security features are optional. The CI/build workflows will still succeed without them.

## Monitoring

- View workflow runs: `Actions` tab in GitHub
- Check status: Workflow badges in README
- Review artifacts: In individual workflow run pages
- Security alerts: `Security` → `Code scanning alerts`

## Contributing

When adding new workflows:
1. Test locally with [act](https://github.com/nektos/act) if possible
2. Start with `workflow_dispatch` trigger for testing
3. Document in this README
4. Add appropriate caching for dependencies
5. Set reasonable artifact retention periods
