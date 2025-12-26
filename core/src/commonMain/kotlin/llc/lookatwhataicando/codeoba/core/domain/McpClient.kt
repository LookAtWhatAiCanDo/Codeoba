package llc.lookatwhataicando.codeoba.core.domain

/**
 * Interface for MCP (Model Context Protocol) client.
 * Handles communication with GitHub/Copilot via MCP tools.
 */
interface McpClient {
    /**
     * Connect and initialize the MCP client.
     * This may involve establishing a connection to the MCP server
     * and discovering available tools.
     */
    suspend fun connect()
    
    /**
     * Handle a tool call request.
     * @param name The name of the tool to execute
     * @param argsJson JSON string containing tool arguments
     * @return Result of the tool execution
     */
    suspend fun handleToolCall(name: String, argsJson: String): McpResult
}

sealed class McpResult {
    data class Success(val summary: String) : McpResult()
    data class Failure(val message: String) : McpResult()
}
