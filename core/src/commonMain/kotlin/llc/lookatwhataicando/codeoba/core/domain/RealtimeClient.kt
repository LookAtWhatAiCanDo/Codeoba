package llc.lookatwhataicando.codeoba.core.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonObject

/**
 * Interface for OpenAI Realtime API client.
 * Handles WebRTC/WebSocket connection to OpenAI Realtime API.
 */
interface RealtimeClient {
    companion object {
        /**
         * Generates an id to send with events and messages
         * @param prefix The prefix to use
         * @param length The length of the id to generate, including the prefix
         * @return The generated id with the given prefix and length
         */
        fun generateId(prefix: String = "evt_", length: Int = 21): String {
            val chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
            require(prefix.length <= length) {
                "Prefix length cannot exceed the total length."
            }
            val neededLength = length - prefix.length
            val randomStr = (1..neededLength)
                .map {
                    chars.random()
                }
                .joinToString("")
            return prefix + randomStr
        }
    }

    val connectionState: StateFlow<ConnectionState>
    val events: SharedFlow<RealtimeEvent>
    
    /**
     * Flow of incoming audio frames from OpenAI (PCM16 format).
     * Audio is received via WebRTC RTP or data channel.
     */
    val audioFrames: Flow<ByteArray>
    
    suspend fun connect(config: RealtimeConfig)
    suspend fun disconnect()
    suspend fun sendAudioFrame(frame: ByteArray)

    suspend fun dataSendJson(jsonObject: JsonObject): Boolean
    suspend fun dataSendInputAudioBufferClear(): Boolean
    suspend fun dataSendInputAudioBufferCommit(): Boolean
    suspend fun dataSendResponseCreate(): Boolean
}

data class RealtimeConfig(
    val endpoint: String = "https://api.openai.com/v1/realtime",
    /**
     * Never expose this unencrypted API key to logging!
     */
    val dangerousApiKey: String,
    /**
     * https://platform.openai.com/docs/api-reference/realtime-sessions/create-realtime-client-secret#realtime_sessions_create_realtime_client_secret-session-realtime_session_configuration-model
     * https://platform.openai.com/docs/models
     */
    val model: String = "gpt-realtime-mini",
    /**
     * https://platform.openai.com/docs/api-reference/realtime-sessions/create-realtime-client-secret#realtime_sessions_create_realtime_client_secret-session-realtime_session_configuration-audio-output-voice
     * alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, and cedar.
     * "We recommend `marin` or `cedar` for best quality."
     */
    val voice: String = "alloy"
)

sealed class ConnectionState {
    data object Disconnected : ConnectionState()
    data object Connecting : ConnectionState()
    data object Connected : ConnectionState()
    data class Error(val message: String) : ConnectionState()
}

sealed class RealtimeEvent {
    data class Transcript(val text: String, val isFinal: Boolean) : RealtimeEvent()
    data class ToolCall(val name: String, val argumentsJson: String) : RealtimeEvent()
    data class Error(val message: String) : RealtimeEvent()
    data object Connected : RealtimeEvent()
    data object Disconnected : RealtimeEvent()
}
