package llc.lookatwhataicando.codeoba.core.data.realtime.protocol.items

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class McpApprovalResponseItem(
    val approvalRequestId: String,
    val approve: Boolean,
    val reason: String? = null,
    val id: String? = null
) : RealtimeItem {
    override fun toJson(): JsonObject = buildJsonObject {
        put("type", "mcp_approval_response")
        put("approval_request_id", approvalRequestId)
        put("approve", approve)
        if (!reason.isNullOrBlank()) put("reason", reason)
        if (!id.isNullOrBlank()) put("id", id)
    }
}

data class McpListToolsItem(
    val serverLabel: String,
    val tools: List<McpToolDescriptor>,
    val id: String? = null
) : RealtimeItem {
    override fun toJson(): JsonObject = buildJsonObject {
        put("type", "mcp_list_tools")
        put("server_label", serverLabel)
        if (!id.isNullOrBlank()) put("id", id)

        put("tools", buildJsonArray {
            tools.forEach { tool ->
                add(buildJsonObject {
                    put("name", tool.name)
                    if (!tool.description.isNullOrBlank()) put("description", tool.description)
                    tool.annotations?.let { put("annotations", it) }
                    put("input_schema", tool.inputSchema)
                })
            }
        })
    }
}

data class McpToolDescriptor(
    val name: String,
    val description: String? = null,
    val annotations: JsonObject? = null,
    val inputSchema: JsonObject
)

data class McpToolCallItem(
    val serverLabel: String,
    val name: String,
    val argumentsJsonString: String,
    val output: String? = null,
    val approvalRequestId: String? = null,
    val error: JsonObject? = null,
    val id: String? = null
) : RealtimeItem {
    override fun toJson(): JsonObject = buildJsonObject {
        put("type", "mcp_call")
        put("server_label", serverLabel)
        put("name", name)
        put("arguments", argumentsJsonString)
        if (!approvalRequestId.isNullOrBlank()) put("approval_request_id", approvalRequestId)
        error?.let { put("error", it) }
        if (!output.isNullOrBlank()) put("output", output)
        if (!id.isNullOrBlank()) put("id", id)
    }
}

data class McpApprovalRequestItem(
    val serverLabel: String,
    val name: String,
    val argumentsJsonString: String,
    val previousItemId: String? = null,
    val id: String? = null
) : RealtimeItem {
    override fun toJson(): JsonObject = buildJsonObject {
        put("type", "mcp_approval_request")
        put("server_label", serverLabel)
        put("name", name)
        put("arguments", argumentsJsonString)
        if (!previousItemId.isNullOrBlank()) put("previous_item_id", previousItemId)
        if (!id.isNullOrBlank()) put("id", id)
    }
}
