package llc.lookatwhataicando.codeoba.core.data.realtime.protocol.items

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

sealed interface MessageContent {
    fun toJson(): JsonObject

    data class InputText(val text: String) : MessageContent {
        override fun toJson(): JsonObject = buildJsonObject {
            put("type", "input_text")
            put("text", text)
        }
    }

    data class InputAudio(
        val audioBase64: String,
        val transcript: String? = null
    ) : MessageContent {
        override fun toJson(): JsonObject = buildJsonObject {
            put("type", "input_audio")
            put("audio", audioBase64)
            if (!transcript.isNullOrBlank()) put("transcript", transcript)
        }
    }

    data class InputImage(
        val imageDataUri: String,
        val detail: String? = null
    ) : MessageContent {
        override fun toJson(): JsonObject = buildJsonObject {
            put("type", "input_image")
            put("image_url", imageDataUri)
            if (!detail.isNullOrBlank()) put("detail", detail)
        }
    }

    data class OutputText(val text: String) : MessageContent {
        override fun toJson(): JsonObject = buildJsonObject {
            put("type", "output_text")
            put("text", text)
        }
    }

    data class OutputAudio(
        val audioBase64: String,
        val transcript: String? = null
    ) : MessageContent {
        override fun toJson(): JsonObject = buildJsonObject {
            put("type", "output_audio")
            put("audio", audioBase64)
            if (!transcript.isNullOrBlank()) put("transcript", transcript)
        }
    }
}

sealed class MessageItem(
    private val role: String,                    // system | user | assistant
    private val id: String? = null,
    private val status: String? = null,
    private val includeObjectField: Boolean = false,
    private val content: List<MessageContent>
) : RealtimeItem {

    override fun toJson(): JsonObject = buildJsonObject {
        put("type", "message")
        put("role", role)
        if (!id.isNullOrBlank()) put("id", id)
        if (includeObjectField) put("object", "realtime.item")
        if (!status.isNullOrBlank()) put("status", status)

        put("content", buildJsonArray {
            content.forEach { add(it.toJson()) }
        })
    }
}

/** System message item: role=system; content.type always "input_text". */
class SystemMessageItem(
    text: String,
    id: String? = null,
    status: String? = null,
    includeObjectField: Boolean = false
) : MessageItem(
    role = "system",
    id = id,
    status = status,
    includeObjectField = includeObjectField,
    content = listOf(MessageContent.InputText(text))
)

/** User message item: role=user; content can be input_text, input_audio, input_image. */
sealed class UserMessageItem(
    id: String? = null,
    status: String? = null,
    includeObjectField: Boolean = false,
    content: List<MessageContent>
) : MessageItem(
    role = "user",
    id = id,
    status = status,
    includeObjectField = includeObjectField,
    content = content
) {
    class Text(
        text: String,
        id: String? = null,
        status: String? = null,
        includeObjectField: Boolean = false
    ) : UserMessageItem(
        id = id,
        status = status,
        includeObjectField = includeObjectField,
        content = listOf(MessageContent.InputText(text))
    )

    class Audio(
        base64Audio: String,
        transcript: String? = null,
        id: String? = null,
        status: String? = null,
        includeObjectField: Boolean = false
    ) : UserMessageItem(
        id = id,
        status = status,
        includeObjectField = includeObjectField,
        content = listOf(MessageContent.InputAudio(base64Audio, transcript))
    )

    class Image(
        dataUri: String,                 // e.g. "data:image/png;base64,...."
        detail: String? = null,          // "auto" | "high" (etc.)
        id: String? = null,
        status: String? = null,
        includeObjectField: Boolean = false
    ) : UserMessageItem(
        id = id,
        status = status,
        includeObjectField = includeObjectField,
        content = listOf(MessageContent.InputImage(dataUri, detail))
    )
}

/** Assistant message item: role=assistant; content type output_text or output_audio. */
sealed class AssistantMessageItem(
    id: String? = null,
    status: String? = null,
    includeObjectField: Boolean = false,
    content: List<MessageContent>
) : MessageItem(
    role = "assistant",
    id = id,
    status = status,
    includeObjectField = includeObjectField,
    content = content
) {
    class Text(
        text: String,
        id: String? = null,
        status: String? = null,
        includeObjectField: Boolean = false
    ) : AssistantMessageItem(
        id = id,
        status = status,
        includeObjectField = includeObjectField,
        content = listOf(MessageContent.OutputText(text))
    )

    class Audio(
        base64Audio: String,
        transcript: String? = null,
        id: String? = null,
        status: String? = null,
        includeObjectField: Boolean = false
    ) : AssistantMessageItem(
        id = id,
        status = status,
        includeObjectField = includeObjectField,
        content = listOf(MessageContent.OutputAudio(base64Audio, transcript))
    )
}
