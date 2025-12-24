package llc.lookatwhataicando.codeoba.core.data.mcp

import kotlinx.serialization.json.JsonObject
import llc.lookatwhataicando.codeoba.core.domain.McpResult

/**
 * Handler interface for MCP tools
 */
interface McpToolHandler {
    /**
     * Tool name
     */
    val name: String
    
    /**
     * Tool description
     */
    val description: String
    
    /**
     * JSON Schema for tool input parameters
     */
    val inputSchema: JsonObject
    
    /**
     * Whether this tool requires user approval
     */
    val requiresApproval: Boolean
    
    /**
     * Execute the tool with given arguments
     */
    suspend fun execute(args: JsonObject, context: McpToolContext): McpResult
}

/**
 * Context passed to tool handlers
 */
data class McpToolContext(
    val githubClient: GitHubApiClient,
    val currentOwner: String?,
    val currentRepo: String?,
    val currentBranch: String,
    val updateContext: (owner: String?, repo: String?, branch: String?) -> Unit
)

/**
 * Registry for MCP tools
 */
class McpToolRegistry {
    private val tools = mutableMapOf<String, McpToolHandler>()
    
    /**
     * Register a tool handler
     */
    fun register(handler: McpToolHandler) {
        tools[handler.name] = handler
    }
    
    /**
     * Get a tool handler by name
     */
    fun getHandler(name: String): McpToolHandler? = tools[name]
    
    /**
     * Get all registered tool definitions
     */
    fun getAllToolDefinitions(): List<ToolDefinition> {
        return tools.values.map { handler ->
            ToolDefinition(
                name = handler.name,
                description = handler.description,
                inputSchema = handler.inputSchema
            )
        }
    }
    
    /**
     * Check if a tool requires approval
     */
    fun requiresApproval(toolName: String): Boolean {
        return tools[toolName]?.requiresApproval ?: true // Default to requiring approval
    }
    
    /**
     * Execute a tool by name
     */
    suspend fun executeTool(name: String, args: JsonObject, context: McpToolContext): McpResult {
        val handler = tools[name]
            ?: return McpResult.Failure("Unknown tool: $name")
        
        return try {
            handler.execute(args, context)
        } catch (e: Exception) {
            McpResult.Failure("Tool execution error: ${e.message}")
        }
    }
}
