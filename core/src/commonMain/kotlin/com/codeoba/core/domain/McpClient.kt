package com.codeoba.core.domain

/**
 * Interface for MCP (Model Context Protocol) client.
 * Handles communication with GitHub/Copilot via MCP tools.
 */
interface McpClient {
    suspend fun handleToolCall(name: String, argsJson: String): McpResult
}

sealed class McpResult {
    data class Success(val summary: String) : McpResult()
    data class Failure(val message: String) : McpResult()
}
