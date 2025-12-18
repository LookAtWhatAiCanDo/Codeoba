package llc.lookatwhataicando.codeoba.core.data

import llc.lookatwhataicando.codeoba.core.domain.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonObject

/**
 * Implementation of RealtimeClient using WebRTC for OpenAI Realtime API.
 * 
 * OpenAI Realtime API uses WebRTC for low-latency bidirectional audio streaming.
 * This requires platform-specific WebRTC implementations.
 * 
 * Platform-specific implementations extend RealtimeClientBase which provides
 * common HTTP/JSON functionality.
 */
@Suppress("EXPECT_ACTUAL_CLASSIFIERS_ARE_IN_BETA_WARNING")
expect class RealtimeClientImpl() : RealtimeClientBase {
    override val audioFrames: Flow<ByteArray>
    
    override suspend fun connect(config: RealtimeConfig)
    override suspend fun disconnect()
    override suspend fun sendAudioFrame(frame: ByteArray)

    override suspend fun dataSendJson(jsonObject: JsonObject): Boolean
    override suspend fun dataSendInputAudioBufferClear(): Boolean
    override suspend fun dataSendInputAudioBufferCommit(): Boolean
    override suspend fun dataSendResponseCreate(): Boolean
    override suspend fun sendTextMessage(text: String): Boolean
}
