package llc.lookatwhataicando.codeoba.core.data

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.*
import llc.lookatwhataicando.codeoba.core.domain.*

/**
 * Abstract base class for RealtimeClient implementations.
 * Contains common code shared between Android and Desktop platforms.
 */
abstract class RealtimeClientBase : RealtimeClient {
    companion object {
        private fun repr(str: String?): String {
            return if (str == null) "null" else "`$str`"
        }
    }
    protected abstract val TAG: String

    protected abstract val debug: Boolean

    // Platform-specific logging
    protected abstract fun logDebug(tag: String, message: String)
    protected abstract fun logError(tag: String, message: String, throwable: Throwable? = null)
    protected abstract fun logVerbose(tag: String, message: String)
    protected abstract fun logWarning(tag: String, message: String)

    protected fun logDataChannelText(logPrefix: String, text: String) {
        val logDataChannelTextLength = 512
        val logText = if (text.length <= logDataChannelTextLength) text else { text.take(logDataChannelTextLength) + "..." }
        logDebug(TAG, "$logPrefix message(${text.length})=${repr(logText)}")
    }

    // Common state flows
    protected val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    protected val _events = MutableSharedFlow<RealtimeEvent>(replay = 0)
    override val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()
    
    // Common JSON parser
    protected val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }
    
    // Platform-specific HTTP client (to be provided by subclasses)
    protected abstract val httpClient: HttpClient

    /**
     * Get ephemeral token from OpenAI for WebRTC session.
     * See https://platform.openai.com/docs/api-reference/realtime-sessions/create-realtime-client-secret
     */
    protected suspend fun getEphemeralToken(config: RealtimeConfig): String {
        try {
            val model = config.model
            val voice = config.voice
            logDebug("RealtimeClient", "getEphemeralToken: Requesting ephemeral token for model: $model, voice: $voice")
            
            val response = httpClient.post("${config.endpoint}/client_secrets") {
                header(HttpHeaders.Authorization, "Bearer ${config.dangerousApiKey}")
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("session", buildJsonObject {
                        put("type", "realtime")
                        put("model", model)
                        put("audio", buildJsonObject {
                            put("output", buildJsonObject {
                                put("voice", voice)
                            })
                        })
                    })
                })
            }
            
            val responseBody = response.bodyAsText()
            logDebug(TAG, "getEphemeralToken: Ephemeral token response status: ${response.status}")
            
            // Check HTTP status
            if (response.status.value !in 200..299) {
                logError(TAG, "getEphemeralToken: Failed to get ephemeral token: HTTP ${response.status.value}: $responseBody")
                throw IllegalStateException("HTTP ${response.status.value}: $responseBody")
            }
            
            val jsonResponse = json.parseToJsonElement(responseBody).jsonObject
            
            val ephemeralToken = jsonResponse["value"]?.jsonPrimitive?.content
            if (ephemeralToken == null) {
                logError(TAG, "getEphemeralToken: No ephemeral token in response. Response body: $responseBody")
                throw IllegalStateException("No ephemeral token in response")
            }
            
            logDebug(TAG, "getEphemeralToken: Ephemeral token received: ${ephemeralToken.take(10)}...")
            return ephemeralToken

        } catch (e: Exception) {
            logError(TAG, "getEphemeralToken: Failed to get ephemeral token", e)
            throw IllegalStateException("Failed to get ephemeral token: ${e.message}", e)
        }
    }
    
    /**
     * Exchange SDP offer/answer with OpenAI.
     */
    protected suspend fun exchangeSDP(endpoint: String, ephemeralToken: String, sdpOffer: String): String {
        try {
            logDebug(TAG, "exchangeSDP: Exchanging SDP offer with OpenAI...")

            val response = httpClient.post("$endpoint/calls") {
                header(HttpHeaders.Authorization, "Bearer $ephemeralToken")
                accept(ContentType.Text.Plain)
                contentType(ContentType("application", "sdp"))
                setBody(sdpOffer)
            }
            
            val responseBody = response.bodyAsText()
            logDebug(TAG, "exchangeSDP: SDP exchange response status: ${response.status}")
            logDebug(TAG, "exchangeSDP: SDP exchange response (SDP answer): ${responseBody.take(10)}...")
            
            // Check HTTP status
            if (response.status.value !in 200..299) {
                throw IllegalStateException("HTTP ${response.status.value}: $responseBody")
            }
            
            // Response should be raw SDP answer text, not JSON
            if (responseBody.isBlank()) {
                throw IllegalStateException("Received empty SDP answer from OpenAI")
            }
            
            logDebug(TAG, "exchangeSDP: SDP answer received successfully (${responseBody.length} chars)")
            return responseBody

        } catch (e: Exception) {
            logError(TAG, "exchangeSDP: Failed to exchange SDP", e)
            throw IllegalStateException("Failed to exchange SDP: ${e.message}", e)
        }
    }
    
    /**
     * Helper to generate event IDs
     */
    protected fun generateEventId(prefix: String = "evt_"): String {
        return RealtimeClient.generateId(prefix, 21)
    }
    
    /**
     * Helper to build JSON objects safely
     */
    protected fun buildJsonObject(builder: JsonObjectBuilder.() -> Unit): JsonObject {
        return kotlinx.serialization.json.buildJsonObject(builder)
    }
    
    /**
     * Handle messages received on the data channel.
     * Common implementation used by all platforms.
     */
    protected suspend fun handleDataChannelMessage(messageText: String) {
        try {
            logDataChannelText("RX", messageText)

            val jsonElement = json.parseToJsonElement(messageText)
            val jsonObject = jsonElement.jsonObject
            
            val eventType = jsonObject["type"]?.jsonPrimitive?.content ?: return
            logDebug(TAG, "Event type: $eventType")
            
            when (eventType) {
                "session.created" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Session created")
                    _events.emit(RealtimeEvent.Connected)
                }
                "session.updated" -> {
                    logDebug(TAG, "handleDataChannelMessage: Session updated")
                }
                
                "conversation.item.added" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Conversation item added")
                }
                "conversation.item.created" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Conversation item created")
                    val item = jsonObject["item"]?.jsonObject ?: return
                    handleConversationItem(item)
                }
                "conversation.item.done" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Conversation item done")
                }
                
                "input_audio_buffer.cleared" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Input audio buffer cleared")
                }
                "input_audio_buffer.committed" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Input audio buffer committed")
                }
                "output_audio_buffer.started" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Output audio buffer started")
                }
                "output_audio_buffer.stopped" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Output audio buffer stopped")
                }
                
                "response.created" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Response created")
                }
                "response.output_item.added" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Response output item added")
                }
                "response.output_item.done" -> {
                    val item = jsonObject["item"]?.jsonObject
                    val content = item?.get("content")?.jsonArray
                    if (content != null) {
                        for (contentItem in content) {
                            val contentObj = contentItem.jsonObject
                            val transcript = contentObj["transcript"]?.jsonPrimitive?.content ?: ""
                            if (transcript.isNotEmpty()) {
                                logDebug(TAG, "handleDataChannelMessage: Response output item done: $transcript")
                                _events.emit(RealtimeEvent.Transcript(transcript, true))
                            }
                        }
                    }
                }
                
                "response.content_part.added" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Response content part added")
                }
                "response.content_part.done" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Response content part done")
                }
                "response.audio_transcript.delta" -> {
                    val delta = jsonObject["delta"]?.jsonPrimitive?.content ?: ""
                    if (delta.isNotEmpty()) {
                        logVerbose(TAG, "handleDataChannelMessage: Transcript delta")
                        _events.emit(RealtimeEvent.Transcript(delta, false))
                    }
                }
                "response.audio_transcript.done" -> {
                    val transcript = jsonObject["transcript"]?.jsonPrimitive?.content ?: ""
                    if (transcript.isNotEmpty()) {
                        logDebug(TAG, "handleDataChannelMessage: Transcript complete: $transcript")
                        _events.emit(RealtimeEvent.Transcript(transcript, true))
                    }
                }
                "response.output_audio_transcript.delta" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Response output audio transcript delta")
                }
                "response.output_audio.done" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Output audio done")
                }
                "response.output_audio_transcript.done" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Response output audio transcript done")
                }
                "response.done" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Response done")
                }
                
                "conversation.item.input_audio_transcription.completed" -> {
                    val transcript = jsonObject["transcript"]?.jsonPrimitive?.content ?: ""
                    if (transcript.isNotEmpty()) {
                        logDebug(TAG, "handleDataChannelMessage: User transcript: $transcript")
                        _events.emit(RealtimeEvent.Transcript("User: $transcript", true))
                    }
                }
                
                "response.function_call_arguments.done" -> {
                    val name = jsonObject["name"]?.jsonPrimitive?.content ?: return
                    val arguments = jsonObject["arguments"]?.jsonPrimitive?.content ?: "{}"
                    logDebug(TAG, "handleDataChannelMessage: Tool call: $name with args: $arguments")
                    _events.emit(RealtimeEvent.ToolCall(name, arguments))
                }
                
                "rate_limits.updated" -> {
                    logVerbose(TAG, "handleDataChannelMessage: Rate limits updated")
                }
                
                "error" -> {
                    val error = jsonObject["error"]?.jsonObject
                    val errorMessage = error?.get("message")?.jsonPrimitive?.content ?: "Unknown error"
                    logError(TAG, "handleDataChannelMessage: Error from API: $errorMessage")
                    _events.emit(RealtimeEvent.Error(errorMessage))
                }
                
                else -> {
                    logWarning(TAG, "handleDataChannelMessage: Unhandled event type: $eventType")
                }
            }
        } catch (e: Exception) {
            val errorMsg = "Failed to parse message: ${e.message}"
            logError(TAG, errorMsg, e)
            _events.emit(RealtimeEvent.Error(errorMsg))
        }
    }
    
    /**
     * Handle conversation items from the API.
     * Common implementation used by all platforms.
     */
    protected suspend fun handleConversationItem(item: JsonObject) {
        val itemType = item["type"]?.jsonPrimitive?.content ?: return
        
        when (itemType) {
            "message" -> {
                val content = item["content"]?.jsonArray ?: return
                for (contentItem in content) {
                    val contentObj = contentItem.jsonObject
                    val contentType = contentObj["type"]?.jsonPrimitive?.content
                    
                    if (contentType == "text") {
                        val text = contentObj["text"]?.jsonPrimitive?.content ?: ""
                        if (text.isNotEmpty()) {
                            _events.emit(RealtimeEvent.Transcript(text, true))
                        }
                    }
                }
            }
            
            "function_call" -> {
                val name = item["name"]?.jsonPrimitive?.content ?: return
                val arguments = item["arguments"]?.jsonPrimitive?.content ?: "{}"
                _events.emit(RealtimeEvent.ToolCall(name, arguments))
            }
        }
    }
}
