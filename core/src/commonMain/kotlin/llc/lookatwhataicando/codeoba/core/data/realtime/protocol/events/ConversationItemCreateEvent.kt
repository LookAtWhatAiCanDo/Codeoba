package llc.lookatwhataicando.codeoba.core.data.realtime.protocol.events

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import llc.lookatwhataicando.codeoba.core.data.realtime.protocol.items.RealtimeItem

/**
 * Realtime event: conversation.item.create
 * https://platform.openai.com/docs/api-reference/realtime-client-events/conversation/item/create
 */
data class ConversationItemCreateEvent(
    val eventId: String? = null,
    val item: RealtimeItem,
    val previousItemId: String? = null
) {
    fun toJson(): JsonObject = buildJsonObject {
        if (!eventId.isNullOrBlank()) put("event_id", eventId)
        put("item", item.toJson())
        if (!previousItemId.isNullOrBlank()) put("previous_item_id", previousItemId)
        put("type", "conversation.item.create")
    }
}