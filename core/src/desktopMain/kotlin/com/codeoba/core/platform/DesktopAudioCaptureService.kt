package com.codeoba.core.platform

import com.codeoba.core.domain.AudioCaptureService
import com.codeoba.core.domain.AudioCaptureState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow
import javax.sound.sampled.*

/**
 * Desktop implementation of AudioCaptureService using JavaSound.
 * MVP: Basic implementation - can be enhanced later.
 */
class DesktopAudioCaptureService : AudioCaptureService {
    
    private val _state = MutableStateFlow<AudioCaptureState>(AudioCaptureState.Idle)
    override val state: StateFlow<AudioCaptureState> = _state.asStateFlow()
    
    private var targetDataLine: TargetDataLine? = null
    private val audioFormat = AudioFormat(
        16000f,  // 16kHz sample rate
        16,      // 16-bit samples
        1,       // mono
        true,    // signed
        false    // little-endian
    )
    
    override val audioFrames: Flow<ByteArray> = emptyFlow() // TODO: Implement audio frame streaming
    
    override suspend fun start() {
        if (_state.value is AudioCaptureState.Capturing) return
        
        _state.value = AudioCaptureState.Starting
        
        try {
            val info = DataLine.Info(TargetDataLine::class.java, audioFormat)
            
            if (!AudioSystem.isLineSupported(info)) {
                throw IllegalStateException("Audio line not supported")
            }
            
            targetDataLine = AudioSystem.getLine(info) as TargetDataLine
            targetDataLine?.open(audioFormat)
            targetDataLine?.start()
            
            _state.value = AudioCaptureState.Capturing
        } catch (e: Exception) {
            _state.value = AudioCaptureState.Error(e.message ?: "Failed to start audio capture")
        }
    }
    
    override suspend fun stop() {
        targetDataLine?.stop()
        targetDataLine?.close()
        targetDataLine = null
        _state.value = AudioCaptureState.Idle
    }
}
