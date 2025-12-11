package com.codeoba.core.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Interface for OpenAI Realtime API client.
 * Handles WebRTC/WebSocket connection to OpenAI Realtime API.
 */
interface RealtimeClient {
    val connectionState: StateFlow<ConnectionState>
    val events: SharedFlow<RealtimeEvent>
    
    suspend fun connect(config: RealtimeConfig)
    suspend fun disconnect()
    suspend fun sendAudioFrame(frame: ByteArray)
}

data class RealtimeConfig(
    val apiKey: String,
    val endpoint: String,
    val model: String = "gpt-4o-realtime-preview-2024-10-01"
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
