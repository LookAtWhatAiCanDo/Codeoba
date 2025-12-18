package llc.lookatwhataicando.codeoba.core.data.realtime.protocol.items

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class FunctionCallOutputItem(
    val callId: String,
    val output: String,
    val id: String? = null,
    val status: String? = null,
    val includeObjectField: Boolean = false
) : RealtimeItem {
    override fun toJson(): JsonObject = buildJsonObject {
        put("type", "function_call_output")
        put("call_id", callId)
        put("output", output)
        if (!id.isNullOrBlank()) put("id", id)
        if (includeObjectField) put("object", "realtime.item")
        if (!status.isNullOrBlank()) put("status", status)
    }
}