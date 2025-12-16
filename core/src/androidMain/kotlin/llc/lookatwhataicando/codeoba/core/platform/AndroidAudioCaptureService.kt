package llc.lookatwhataicando.codeoba.core.platform

import android.Manifest
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
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
    
    private val _state = MutableStateFlow<AudioCaptureState>(AudioCaptureState.Idle)
    override val state: StateFlow<AudioCaptureState> = _state.asStateFlow()
    
    private var audioRecord: AudioRecord? = null
    private val sampleRate = 16000 // 16kHz as required by OpenAI Realtime
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    private val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
    
    override val audioFrames: Flow<ByteArray> = flow {
        while (_state.value is AudioCaptureState.Capturing) {
            audioRecord?.let { record ->
                val buffer = ByteArray(bufferSize)
                val read = record.read(buffer, 0, buffer.size)
                if (read > 0) {
                    emit(buffer.copyOf(read))
                }
            }
        }
    }
    
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    override suspend fun start() {
        if (_state.value is AudioCaptureState.Capturing) return
        
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
        } catch (e: Exception) {
            _state.value = AudioCaptureState.Error(e.message ?: "Failed to start audio capture")
        }
    }
    
    override suspend fun stop() {
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
        _state.value = AudioCaptureState.Idle
    }
}
