# MCP Configuration Guide

This guide explains how to configure and use the Model Context Protocol (MCP) integration in Codeoba.

## Overview

Codeoba uses the Model Context Protocol (MCP) to execute GitHub operations from voice commands. The MCP implementation uses a **dynamic tool registry pattern** for extensibility:

- **Dynamic Tool Registry**: Tools are registered at runtime, making it easy to add new operations
- **Tool Handler Interface**: Each tool implements `McpToolHandler` with schema, validation, and execution
- **5 Built-in GitHub Operations**: Open repositories, create/edit files, create branches, create pull requests
- **Approval Flow**: Sensitive operations require user approval before execution
- **Retry Logic**: Automatic retry with exponential backoff for transient failures
- **Error Handling**: Comprehensive error messages and validation

### Extensibility

The dynamic registry makes it easy to add new tools:

```kotlin
// Custom tool handler
class MyCustomToolHandler : McpToolHandler {
    override val name = "my_custom_tool"
    override val description = "My custom operation"
    override val requiresApproval = true
    override val inputSchema = buildJsonObject { /* schema */ }
    
    override suspend fun execute(args: JsonObject, context: McpToolContext): McpResult {
        // Implementation
    }
}

// Register the tool
mcpClient.registerTool(MyCustomToolHandler())
```

This allows Codeoba to adapt to GitHub's expanding MCP protocol without code changes.

## Prerequisites

### GitHub Personal Access Token

You need a GitHub Personal Access Token (PAT) with the following permissions:

- `repo` - Full control of private repositories
- `workflow` - Update GitHub Action workflows (if needed)

**To create a token:**

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name like "Codeoba MCP Integration"
4. Select scopes: `repo` (and optionally `workflow`)
5. Click "Generate token"
6. **Copy the token immediately** (you won't see it again)

### Environment Variable Configuration

Set the `GITHUB_TOKEN` environment variable with your GitHub PAT:

**Linux/macOS:**
```bash
export GITHUB_TOKEN=ghp_your_token_here
```

**Windows (PowerShell):**
```powershell
$env:GITHUB_TOKEN="ghp_your_token_here"
```

**Windows (Command Prompt):**
```cmd
set GITHUB_TOKEN=ghp_your_token_here
```

For persistent configuration, add to your shell profile:
- Linux/macOS: Add to `~/.bashrc`, `~/.zshrc`, or `~/.profile`
- Windows: Set via System Properties → Environment Variables

**Android:**
```bash
# Set before running the app
export GITHUB_TOKEN=ghp_your_token_here
./gradlew :app-android:installDebug
```

**Desktop:**
```bash
export GITHUB_TOKEN=ghp_your_token_here
./gradlew :app-desktop:run
```

## Available MCP Tools

### 1. open_repo

Opens or clones a GitHub repository.

**Parameters:**
- `repoUrl` (required): GitHub repository URL (e.g., `https://github.com/owner/repo`)
- `branch` (optional): Branch to checkout (defaults to repository default branch)

**Example:**
```json
{
  "repoUrl": "https://github.com/LookAtWhatAiCanDo/Codeoba",
  "branch": "main"
}
```

**Approval:** Not required (read-only operation)

### 2. create_file

Creates a new file in the currently opened repository.

**Parameters:**
- `path` (required): File path relative to repository root
- `content` (required): File content
- `message` (optional): Commit message (defaults to "Create {path}")

**Example:**
```json
{
  "path": "src/NewFile.kt",
  "content": "package com.example\n\nfun main() {\n    println(\"Hello\")\n}",
  "message": "Add new Kotlin file"
}
```

**Approval:** Required (destructive operation)

### 3. edit_file

Edits an existing file in the currently opened repository.

**Parameters:**
- `path` (required): File path relative to repository root
- `content` (required): New file content
- `message` (optional): Commit message (defaults to "Update {path}")

**Example:**
```json
{
  "path": "README.md",
  "content": "# Updated README\n\nThis is the new content.",
  "message": "Update documentation"
}
```

**Approval:** Required (destructive operation)

### 4. create_branch

Creates a new branch in the currently opened repository.

**Parameters:**
- `branchName` (required): Name of the new branch
- `fromBranch` (optional): Source branch (defaults to current branch)

**Example:**
```json
{
  "branchName": "feature/new-feature",
  "fromBranch": "main"
}
```

**Approval:** Required

### 5. create_pr

Creates a pull request in the currently opened repository.

**Parameters:**
- `title` (required): Pull request title
- `body` (required): Pull request description
- `headBranch` (required): Source branch for the pull request
- `baseBranch` (optional): Target branch (defaults to "main")

**Example:**
```json
{
  "title": "Add new feature",
  "body": "This PR adds a new feature that...",
  "headBranch": "feature/new-feature",
  "baseBranch": "main"
}
```

**Approval:** Required

## Approval Flow

### Operations Requiring Approval

The following operations require user approval before execution:
- `create_file`
- `edit_file`
- `create_branch`
- `create_pr`

### Approval Process

1. **Request Generated**: When a sensitive operation is requested, an approval request is generated
2. **User Notification**: The user is notified via the event log
3. **User Response**: User approves or denies the operation (30-second timeout)
4. **Execution**: If approved, the operation executes; if denied or timeout, operation fails

### Auto-Approval

Read-only operations like `open_repo` are automatically approved without user intervention.

## Retry Logic

All GitHub API operations include automatic retry logic for transient failures:

- **Maximum Attempts**: 3
- **Initial Delay**: 1 second
- **Maximum Delay**: 10 seconds
- **Backoff Factor**: 2.0 (exponential backoff)

**Retryable Errors:**
- HTTP 5xx (server errors)
- HTTP 429 (rate limit exceeded)
- HTTP 408 (request timeout)
- Network timeouts and connection errors

## Error Handling

### Common Errors

**"GITHUB_TOKEN environment variable not set"**
- Solution: Set the `GITHUB_TOKEN` environment variable with your GitHub PAT

**"No repository opened. Use open_repo first."**
- Solution: Open a repository with `open_repo` before performing file/branch/PR operations

**"Failed to open repository: [error message]"**
- Possible causes: Invalid URL, insufficient permissions, repository doesn't exist
- Solution: Check repository URL and GitHub token permissions

**"Operation denied: [reason]"**
- User denied the approval request
- Solution: Approve the operation if intended

**"Approval timeout: No response received"**
- User didn't respond to approval request within 30 seconds
- Solution: Retry the operation and respond promptly

**"File not found: [path]"**
- File doesn't exist when trying to edit
- Solution: Use `create_file` instead, or verify the file path

**"Failed to create pull request: [error]"**
- Possible causes: Branch doesn't exist, PR already exists, no changes between branches
- Solution: Verify branch exists and has changes

## Repository Context

The MCP client maintains context about the currently opened repository:

- **Owner**: Repository owner username or organization
- **Repo**: Repository name
- **Branch**: Current working branch

This context is established by the `open_repo` operation and used by subsequent operations.

**Example Flow:**
1. `open_repo` → Sets context to `owner=LookAtWhatAiCanDo`, `repo=Codeoba`, `branch=main`
2. `create_file` → Creates file in `LookAtWhatAiCanDo/Codeoba` on branch `main`
3. `create_branch` → Creates branch in the same repository
4. `create_pr` → Creates PR in the same repository

## Security Considerations

### Token Security

- **Never commit tokens to source code**
- **Use environment variables** for token configuration
- **Rotate tokens regularly** for security
- **Use minimal permissions** - only grant necessary scopes

### Approval Requirements

Approval requirements prevent accidental destructive operations:

- All write operations require approval
- Read operations are auto-approved
- 30-second timeout prevents indefinite blocking

### Error Messages

Error messages do not expose sensitive information like tokens or internal paths.

## Troubleshooting

### Build Errors

If you get build errors related to MCP:

```bash
# Clean and rebuild
./gradlew clean
./gradlew :app-desktop:build
```

### Token Permission Issues

If GitHub API calls fail with 403 or 401:

1. Verify token is set correctly: `echo $GITHUB_TOKEN`
2. Check token permissions on GitHub
3. Regenerate token if needed

### Network Issues

If operations timeout frequently:

- Check internet connection
- Verify GitHub API is accessible
- Check for rate limiting (GitHub API has rate limits)

## Implementation Details

### Architecture

```
Voice Command → OpenAI Realtime API → Tool Call Event → MCP Client
                                                             ↓
                                                      Tool Registry
                                                             ↓
                                                   Tool Handler (dynamic)
                                                             ↓
                                                       Approval Flow
                                                             ↓
                                                        Retry Logic
                                                             ↓
                                                        GitHub API
                                                             ↓
                                                      Result/Error
```

### Dynamic Tool Registry

The MCP implementation uses a registry pattern for maximum flexibility:

1. **Tool Handlers**: Each operation implements `McpToolHandler` interface
2. **Registration**: Tools are registered in `McpClientImpl` initialization
3. **Discovery**: `getAllToolDefinitions()` returns all registered tools
4. **Execution**: Tools are invoked dynamically by name
5. **Extensibility**: New tools can be added without modifying core logic

**Key Benefits:**
- Easy to add new GitHub operations as they become available
- Tools are self-contained with their own schemas and validation
- Type-safe execution within each handler
- Approval policy defined per-tool

### Key Components

- **McpClientImpl**: Main MCP client with tool registry
- **McpToolRegistry**: Central registry for all tools
- **McpToolHandler**: Interface for tool implementations
- **GitHubToolHandlers**: Implementations of 5 GitHub operations
- **GitHubApiClientImpl**: GitHub REST API v3 client
- **ApprovalManager**: Manages approval requests/responses
- **RetryPolicy**: Handles retry logic with exponential backoff
- **McpToolSchemas**: JSON Schema definitions (deprecated, now in handlers)

### Files

Located in `core/src/commonMain/kotlin/llc/lookatwhataicando/codeoba/core/data/mcp/`:
- `McpClientImpl.kt` - Main implementation with tool registry
- `McpToolRegistry.kt` - Dynamic tool registry
- `handlers/GitHubToolHandlers.kt` - GitHub operation handlers
- `GitHubApiClient.kt` - API interface
- `GitHubApiClientImpl.kt` - API implementation
- `ApprovalManager.kt` - Approval flow
- `RetryPolicy.kt` - Retry logic
- `McpToolSchemas.kt` - Legacy schema definitions (for backward compatibility)
- `JsonRpcProtocol.kt` - Protocol messages

## Future Enhancements

Planned improvements for MCP integration:

- [ ] Support for GitHub Enterprise
- [ ] Support for GitLab and Bitbucket
- [ ] File diff preview in approval UI
- [ ] Batch operations (multiple files at once)
- [ ] Git operations (commit, push, pull)
- [ ] Issue and project management operations
- [ ] Webhook integration
- [ ] MCP server mode (stdio transport)

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Codeoba Architecture](ARCHITECTURE.md)
- [Implementation Status](IMPLEMENTATION_STATUS.md)
