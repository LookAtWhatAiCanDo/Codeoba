# Phase 3 Manual Testing Guide

This document provides instructions for manually testing the GitHub MCP client implementation.

## Prerequisites

1. **GitHub Personal Access Token**
   - Go to https://github.com/settings/tokens
   - Click "Generate new token" → "Generate new token (classic)"
   - Give it a descriptive name (e.g., "Codeoba MCP Testing")
   - Select scopes:
     - `repo` - Full control of private repositories
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again)

2. **OpenAI API Key**
   - Required for Realtime API connection
   - Get from https://platform.openai.com/api-keys

## Configuration

### Option 1: local.properties (Recommended for Development)

Create/edit `local.properties` in the project root:

```properties
# OpenAI API key for Realtime API
DANGEROUS_OPENAI_API_KEY=sk-your-openai-key-here

# GitHub token for MCP operations
DANGEROUS_GITHUB_TOKEN=ghp-your-github-token-here
```

### Option 2: Environment Variables (Desktop)

```bash
export OPENAI_API_KEY=sk-your-openai-key-here
export GITHUB_TOKEN=ghp-your-github-token-here
```

### Option 3: System Properties (Desktop)

```bash
./gradlew :app-desktop:run \
  -Dopenai.api.key=sk-your-key \
  -Dgithub.token=ghp-your-token
```

## Running the Application

### Desktop

```bash
./gradlew :app-desktop:run
```

### Android

```bash
./gradlew :app-android:installDebug
# Then launch the app on your device/emulator
```

## Testing Flow

### 1. Verify MCP Client Initialization

**Expected:** Check the event log for MCP client initialization message:
- ✅ "MCP client initialized" - Success
- ℹ️ "MCP client initialization deferred: ..." - Token not configured or network issue

### 2. Connect to Realtime API

1. Toggle the "Connect" switch in the titlebar
2. Wait for connection establishment

**Expected:** Event log shows:
- "Connecting to https://api.openai.com/v1/realtime..."
- "Connected to Realtime API"

### 3. Test Voice Input (Push-to-Talk)

1. Press and hold the large blue "Push to Talk" button
2. Speak a command, e.g., "List my GitHub repositories"
3. Release the button

**Expected:**
- Button turns red while pressed
- Microphone captures audio
- Transcript appears in event log when AI responds

### 4. Test MCP Tool Call

Speak a command that triggers a GitHub operation, for example:

- "Create a new issue in my test repository"
- "List the files in the main branch of my project"
- "Show me recent commits"

**Expected flow in event log:**
1. Transcript of your command
2. Tool call event (e.g., `github_list_repos`, `github_create_issue`)
3. Tool result (success or error message from GitHub)

### 5. Test Text Input

1. Type a GitHub command in the text input field
2. Press Enter or click send

**Example commands:**
- "List my repositories"
- "Create an issue titled 'Test Issue' in repo/name"

**Expected:**
- Text message sent to Realtime API
- AI processes the request
- Tool call triggered if applicable
- Result displayed in event log

## Expected Tool Discovery

On successful initialization, the MCP client should discover GitHub tools:

Check logs for messages like:
```
MCP Client: Discovered tool: github_list_repos
MCP Client: Discovered tool: github_create_issue
MCP Client: Discovered tool: github_get_file
...
MCP Client: Discovered N tools
```

The exact tools available depend on the GitHub MCP server's current implementation.

## Troubleshooting

### MCP client initialization fails

**Symptoms:**
- "MCP client initialization deferred: Failed to connect to MCP server"
- "Network error: Connection refused"

**Solutions:**
1. Verify GitHub token is valid and has correct scopes
2. Check internet connectivity
3. Verify MCP server URL is correct: `https://api.githubcopilot.com/mcp/`
4. Check firewall/proxy settings

### Tool call fails

**Symptoms:**
- "Unknown tool: <name>" in event log
- "Tool execution failed: <error>" in event log

**Solutions:**
1. Ensure MCP client initialized successfully
2. Check tool discovery completed (see logs for "Discovered N tools")
3. Verify GitHub token permissions are sufficient
4. Check that the repository/resource exists and is accessible

### Token not found

**Symptoms:**
- "GitHub token not configured" in event log
- MCP features disabled message

**Solutions:**
1. Check `local.properties` exists and contains `DANGEROUS_GITHUB_TOKEN`
2. Verify token is not empty or whitespace
3. For desktop, try environment variable: `export GITHUB_TOKEN=...`
4. Rebuild/restart the application after adding token

## Success Criteria

✅ **Phase 3 is working correctly if:**

1. MCP client initializes without errors
2. Tool discovery completes and lists available GitHub tools
3. Voice commands trigger tool calls
4. Tool calls execute and return results (success or error)
5. Results are displayed in the event log
6. No crashes or exceptions during MCP operations

## Known Limitations

- Desktop Realtime API uses stub implementation (no actual WebRTC connection yet)
- Android Realtime API should work with full WebRTC
- Tool availability depends on GitHub MCP server's current implementation
- Some complex GitHub operations may require additional permissions

## Next Steps

After successful manual testing:

1. Document any issues found in GitHub Issues
2. Test with different GitHub operations
3. Verify error handling with invalid tokens/requests
4. Test integration with Phase 2 audio features (Android)
5. Consider adding automated integration tests

## Reporting Issues

When reporting issues, please include:

1. Platform (Desktop/Android)
2. Steps to reproduce
3. Expected vs actual behavior
4. Relevant event log entries
5. Error messages from console/logcat
6. GitHub token scopes (without revealing the actual token)

---

**Last Updated:** December 25, 2025
**Phase 3 Status:** ✅ Implementation Complete, Ready for Manual Testing
