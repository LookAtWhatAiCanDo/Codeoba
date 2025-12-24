package llc.lookatwhataicando.codeoba.core.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import llc.lookatwhataicando.codeoba.core.data.mcp.*
import llc.lookatwhataicando.codeoba.core.domain.McpClient
import llc.lookatwhataicando.codeoba.core.domain.McpResult

/**
 * Implementation of McpClient with GitHub API integration.
 * Handles tool execution for repository operations.
 */
class McpClientImpl(
    private val githubToken: String
) : McpClient {
    
    private val githubClient: GitHubApiClient = GitHubApiClientImpl(githubToken)
    private val json = Json { ignoreUnknownKeys = true }
    
    // Track current repository context
    private var currentOwner: String? = null
    private var currentRepo: String? = null
    private var currentBranch: String = "main"
    
    override suspend fun handleToolCall(name: String, argsJson: String): McpResult {
        return try {
            // Parse JSON arguments
            val jsonElement = json.parseToJsonElement(argsJson).jsonObject
            
            when (name) {
                "open_repo" -> handleOpenRepo(jsonElement)
                "create_file" -> handleCreateFile(jsonElement)
                "edit_file" -> handleEditFile(jsonElement)
                "create_branch" -> handleCreateBranch(jsonElement)
                "create_pr" -> handleCreatePullRequest(jsonElement)
                else -> McpResult.Failure("Unknown tool: $name")
            }
        } catch (e: Exception) {
            McpResult.Failure("Tool execution error: ${e.message}")
        }
    }
    
    private suspend fun handleOpenRepo(args: kotlinx.serialization.json.JsonObject): McpResult {
        return try {
            val params = json.decodeFromJsonElement<OpenRepoParams>(args)
            
            // Validate repository URL
            if (params.repoUrl.isBlank()) {
                return McpResult.Failure("Repository URL is required")
            }
            
            val result = githubClient.openRepository(params.repoUrl, params.branch)
            
            when (result) {
                is GitHubApiResult.Success -> {
                    // Update current repository context
                    currentOwner = result.data.owner
                    currentRepo = result.data.repo
                    currentBranch = result.data.defaultBranch
                    
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
    
    private suspend fun handleCreateFile(args: kotlinx.serialization.json.JsonObject): McpResult {
        return try {
            val params = json.decodeFromJsonElement<CreateFileParams>(args)
            
            // Validate parameters
            if (params.path.isBlank()) {
                return McpResult.Failure("File path is required")
            }
            if (params.content.isBlank()) {
                return McpResult.Failure("File content is required")
            }
            
            // Check if repository context is set
            val owner = currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            val message = params.message ?: "Create ${params.path}"
            
            val result = githubClient.createFile(
                owner = owner,
                repo = repo,
                path = params.path,
                content = params.content,
                message = message,
                branch = currentBranch
            )
            
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
    
    private suspend fun handleEditFile(args: kotlinx.serialization.json.JsonObject): McpResult {
        return try {
            val params = json.decodeFromJsonElement<EditFileParams>(args)
            
            // Validate parameters
            if (params.path.isBlank()) {
                return McpResult.Failure("File path is required")
            }
            if (params.content.isBlank()) {
                return McpResult.Failure("File content is required")
            }
            
            // Check if repository context is set
            val owner = currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            // Get current file SHA
            val getResult = githubClient.getFile(
                owner = owner,
                repo = repo,
                path = params.path,
                branch = currentBranch
            )
            
            val sha = when (getResult) {
                is GitHubApiResult.Success -> getResult.data.sha
                is GitHubApiResult.Error -> {
                    return McpResult.Failure("File not found: ${params.path}")
                }
            }
            
            val message = params.message ?: "Update ${params.path}"
            
            val result = githubClient.updateFile(
                owner = owner,
                repo = repo,
                path = params.path,
                content = params.content,
                message = message,
                branch = currentBranch,
                sha = sha
            )
            
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
    
    private suspend fun handleCreateBranch(args: kotlinx.serialization.json.JsonObject): McpResult {
        return try {
            val params = json.decodeFromJsonElement<CreateBranchParams>(args)
            
            // Validate parameters
            if (params.branchName.isBlank()) {
                return McpResult.Failure("Branch name is required")
            }
            
            // Check if repository context is set
            val owner = currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            val fromBranch = params.fromBranch ?: currentBranch
            
            val result = githubClient.createBranch(
                owner = owner,
                repo = repo,
                branchName = params.branchName,
                fromRef = fromBranch
            )
            
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
    
    private suspend fun handleCreatePullRequest(args: kotlinx.serialization.json.JsonObject): McpResult {
        return try {
            val params = json.decodeFromJsonElement<CreatePullRequestParams>(args)
            
            // Validate parameters
            if (params.title.isBlank()) {
                return McpResult.Failure("Pull request title is required")
            }
            if (params.headBranch.isBlank()) {
                return McpResult.Failure("Head branch is required")
            }
            
            // Check if repository context is set
            val owner = currentOwner ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            val repo = currentRepo ?: return McpResult.Failure("No repository opened. Use open_repo first.")
            
            val result = githubClient.createPullRequest(
                owner = owner,
                repo = repo,
                title = params.title,
                body = params.body,
                head = params.headBranch,
                base = params.baseBranch
            )
            
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
