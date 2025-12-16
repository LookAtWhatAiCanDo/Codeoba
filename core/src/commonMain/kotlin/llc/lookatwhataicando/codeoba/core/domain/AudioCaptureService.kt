package llc.lookatwhataicando.codeoba.core.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * Platform-agnostic interface for audio capture.
 * Platform-specific implementations will handle microphone access.
 */
interface AudioCaptureService {
    val state: StateFlow<AudioCaptureState>
    val audioFrames: Flow<ByteArray>
    
    suspend fun start()
    suspend fun stop()
}

sealed class AudioCaptureState {
    data object Idle : AudioCaptureState()
    data object Starting : AudioCaptureState()
    data object Capturing : AudioCaptureState()
    data class Error(val message: String) : AudioCaptureState()
}
