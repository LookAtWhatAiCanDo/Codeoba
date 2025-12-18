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
}
