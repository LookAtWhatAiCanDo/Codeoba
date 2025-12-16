package com.codeoba.core.data

import com.codeoba.core.domain.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Implementation of RealtimeClient using WebRTC for OpenAI Realtime API.
 * 
 * OpenAI Realtime API uses WebRTC for low-latency bidirectional audio streaming.
 * This requires platform-specific WebRTC implementations.
 */
expect class RealtimeClientImpl() : RealtimeClient {
    override val connectionState: StateFlow<ConnectionState>
    override val events: SharedFlow<RealtimeEvent>
    override val audioFrames: Flow<ByteArray>
    
    override suspend fun connect(config: RealtimeConfig)
    override suspend fun disconnect()
    override suspend fun sendAudioFrame(frame: ByteArray)
}
