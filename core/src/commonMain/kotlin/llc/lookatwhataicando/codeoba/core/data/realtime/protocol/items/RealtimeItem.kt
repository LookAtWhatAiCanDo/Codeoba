package llc.lookatwhataicando.codeoba.core.data.realtime.protocol.items

import kotlinx.serialization.json.JsonObject

/**
 * A single item within a Realtime conversation.
 *
 * Notes:
 * - "object": "realtime.item" is optional when creating a new item; expose as includeObjectField.
 * - "status" is accepted but has no effect; included for completeness.
 */
sealed interface RealtimeItem {
    fun toJson(): JsonObject
}
