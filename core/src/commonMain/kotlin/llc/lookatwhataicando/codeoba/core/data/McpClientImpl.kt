package llc.lookatwhataicando.codeoba.core.data

import llc.lookatwhataicando.codeoba.core.domain.McpClient
import llc.lookatwhataicando.codeoba.core.domain.McpResult

/**
 * Stub implementation of McpClient for MVP.
 * Future: Implement with actual MCP protocol communication.
 */
class McpClientImpl : McpClient {
    override suspend fun handleToolCall(name: String, argsJson: String): McpResult {
        // TODO: Implement actual MCP tool calls
        return when (name) {
            "open_repo" -> McpResult.Success("Repository opened: $argsJson")
            "create_or_edit_file" -> McpResult.Success("File created/edited: $argsJson")
            "create_commit" -> McpResult.Success("Commit created: $argsJson")
            "create_branch" -> McpResult.Success("Branch created: $argsJson")
            "create_pull_request" -> McpResult.Success("PR created: $argsJson")
            else -> McpResult.Failure("Unknown tool: $name")
        }
    }
}
