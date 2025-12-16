package llc.lookatwhataicando.codeoba.core.platform

import android.Manifest
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.annotation.RequiresPermission
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureService
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch

/**
 * Android implementation of AudioCaptureService using AudioRecord.
 * Captures 16kHz mono PCM audio suitable for OpenAI Realtime API.
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
    
    private var audioRecord: AudioRecord? = null
    private val sampleRate = 16000 // 16kHz as required by OpenAI Realtime
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    private val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
    
    private var frameCount = 0L
    
    override val audioFrames: Flow<ByteArray> = flow {
        frameCount = 0L
        while (_state.value is AudioCaptureState.Capturing) {
            audioRecord?.let { record ->
                val buffer = ByteArray(bufferSize)
                val read = record.read(buffer, 0, buffer.size)
                if (read > 0) {
                    frameCount++
                    // Log every 100th frame to avoid spam (roughly every 1-2 seconds at 16kHz)
                    if (frameCount % 100 == 0L) {
                        Log.d(TAG, "audioFrames: Captured frame #$frameCount: $read bytes")
                    }
                    emit(buffer.copyOf(read))
                } else if (read < 0) {
                    Log.e(TAG, "audioFrames: Error reading audio: $read")
                }
            }
        }
        Log.i(TAG, "audioFrames: Capture stopped, total frames: $frameCount")
    }
    
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    override suspend fun start() {
        if (_state.value is AudioCaptureState.Capturing) {
            Log.w(TAG, "start: Already capturing, ignoring start request")
            return
        }
        
        Log.i(TAG, "start: Starting audio capture (16kHz mono PCM, buffer: $bufferSize bytes)")
        _state.value = AudioCaptureState.Starting
        
        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                throw IllegalStateException("AudioRecord not initialized")
            }
            
            audioRecord?.startRecording()
            _state.value = AudioCaptureState.Capturing
            Log.i(TAG, "start: Audio capture started successfully")
        } catch (e: SecurityException) {
            val errorMsg = "Microphone permission denied"
            Log.e(TAG, "start: $errorMsg", e)
            _state.value = AudioCaptureState.Error(errorMsg)
        } catch (e: Exception) {
            val errorMsg = e.message ?: "Failed to start audio capture"
            Log.e(TAG, "start: Failed to start audio capture: $errorMsg", e)
            _state.value = AudioCaptureState.Error(errorMsg)
        }
    }
    
    override suspend fun stop() {
        Log.i(TAG, "stop: Stopping audio capture")
        try {
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
            _state.value = AudioCaptureState.Idle
            Log.i(TAG, "stop: Audio capture stopped successfully")
        } catch (e: Exception) {
            Log.e(TAG, "stop: Error stopping audio capture: ${e.message}", e)
            // Still set to Idle even if there's an error
            _state.value = AudioCaptureState.Idle
        }
    }
}
