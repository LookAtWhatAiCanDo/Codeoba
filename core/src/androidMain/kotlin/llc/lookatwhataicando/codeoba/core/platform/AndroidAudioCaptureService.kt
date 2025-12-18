package llc.lookatwhataicando.codeoba.core.platform

import android.Manifest
import android.content.Context
import android.util.Log
import androidx.annotation.RequiresPermission
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow
import llc.lookatwhataicando.codeoba.core.data.realtime.RealtimeClientImpl
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureService
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureState

/**
 * Android AudioCaptureService that works with WebRTC JavaAudioDeviceModule.
 * 
 * NOTE: With WebRTC's JavaAudioDeviceModule, actual audio capture is handled automatically
 * by WebRTC. This service only manages UI state and controls the WebRTC audio track
 * enable/disable for PTT functionality.
 * 
 * @see RealtimeClientImpl for actual audio handling
 */
class AndroidAudioCaptureService(
    private val context: Context,
    private val scope: CoroutineScope
) : AudioCaptureService {
    
    companion object {
        private const val TAG = "AudioCaptureService"
    }
    
    private val _state = MutableStateFlow<AudioCaptureState>(AudioCaptureState.Idle)
    override val state: StateFlow<AudioCaptureState> = _state.asStateFlow()
    
    // No longer used - audio frames are handled by WebRTC JavaAudioDeviceModule
    override val audioFrames: Flow<ByteArray> = emptyFlow()
    
    // Reference to RealtimeClient to control audio track
    var realtimeClient: RealtimeClientImpl? = null
    
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    override suspend fun start() {
        if (_state.value is AudioCaptureState.Capturing) {
            Log.w(TAG, "start: Already capturing, ignoring start request")
            return
        }
        
        Log.i(TAG, "start: Enabling WebRTC audio track for PTT")
        _state.value = AudioCaptureState.Starting
        
        try {
            // Enable WebRTC audio track
            realtimeClient?.setLocalAudioTrackMicrophoneEnabled(true)
            
            _state.value = AudioCaptureState.Capturing
            Log.i(TAG, "start: WebRTC audio track enabled successfully")
        } catch (e: SecurityException) {
            val errorMsg = "Microphone permission denied"
            Log.e(TAG, "start: $errorMsg", e)
            _state.value = AudioCaptureState.Error(errorMsg)
        } catch (e: Exception) {
            val errorMsg = e.message ?: "Failed to enable audio"
            Log.e(TAG, "start: Failed to enable audio: $errorMsg", e)
            _state.value = AudioCaptureState.Error(errorMsg)
        }
    }
    
    override suspend fun stop() {
        Log.i(TAG, "stop: Disabling WebRTC audio track")
        try {
            // Disable WebRTC audio track
            realtimeClient?.setLocalAudioTrackMicrophoneEnabled(false)
            
            _state.value = AudioCaptureState.Idle
            Log.i(TAG, "stop: WebRTC audio track disabled successfully")
        } catch (e: Exception) {
            Log.e(TAG, "stop: Error disabling audio track: ${e.message}", e)
            // Still set to Idle even if there's an error
            _state.value = AudioCaptureState.Idle
        }
    }
}
