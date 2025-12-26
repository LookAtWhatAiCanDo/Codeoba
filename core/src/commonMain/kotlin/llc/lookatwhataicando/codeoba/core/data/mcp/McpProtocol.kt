package llc.lookatwhataicando.codeoba.core.data.mcp

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * MCP Protocol implementation based on JSON-RPC 2.0 specification.
 * Defines message structures for communication with MCP servers.
 */

/**
 * Base JSON-RPC 2.0 request message.
 */
@Serializable
data class JsonRpcRequest(
    val jsonrpc: String = "2.0",
    val method: String,
    val params: JsonObject? = null,
    val id: String
)

/**
 * Base JSON-RPC 2.0 response message.
 */
@Serializable
data class JsonRpcResponse(
    val jsonrpc: String,
    val result: JsonElement? = null,
    val error: JsonRpcError? = null,
    val id: String
)

/**
 * JSON-RPC 2.0 error structure.
 */
@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String,
    val data: JsonElement? = null
)

/**
 * MCP initialize request parameters.
 */
@Serializable
data class InitializeParams(
    val protocolVersion: String = "2024-11-05",
    val capabilities: ClientCapabilities = ClientCapabilities(),
    val clientInfo: ClientInfo
)

@Serializable
data class ClientCapabilities(
    val experimental: JsonObject? = null,
    val sampling: JsonObject? = null
)

@Serializable
data class ClientInfo(
    val name: String,
    val version: String
)

/**
 * MCP initialize result.
 */
@Serializable
data class InitializeResult(
    val protocolVersion: String,
    val capabilities: ServerCapabilities,
    val serverInfo: ServerInfo
)

@Serializable
data class ServerCapabilities(
    val tools: JsonObject? = null,
    val experimental: JsonObject? = null
)

@Serializable
data class ServerInfo(
    val name: String,
    val version: String
)

/**
 * MCP tools/list result.
 */
@Serializable
data class ToolsListResult(
    val tools: List<ToolDefinition>
)

/**
 * Tool definition from MCP server.
 */
@Serializable
data class ToolDefinition(
    val name: String,
    val description: String? = null,
    val inputSchema: JsonObject
)

/**
 * MCP tools/call request parameters.
 */
@Serializable
data class ToolCallParams(
    val name: String,
    val arguments: JsonObject
)

/**
 * MCP tools/call result.
 */
@Serializable
data class ToolCallResult(
    val content: List<ContentItem>,
    val isError: Boolean? = null
)

@Serializable
data class ContentItem(
    val type: String,
    val text: String? = null,
    val data: String? = null,
    val mimeType: String? = null
)
