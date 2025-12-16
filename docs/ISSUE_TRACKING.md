# Issue Tracking & Planning System

**Last Updated:** December 16, 2025

This document describes how Codeoba uses GitHub Issues for project planning and tracking.

---

## Table of Contents

- [📋 Planning Philosophy](#-planning-philosophy)
  - [Why This Hybrid Approach?](#why-this-hybrid-approach)
- [🎯 Issue Hierarchy](#-issue-hierarchy)
  - [Level 1: Epic (Phase)](#level-1-epic-phase)
  - [Level 2: Parent Issue (Feature)](#level-2-parent-issue-feature)
  - [Level 3: Sub-Issue (Task)](#level-3-sub-issue-task)
- [🔄 Workflow](#-workflow)
  - [1. Planning Phase Features](#1-planning-phase-features)
  - [2. Implementing a Feature](#2-implementing-a-feature)
  - [3. Completing a Phase](#3-completing-a-phase)
- [🏷️ Label System](#️-label-system)
- [📝 Issue Templates](#-issue-templates)
  - [Parent Issue Template](#parent-issue-template)
  - [Sub-Issue Template](#sub-issue-template)
- [🤖 AI Agent Integration](#-ai-agent-integration)
  - [Using Issues with Copilot](#using-issues-with-copilot)
  - [AI Prompt Best Practices](#ai-prompt-best-practices)
- [🔗 Relationship with IMPLEMENTATION_STATUS.md](#-relationship-with-implementation_statusmd)
  - [Division of Responsibilities](#division-of-responsibilities)
  - [Synchronization](#synchronization)
- [📊 Project Board](#-project-board-optional)
- [🎓 Best Practices](#-best-practices)
- [📚 Examples](#-examples)
- [🔄 Migration Plan](#-migration-plan)
- [Summary](#summary)

---

## 📋 Planning Philosophy

Codeoba uses a **hybrid approach** that combines:

1. **GitHub Issues** - For concrete, actionable work items
2. **IMPLEMENTATION_STATUS.md** - For high-level roadmap and AI prompt library

### Why This Hybrid Approach?

**GitHub Issues are ideal for:**
- Concrete, bounded work items with clear acceptance criteria
- Tracking progress with labels, assignees, and status
- Creating parent/sub-issue relationships for complex features
- Generating a visible project board and burndown
- Linking code changes via PR references
- Team collaboration and discussion

**IMPLEMENTATION_STATUS.md is ideal for:**
- High-level strategic roadmap (Phases 1-5)
- AI agent prompt library (reusable implementation guidance)
- Technology decisions and architectural notes
- Progress percentages and completion tracking
- Quick reference for "what's next" across all phases

---

## 🎯 Issue Hierarchy

Codeoba uses a **three-level hierarchy**:

```
Epic (Phase)
└── Parent Issue (Feature)
    └── Sub-Issue (Task)
```

### Level 1: Epic (Phase)

**Purpose:** Group related features into a major phase of work.

**Examples:**
- Phase 1: Core Realtime Integration
- Phase 2: MCP Protocol Implementation
- Phase 3: iOS Implementation

**Tracking:**
- Documented in IMPLEMENTATION_STATUS.md
- NOT tracked as GitHub Issues (too broad)
- Completion = all child features are done

**Labels:** N/A (not an issue)

---

### Level 2: Parent Issue (Feature)

**Purpose:** A complete, deliverable feature that may require multiple tasks.

**Examples:**
- "Implement Android Audio Streaming Integration"
- "Implement Desktop WebSocket Realtime Client"
- "Implement Audio Playback for Android"

**Structure:**
```markdown
## Summary
[Brief description of the feature]

## Context
[Why this feature is needed, dependencies]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Sub-Issues
- [ ] #123 - Task 1
- [ ] #124 - Task 2
- [ ] #125 - Task 3

## AI Implementation Prompt
[Detailed prompt for AI agents - can reference IMPLEMENTATION_STATUS.md]

## Related Documentation
- Link to IMPLEMENTATION_STATUS.md section
- Link to ARCHITECTURE.md if relevant
```

**Labels:** 
- `feature` (required)
- `phase-1`, `phase-2`, etc. (to link to epic)
- `android`, `ios`, `desktop`, `web` (platform-specific)
- `priority-high`, `priority-medium`, `priority-low`

**Assignee:** @copilot (when ready to implement)

---

### Level 3: Sub-Issue (Task)

**Purpose:** A single, focused task that contributes to a parent feature.

**Examples:**
- "Connect AudioCaptureService to RealtimeClient"
- "Implement PCM audio playback via AudioTrack"
- "Add PTT button event handler"

**Structure:**
```markdown
## Summary
[One-sentence description]

## Parent Issue
Part of #XXX (link to parent)

## Implementation Details
[Specific files, functions, and approach]

## Acceptance Criteria
- [ ] Code change implemented
- [ ] Builds successfully
- [ ] Manual testing passes
- [ ] Documentation updated (if needed)

## Testing
[How to verify the change works]
```

**Labels:**
- `task` (required)
- Same platform/phase labels as parent
- `good-first-issue` (if suitable for new contributors)

**Assignee:** @copilot or developer

---

## 🔄 Workflow

### 1. Planning Phase Features

When starting a new phase (e.g., Phase 1.5):

1. Review IMPLEMENTATION_STATUS.md for the phase roadmap
2. Create Parent Issues for each major feature
3. For complex features, create Sub-Issues
4. Label appropriately
5. Prioritize using project board or labels

### 2. Implementing a Feature

1. Find or create the Parent Issue
2. Read the AI Implementation Prompt
3. Assign to @copilot or yourself
4. Create Sub-Issues if not already created
5. Implement and link PRs
6. Check off acceptance criteria
7. Close when all sub-issues are complete

### 3. Completing a Phase

1. Close all Parent Issues in the phase
2. Update IMPLEMENTATION_STATUS.md:
   - Mark phase tasks as ✅ Complete
   - Update completion percentages
   - Add completion dates
3. Create a summary PR that updates docs
4. Plan next phase

---

## 🏷️ Label System

### Type Labels (Required)
- `epic` - Not used (tracked in IMPLEMENTATION_STATUS.md)
- `feature` - Parent issue representing a feature
- `task` - Sub-issue representing a single task
- `bug` - Bug fix
- `docs` - Documentation only
- `chore` - Maintenance/tooling

### Phase Labels (Optional)
- `phase-1` - Core Realtime Integration
- `phase-2` - MCP Protocol
- `phase-3` - iOS Implementation
- `phase-4` - Web Platform
- `phase-5` - Production Polish

### Platform Labels (Optional)
- `android` - Android-specific
- `ios` - iOS-specific
- `desktop` - Desktop-specific
- `web` - Web-specific
- `core` - Shared core module

### Priority Labels (Optional)
- `priority-high` - Blocking or critical
- `priority-medium` - Important but not blocking
- `priority-low` - Nice to have

### Status Labels (Auto-managed by GitHub)
- `open` - Not started or in progress
- `closed` - Completed

---

## 📝 Issue Templates

### Parent Issue Template

```markdown
## Summary
[Brief description of the feature]

## Context
This feature is part of **Phase X: [Phase Name]** and is needed to [explain why].

**Dependencies:**
- Depends on #XXX (if applicable)
- Blocked by #XXX (if applicable)

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]
- [ ] Documentation updated in IMPLEMENTATION_STATUS.md
- [ ] All sub-issues completed

## Sub-Issues
- [ ] #XXX - [Task 1]
- [ ] #XXX - [Task 2]
- [ ] #XXX - [Task 3]

## AI Implementation Prompt

```
[Detailed prompt for AI agents]

Reference: See IMPLEMENTATION_STATUS.md section [link]
```

## Testing Plan
[How to verify the feature works end-to-end]

## Related Documentation
- IMPLEMENTATION_STATUS.md: [link to section]
- ARCHITECTURE.md: [link to section if relevant]
```

### Sub-Issue Template

```markdown
## Summary
[One-sentence task description]

## Parent Issue
Part of #XXX - [Parent feature name]

## Implementation Details
**Files to modify:**
- `path/to/file1.kt`
- `path/to/file2.kt`

**Approach:**
[Specific implementation approach]

## Acceptance Criteria
- [ ] Code implemented
- [ ] Builds successfully
- [ ] Manual testing passes
- [ ] (Optional) Unit tests added

## Testing
**How to test:**
1. [Step 1]
2. [Step 2]
3. [Expected result]

**Manual verification:**
- [ ] [Verification step 1]
- [ ] [Verification step 2]
```

---

## 🤖 AI Agent Integration

### Using Issues with Copilot

1. **Creating Issues:** Use GitHub CLI or web UI to create issues from templates
2. **Assigning to Copilot:** Use `@copilot` in issue comments to request implementation
3. **Referencing Issues:** Copilot can reference issue numbers in commits and PRs
4. **Closing Issues:** PRs should reference `Closes #XXX` to auto-close when merged

### AI Prompt Best Practices

When writing AI Implementation Prompts in issues:

✅ **DO:**
- Be specific about file paths and function names
- Include expected inputs/outputs
- Reference existing code patterns
- Specify technology stack (Ktor, WebRTC, etc.)
- Include testing/validation steps
- Link to relevant documentation

❌ **DON'T:**
- Write vague prompts like "implement this feature"
- Assume context without providing it
- Skip acceptance criteria
- Forget to mention platform constraints

**Example Good Prompt:**
```
Implement Desktop Realtime client using Ktor WebSocket:

1. File: core/src/desktopMain/kotlin/.../RealtimeClientImpl.kt
2. Use Ktor WebSocket client to connect to wss://api.openai.com/v1/realtime
3. Authenticate with ephemeral token in query parameter: ?model=gpt-4o-realtime-preview-2024-12-17
4. Send session.update JSON event with configuration:
   - Turn detection type: "server_vad"
   - Voice: "alloy"
   - Input audio format: "pcm16"
5. Stream audio frames as base64-encoded in input_audio_buffer.append events
6. Parse incoming JSON events for: session.created, response.audio.delta, conversation.item.created
7. Emit RealtimeEvent sealed class instances via events flow
8. Implement reconnection with exponential backoff
9. Test with Desktop audio capture (JavaSound)
10. Update IMPLEMENTATION_STATUS.md Phase 1 Desktop client status when complete

Reference: See existing Android WebRTC implementation pattern in core/src/androidMain/.../RealtimeClientImpl.kt
```

---

## 🔗 Relationship with IMPLEMENTATION_STATUS.md

### Division of Responsibilities

| Aspect | IMPLEMENTATION_STATUS.md | GitHub Issues |
|--------|-------------------------|---------------|
| **Roadmap** | ✅ High-level phases 1-5 | ❌ Too granular |
| **AI Prompts** | ✅ Library of prompts | ✅ Per-feature prompts |
| **Progress %** | ✅ Phase completion % | ❌ Uses open/closed |
| **Work Items** | ❌ Too detailed | ✅ Parent/sub-issues |
| **Discussions** | ❌ Static document | ✅ Issue comments |
| **Blocking** | ❌ Manual tracking | ✅ Depends on #XXX |
| **Assignees** | ❌ N/A | ✅ Assign to users |
| **PR Linking** | ❌ Manual | ✅ Auto-closes |

### Synchronization

**IMPLEMENTATION_STATUS.md should:**
- List phases and high-level roadmap
- Provide AI prompt library for each phase
- Track completion percentages
- Link to GitHub Issues for detailed work items

**Example:**
```markdown
### Phase 1.5: Complete Phase 1 Features

**Goal:** Finish Phase 1 by implementing audio streaming, playback, PTT, text input

**Status:** 🟡 In Progress (see #13, #14, #15, #16 for detailed tasks)

**Completion:** ~30%

**Priority Tasks:**
1. **Android Audio Streaming Integration** (~2 days) → Issue #13
2. **Android Audio Playback** (~1-2 days) → Issue #14
3. **Android PTT & Text Input** (~1 day) → Issue #15
4. **Desktop WebSocket Client** (~2 days) → Issue #16
```

---

## 📊 Project Board (Optional)

For visual tracking, consider using GitHub Projects:

**Columns:**
- Backlog (not prioritized)
- Ready (prioritized, not started)
- In Progress (assigned and active)
- In Review (PR open)
- Done (closed)

**Automation:**
- Issues move to "In Progress" when assigned
- Issues move to "In Review" when PR opened
- Issues move to "Done" when closed

---

## 🎓 Best Practices

### DO:
- ✅ Create parent issues for features (2-5 days of work)
- ✅ Break complex features into sub-issues (0.5-1 day each)
- ✅ Use labels consistently
- ✅ Link issues to PRs with "Closes #XXX"
- ✅ Keep IMPLEMENTATION_STATUS.md synced with issue status
- ✅ Write detailed AI prompts in issues
- ✅ Update acceptance criteria as you learn

### DON'T:
- ❌ Create issues for every tiny change (< 1 hour)
- ❌ Use issues for discussions (use Discussions tab)
- ❌ Forget to close issues when work is done
- ❌ Mix multiple features in one parent issue
- ❌ Leave stale issues open forever
- ❌ Duplicate information between docs and issues

---

## 📚 Examples

See the following issues as examples:

- **Parent Issue Example:** #13 - Implement Android Audio Streaming Integration
- **Sub-Issue Example:** #13.1 - Connect AudioCaptureService to RealtimeClient
- **Bug Example:** (TBD when we have bugs)

---

## 🔄 Migration Plan

To transition from the old approach:

1. ✅ Create this ISSUE_TRACKING.md document
2. ✅ Update IMPLEMENTATION_STATUS.md to reference issues
3. Create parent issues for Phase 1.5 tasks
4. Create sub-issues for complex features
5. Update AGENTS.md to reference this workflow
6. Add issue templates to `.github/ISSUE_TEMPLATE/`

---

## Summary

**Use GitHub Issues for:**
- Tracking concrete work items
- Team collaboration
- Progress visibility
- PR linkage

**Use IMPLEMENTATION_STATUS.md for:**
- Strategic roadmap
- AI prompt library
- High-level status
- Architecture notes

**Together, they provide:**
- Clear planning at all levels
- Efficient AI agent guidance
- Visible progress tracking
- Maintainable documentation
