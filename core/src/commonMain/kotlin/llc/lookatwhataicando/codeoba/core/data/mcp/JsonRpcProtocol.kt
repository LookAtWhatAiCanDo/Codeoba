package llc.lookatwhataicando.codeoba.core.data.mcp

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/**
 * JSON-RPC 2.0 protocol messages for MCP communication
 */

@Serializable
data class JsonRpcRequest(
    val jsonrpc: String = "2.0",
    val id: String,
    val method: String,
    val params: JsonObject? = null
)

@Serializable
data class JsonRpcResponse(
    val jsonrpc: String = "2.0",
    val id: String,
    val result: JsonElement? = null,
    val error: JsonRpcError? = null
)

@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String,
    val data: JsonElement? = null
)

/**
 * MCP-specific request/response types
 */

@Serializable
data class McpToolCallRequest(
    val tool: String,
    val arguments: JsonObject
)

@Serializable
data class McpToolCallResponse(
    val success: Boolean,
    val output: String? = null,
    val error: String? = null
)

/**
 * MCP protocol methods
 */
object McpMethods {
    const val INITIALIZE = "initialize"
    const val LIST_TOOLS = "tools/list"
    const val CALL_TOOL = "tools/call"
    const val REQUEST_APPROVAL = "approval/request"
    const val SEND_APPROVAL = "approval/send"
}

/**
 * MCP error codes (following JSON-RPC spec)
 */
object McpErrorCodes {
    const val PARSE_ERROR = -32700
    const val INVALID_REQUEST = -32600
    const val METHOD_NOT_FOUND = -32601
    const val INVALID_PARAMS = -32602
    const val INTERNAL_ERROR = -32603
    
    // MCP-specific error codes
    const val TOOL_NOT_FOUND = -32000
    const val TOOL_EXECUTION_ERROR = -32001
    const val APPROVAL_REQUIRED = -32002
    const val APPROVAL_DENIED = -32003
    const val GITHUB_API_ERROR = -32004
}
