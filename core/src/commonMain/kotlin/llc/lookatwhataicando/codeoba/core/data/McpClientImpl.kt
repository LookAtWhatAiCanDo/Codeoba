package llc.lookatwhataicando.codeoba.core.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import llc.lookatwhataicando.codeoba.core.data.mcp.*
import llc.lookatwhataicando.codeoba.core.data.mcp.handlers.*
import llc.lookatwhataicando.codeoba.core.domain.McpClient
import llc.lookatwhataicando.codeoba.core.domain.McpResult

/**
 * Implementation of McpClient with GitHub API integration.
 * Uses dynamic tool registry for extensibility.
 */
class McpClientImpl(
    private val githubToken: String
) : McpClient {
    
    private val githubClient: GitHubApiClient = GitHubApiClientImpl(githubToken)
    private val json = Json { ignoreUnknownKeys = true }
    val approvalManager = ApprovalManager()
    
    // Dynamic tool registry
    private val toolRegistry = McpToolRegistry()
    
    // Track current repository context
    private var currentOwner: String? = null
    private var currentRepo: String? = null
    private var currentBranch: String = "main"
    
    init {
        // Register all GitHub tool handlers
        registerDefaultTools()
    }
    
    /**
     * Register default GitHub tool handlers
     */
    private fun registerDefaultTools() {
        toolRegistry.register(OpenRepoToolHandler())
        toolRegistry.register(CreateFileToolHandler())
        toolRegistry.register(EditFileToolHandler())
        toolRegistry.register(CreateBranchToolHandler())
        toolRegistry.register(CreatePullRequestToolHandler())
    }
    
    /**
     * Register a custom tool handler (for extensibility)
     */
    fun registerTool(handler: McpToolHandler) {
        toolRegistry.register(handler)
    }
    
    /**
     * Get all registered tool definitions
     */
    fun getAllToolDefinitions(): List<ToolDefinition> {
        return toolRegistry.getAllToolDefinitions()
    }
    
    override suspend fun handleToolCall(name: String, argsJson: String): McpResult {
        return try {
            // Check if approval is required
            val requiresApproval = toolRegistry.requiresApproval(name)
            
            if (requiresApproval) {
                // Request approval
                val requestId = approvalManager.requestApproval(name, argsJson, true)
                
                // Wait for approval
                when (val result = approvalManager.waitForApproval(requestId)) {
                    is ApprovalResult.Approved -> {
                        // Execute the tool
                        executeToolCall(name, argsJson)
                    }
                    is ApprovalResult.Denied -> {
                        McpResult.Failure("Operation denied: ${result.reason}")
                    }
                    is ApprovalResult.Timeout -> {
                        McpResult.Failure("Approval timeout: No response received")
                    }
                }
            } else {
                // Execute without approval
                executeToolCall(name, argsJson)
            }
        } catch (e: Exception) {
            McpResult.Failure("Tool execution error: ${e.message}")
        }
    }
    
    private suspend fun executeToolCall(name: String, argsJson: String): McpResult {
        return try {
            // Parse JSON arguments
            val args = json.parseToJsonElement(argsJson).jsonObject
            
            // Create context for tool execution
            val context = McpToolContext(
                githubClient = githubClient,
                currentOwner = currentOwner,
                currentRepo = currentRepo,
                currentBranch = currentBranch,
                updateContext = { owner, repo, branch ->
                    currentOwner = owner
                    currentRepo = repo
                    branch?.let { currentBranch = it }
                }
            )
            
            // Execute tool via registry
            toolRegistry.executeTool(name, args, context)
        } catch (e: Exception) {
            McpResult.Failure("Tool execution error: ${e.message}")
        }
    }
}
