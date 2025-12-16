# Repository Guidelines

## Project Structure & Module Organization
- `core/` holds shared Kotlin Multiplatform logic
  - `commonMain` platform agnostic contracts.
  - Keep platform specific code out of `commonMain`.
  - Abstract out any platform specific code.
  - Platform specific implementations under `androidMain`/`desktopMain`/....
- Platform apps:
  - `app-android/` (Android entry/resources)
  - `app-desktop/` (JVM desktop)
  - `app-ios/` (stubbed)
- `docs/` contains architecture, development, and implementation status; Gradle settings and root scripts live at the repo root.

## Build, Test, and Development Commands
- Shared build smoke: `./gradlew :core:build` (required before commit).
- Android: `./gradlew :app-android:assembleDebug` then `:app-android:installDebug` for device/emulator.
- Desktop: `./gradlew :app-desktop:run` for local run, or `:app-desktop:packageDistributionForCurrentOS` for installers.
- Full CI-style check: `./gradlew build` (runs available unit tests across modules).

## Coding Style & Naming Conventions
- Kotlin style with 4-space indent; prefer small, single-purpose functions and meaningful names (verbs for actions, nouns for data).
- Define interfaces in `core/src/commonMain`; implement per platform sourceset; keep platform code out of `commonMain`; Preserve platform abstraction boundaries.
- Use StateFlow for state and SharedFlow for events; suffix flows with `State`/`Events`.
- Add KDoc on public APIs and keep code comments aligned with docs.

## Testing Guidelines
- Place unit tests in `*Test.kt` under the matching module/package; start with shared logic in `core`.
- Run tests via Gradle (`./gradlew :core:build` or module-specific tasks) and cover new flows, errors, and edge cases deterministically.
- Document coverage gaps or manual steps in `docs/IMPLEMENTATION_STATUS.md` when tests are deferred.

## Documentation & Agent Responsibilities
- Keep documentation and code comments in sync with behavior: update `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `README.md` when designs or tooling change; refresh `docs/IMPLEMENTATION_STATUS.md` percentages/prompts as features progress.
- When adding dependencies, record rationale in commits and adjust `docs/ARCHITECTURE.md` if the stack changes; avoid GPL and check for known issues.
- Use the documented hierarchy (README → IMPLEMENTATION_STATUS → ARCHITECTURE → DEVELOPMENT) and ensure all references stay consistent.

## Commit & Pull Request Guidelines
- Commit messages: `<type>: <short summary>` (types: feat, fix, docs, refactor, test, build, chore). Note breaking changes explicitly.
- PRs should describe behavior changes, risks, and linked issues; attach screenshots/GIFs for UI changes when possible.
- Keep changes scoped; avoid mixing unrelated platform and shared edits in one commit unless tightly coupled.

## Security & Configuration Tips
- Never commit secrets. For local Android defaults use `local.properties` (`DANGEROUS_OPENAI_API_KEY=...`); for desktop/CI use `OPENAI_API_KEY` env var or `-Dopenai.api.key`.
- Store GitHub/MCP tokens outside the repo; MCP client is currently stubbed and does not need real tokens.
- Validate new dependencies against policy and prefer stable versions.

## AI Agent Responsibilities

This section defines responsibilities and guidelines for AI agents (GitHub Copilot, coding assistants, etc.) maintaining this codebase.

### 1. Documentation Synchronization

**When making code changes, update documentation:**
- Update `docs/IMPLEMENTATION_STATUS.md` progress tracking table when features are completed
- Keep `docs/ARCHITECTURE.md` accurate with actual implementation
- Update build/setup instructions in `docs/DEVELOPMENT.md` if tooling changes
- Maintain consistency between code comments and external documentation

**Documentation hierarchy:**
1. `README.md` - High-level overview, quick start (keep brief)
2. `docs/IMPLEMENTATION_STATUS.md` - Forward-looking roadmap with AI prompts
3. `docs/ARCHITECTURE.md` - Technical architecture and design decisions
4. `docs/DEVELOPMENT.md` - Setup, build, and configuration instructions

### 2. Progress Tracking Updates

**Update progress table in IMPLEMENTATION_STATUS.md when:**
- A phase or feature is completed
- A task moves from 0% → X% completion
- Implementation approach changes significantly

**Format for updates:**
```markdown
| # | Feature | Completion | Notes |
|---|---------|------------|-------|
| 1 | Feature Name | ~XX% | Status or blocker |
```

Use `~` prefix for approximate percentages.

### 3. Code Quality Standards

**All code changes must:**
- Follow existing architectural patterns (see `docs/ARCHITECTURE.md`)
- Include appropriate error handling
- Add tests for new functionality (when testing infrastructure exists)
- Update type definitions and interfaces as needed
- Maintain platform abstraction boundaries (no Android code in Desktop, etc.)

**Code style:**
- Follow Kotlin coding conventions
- Use meaningful variable/function names
- Add KDoc comments for public APIs
- Keep functions focused and single-purpose

### 4. Testing Requirements

**Before committing:**
- Run `./gradlew :core:build` to verify core module builds
- Run `./gradlew :app-desktop:build` for Desktop changes
- Run `./gradlew :app-android:assembleDebug` for Android changes
- Test manual workflows (connect → capture audio → disconnect)

**When adding new features:**
- Add unit tests in `*Test.kt` files
- Document test coverage gaps in IMPLEMENTATION_STATUS.md
- Include integration test scenarios in AI prompts for future work

### 5. Architectural Consistency

**Maintain these principles:**
- **Platform abstraction:** Shared logic in `:core`, platform-specific in app modules
- **Interface-driven:** Define contracts in commonMain, implement in platform sourcesets
- **Event-driven state:** Use StateFlow for state, SharedFlow for events
- **Single responsibility:** Each class/interface has one clear purpose
- **Dependency injection:** Pass dependencies explicitly, avoid global state

**When adding new features:**
- Define interface in `core/src/commonMain`
- Create platform implementations in respective sourcesets
- Wire dependencies in platform entry points (MainActivity, Main.kt)

### 6. Commit Message Standards

**Format:**
```
<type>: <short summary>

<optional detailed description>

<optional breaking changes>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code restructuring without behavior change
- `test:` Adding or updating tests
- `build:` Build system or dependency changes
- `chore:` Routine tasks, maintenance

### 7. AI Prompt Maintenance

**In IMPLEMENTATION_STATUS.md, update AI prompts when:**
- Implementation approach changes
- New blockers or dependencies are discovered
- Previous prompts become outdated
- A phase is completed (refine next phase prompt)

**Prompt quality checklist:**
- ✅ Clear, actionable steps
- ✅ Specific file paths and function names
- ✅ Technology stack mentioned (Ktor, Compose, etc.)
- ✅ Testing/validation criteria included
- ✅ Effort estimate provided

### 8. Dependency Management

**When adding dependencies:**
- Check for vulnerabilities using `gh-advisory-database` tool
- Document reason in commit message
- Update `docs/ARCHITECTURE.md` Technology Stack section
- Prefer stable versions over bleeding-edge

**Avoid:**
- Duplicating functionality (check existing deps first)
- Adding GPL-licensed dependencies (blocked by CI)
- Dependencies with known security issues

### 9. Error Handling

**All code must:**
- Handle null/empty cases gracefully
- Provide meaningful error messages
- Log errors appropriately (not to console in production)
- Recover from transient failures when possible

**For platform-specific code:**
- Catch platform exceptions and convert to common error types
- Never crash the app on configuration errors (fallback to defaults)

### 10. Breaking Changes

**When making breaking changes:**
- Document in commit message with `BREAKING CHANGE:` footer
- Update affected documentation immediately
- Consider backward compatibility path if possible
- Note migration steps for existing users

## Quick Reference

**Before starting work:**
1. Read `docs/IMPLEMENTATION_STATUS.md` for current status
2. Check AI prompt for the feature you're implementing
3. Review `docs/ARCHITECTURE.md` for design patterns

**During implementation:**
1. Follow architectural principles
2. Write tests
3. Update documentation as you go

**Before committing:**
1. Run builds for affected modules
2. Update progress tracking if feature completed
3. Write clear commit message
4. Verify documentation is current

## Notes

- Git commit history is the source of truth for "what was done"
- IMPLEMENTATION_STATUS.md focuses on "what's next"
- Keep documentation DRY - avoid duplicating information across files
- When in doubt, ask for clarification rather than guessing
