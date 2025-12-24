package llc.lookatwhataicando.codeoba.core.data.mcp.handlers

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import llc.lookatwhataicando.codeoba.core.data.mcp.*
import llc.lookatwhataicando.codeoba.core.domain.McpResult
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement

/**
 * Handler for opening/cloning a repository
 */
class OpenRepoToolHandler : McpToolHandler {
    override val name = "open_repo"
    override val description = "Open or clone a GitHub repository"
    override val requiresApproval = false // Read-only operation
    
    override val inputSchema: JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("repoUrl") {
                put("type", "string")
                put("description", "GitHub repository URL (e.g., https://github.com/owner/repo)")
            }
            putJsonObject("branch") {
                put("type", "string")
                put("description", "Optional branch to checkout (defaults to main)")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("repoUrl"))
        })
    }
    
    override suspend fun execute(args: JsonObject, context: McpToolContext): McpResult {
        return try {
            val json = Json { ignoreUnknownKeys = true }
            val params = json.decodeFromJsonElement<OpenRepoParams>(args)
            
            // Validate repository URL
            if (params.repoUrl.isBlank()) {
                return McpResult.Failure("Repository URL is required")
            }
            
            val result = RetryPolicy.executeWithRetry {
                context.githubClient.openRepository(params.repoUrl, params.branch)
            }
            
            when (result) {
                is GitHubApiResult.Success -> {
                    // Update context
                    context.updateContext(
                        result.data.owner,
                        result.data.repo,
                        result.data.defaultBranch
                    )
                    
                    McpResult.Success(
                        "Repository opened: ${result.data.owner}/${result.data.repo} (branch: ${result.data.defaultBranch})"
                    )
                }
                is GitHubApiResult.Error -> {
                    McpResult.Failure("Failed to open repository: ${result.message}")
                }
            }
        } catch (e: Exception) {
            McpResult.Failure("Failed to parse open_repo parameters: ${e.message}")
        }
    }
}

/**
 * Handler for creating a new file
 */
class CreateFileToolHandler : McpToolHandler {
    override val name = "create_file"
    override val description = "Create a new file in the repository"
    override val requiresApproval = true
    
    override val inputSchema: JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("path") {
                put("type", "string")
                put("description", "File path relative to repository root")
            }
            putJsonObject("content") {
                put("type", "string")
                put("description", "File content")
            }
            putJsonObject("message") {
                put("type", "string")
                put("description", "Optional commit message")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("path"))
            add(JsonPrimitive("content"))
        })
    }
    
    override suspend fun execute(args: JsonObject, context: McpToolContext): McpResult {
        return try {
            val json = Json { ignoreUnknownKeys = true }
            val params = json.decodeFromJsonElement<CreateFileParams>(args)
            
            // Validate parameters
            if (params.path.isBlank()) {
                return McpResult.Failure("File path is required")
            }
            if (params.content.isBlank()) {
                return McpResult.Failure("File content is required")
            }
            
            // Check if repository context is set
            val owner = context.currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = context.currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            val message = params.message ?: "Create ${params.path}"
            
            val result = RetryPolicy.executeWithRetry {
                context.githubClient.createFile(
                    owner = owner,
                    repo = repo,
                    path = params.path,
                    content = params.content,
                    message = message,
                    branch = context.currentBranch
                )
            }
            
            when (result) {
                is GitHubApiResult.Success -> {
                    McpResult.Success("File created: ${params.path} (SHA: ${result.data.sha})")
                }
                is GitHubApiResult.Error -> {
                    McpResult.Failure("Failed to create file: ${result.message}")
                }
            }
        } catch (e: Exception) {
            McpResult.Failure("Failed to parse create_file parameters: ${e.message}")
        }
    }
}

/**
 * Handler for editing an existing file
 */
class EditFileToolHandler : McpToolHandler {
    override val name = "edit_file"
    override val description = "Edit an existing file in the repository"
    override val requiresApproval = true
    
    override val inputSchema: JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("path") {
                put("type", "string")
                put("description", "File path relative to repository root")
            }
            putJsonObject("content") {
                put("type", "string")
                put("description", "New file content")
            }
            putJsonObject("message") {
                put("type", "string")
                put("description", "Optional commit message")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("path"))
            add(JsonPrimitive("content"))
        })
    }
    
    override suspend fun execute(args: JsonObject, context: McpToolContext): McpResult {
        return try {
            val json = Json { ignoreUnknownKeys = true }
            val params = json.decodeFromJsonElement<EditFileParams>(args)
            
            // Validate parameters
            if (params.path.isBlank()) {
                return McpResult.Failure("File path is required")
            }
            if (params.content.isBlank()) {
                return McpResult.Failure("File content is required")
            }
            
            // Check if repository context is set
            val owner = context.currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = context.currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            // Get current file SHA with retry
            val getResult = RetryPolicy.executeWithRetry {
                context.githubClient.getFile(
                    owner = owner,
                    repo = repo,
                    path = params.path,
                    branch = context.currentBranch
                )
            }
            
            val sha = when (getResult) {
                is GitHubApiResult.Success -> getResult.data.sha
                is GitHubApiResult.Error -> {
                    return McpResult.Failure("File not found: ${params.path}")
                }
            }
            
            val message = params.message ?: "Update ${params.path}"
            
            val result = RetryPolicy.executeWithRetry {
                context.githubClient.updateFile(
                    owner = owner,
                    repo = repo,
                    path = params.path,
                    content = params.content,
                    message = message,
                    branch = context.currentBranch,
                    sha = sha
                )
            }
            
            when (result) {
                is GitHubApiResult.Success -> {
                    McpResult.Success("File updated: ${params.path} (SHA: ${result.data.sha})")
                }
                is GitHubApiResult.Error -> {
                    McpResult.Failure("Failed to update file: ${result.message}")
                }
            }
        } catch (e: Exception) {
            McpResult.Failure("Failed to parse edit_file parameters: ${e.message}")
        }
    }
}

/**
 * Handler for creating a new branch
 */
class CreateBranchToolHandler : McpToolHandler {
    override val name = "create_branch"
    override val description = "Create a new branch"
    override val requiresApproval = true
    
    override val inputSchema: JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("branchName") {
                put("type", "string")
                put("description", "Name of the new branch")
            }
            putJsonObject("fromBranch") {
                put("type", "string")
                put("description", "Optional source branch (defaults to current branch)")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("branchName"))
        })
    }
    
    override suspend fun execute(args: JsonObject, context: McpToolContext): McpResult {
        return try {
            val json = Json { ignoreUnknownKeys = true }
            val params = json.decodeFromJsonElement<CreateBranchParams>(args)
            
            // Validate parameters
            if (params.branchName.isBlank()) {
                return McpResult.Failure("Branch name is required")
            }
            
            // Check if repository context is set
            val owner = context.currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = context.currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            val fromBranch = params.fromBranch ?: context.currentBranch
            
            val result = RetryPolicy.executeWithRetry {
                context.githubClient.createBranch(
                    owner = owner,
                    repo = repo,
                    branchName = params.branchName,
                    fromRef = fromBranch
                )
            }
            
            when (result) {
                is GitHubApiResult.Success -> {
                    McpResult.Success("Branch created: ${params.branchName} (from $fromBranch)")
                }
                is GitHubApiResult.Error -> {
                    McpResult.Failure("Failed to create branch: ${result.message}")
                }
            }
        } catch (e: Exception) {
            McpResult.Failure("Failed to parse create_branch parameters: ${e.message}")
        }
    }
}

/**
 * Handler for creating a pull request
 */
class CreatePullRequestToolHandler : McpToolHandler {
    override val name = "create_pr"
    override val description = "Create a pull request"
    override val requiresApproval = true
    
    override val inputSchema: JsonObject = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") {
            putJsonObject("title") {
                put("type", "string")
                put("description", "Pull request title")
            }
            putJsonObject("body") {
                put("type", "string")
                put("description", "Pull request description")
            }
            putJsonObject("headBranch") {
                put("type", "string")
                put("description", "Source branch for the pull request")
            }
            putJsonObject("baseBranch") {
                put("type", "string")
                put("description", "Target branch (defaults to main)")
            }
        }
        put("required", buildJsonArray {
            add(JsonPrimitive("title"))
            add(JsonPrimitive("body"))
            add(JsonPrimitive("headBranch"))
        })
    }
    
    override suspend fun execute(args: JsonObject, context: McpToolContext): McpResult {
        return try {
            val json = Json { ignoreUnknownKeys = true }
            val params = json.decodeFromJsonElement<CreatePullRequestParams>(args)
            
            // Validate parameters
            if (params.title.isBlank()) {
                return McpResult.Failure("Pull request title is required")
            }
            if (params.headBranch.isBlank()) {
                return McpResult.Failure("Head branch is required")
            }
            
            // Check if repository context is set
            val owner = context.currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = context.currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            val result = RetryPolicy.executeWithRetry {
                context.githubClient.createPullRequest(
                    owner = owner,
                    repo = repo,
                    title = params.title,
                    body = params.body,
                    head = params.headBranch,
                    base = params.baseBranch
                )
            }
            
            when (result) {
                is GitHubApiResult.Success -> {
                    McpResult.Success(
                        "Pull request created: #${result.data.number} - ${result.data.title}\n" +
                        "URL: ${result.data.htmlUrl}"
                    )
                }
                is GitHubApiResult.Error -> {
                    McpResult.Failure("Failed to create pull request: ${result.message}")
                }
            }
        } catch (e: Exception) {
            McpResult.Failure("Failed to parse create_pr parameters: ${e.message}")
        }
    }
}
