package com.codeoba.core.data

import com.codeoba.core.domain.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Stub implementation of RealtimeClient for MVP.
 * Future: Implement with Ktor WebSocket connection to OpenAI Realtime API.
 */
class RealtimeClientImpl : RealtimeClient {
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    // Use SharedFlow for events as they are a stream of occurrences, not a single state
    private val _events = MutableSharedFlow<RealtimeEvent>(replay = 0)
    override val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()
    
    override suspend fun connect(config: RealtimeConfig) {
        _connectionState.value = ConnectionState.Connecting
        // TODO: Implement WebSocket connection
        // For MVP, simulate connection
        kotlinx.coroutines.delay(1000)
        _connectionState.value = ConnectionState.Connected
        _events.emit(RealtimeEvent.Connected)
    }
    
    override suspend fun disconnect() {
        _connectionState.value = ConnectionState.Disconnected
        _events.emit(RealtimeEvent.Disconnected)
    }
    
    override suspend fun sendAudioFrame(frame: ByteArray) {
        // TODO: Send audio frame via WebSocket
    }
}
