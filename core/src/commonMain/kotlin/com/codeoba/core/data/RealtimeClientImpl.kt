package com.codeoba.core.data

import com.codeoba.core.domain.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Stub implementation of RealtimeClient for MVP.
 * Future: Implement with Ktor WebSocket connection to OpenAI Realtime API.
 */
class RealtimeClientImpl : RealtimeClient {
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    private val _events = MutableStateFlow<RealtimeEvent>(RealtimeEvent.Disconnected)
    override val events = _events
    
    override suspend fun connect(config: RealtimeConfig) {
        _connectionState.value = ConnectionState.Connecting
        // TODO: Implement WebSocket connection
        // For MVP, simulate connection
        kotlinx.coroutines.delay(1000)
        _connectionState.value = ConnectionState.Connected
        _events.value = RealtimeEvent.Connected
    }
    
    override suspend fun disconnect() {
        _connectionState.value = ConnectionState.Disconnected
        _events.value = RealtimeEvent.Disconnected
    }
    
    override suspend fun sendAudioFrame(frame: ByteArray) {
        // TODO: Send audio frame via WebSocket
    }
}
