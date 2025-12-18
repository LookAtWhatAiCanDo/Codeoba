package llc.lookatwhataicando.codeoba.core.data

import android.Manifest
import android.content.Context
import android.media.AudioTrack as AudioTrackAndroid
import android.media.AudioManager
import android.util.Log
import androidx.annotation.RequiresPermission
import llc.lookatwhataicando.codeoba.core.domain.*
import com.twilio.audioswitch.AudioDevice
import com.twilio.audioswitch.AudioSwitch
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.*
import llc.lookatwhataicando.codeoba.core.BuildConfig
import org.webrtc.*
import org.webrtc.Logging.Severity
import org.webrtc.AudioTrack as AudioTrackWebRTC
import org.webrtc.audio.AudioDeviceModule
import org.webrtc.audio.JavaAudioDeviceModule
import java.nio.ByteBuffer

/**
 * Android implementation of RealtimeClient using WebRTC for OpenAI Realtime API.
 * 
 * Uses io.github.webrtc-sdk:android library for WebRTC functionality.
 */
@Suppress("EXPECT_ACTUAL_CLASSIFIERS_ARE_IN_BETA_WARNING")
actual class RealtimeClientImpl actual constructor() : RealtimeClientBase() {
    override val TAG: String
        get() = "RealtimeClientImpl"
    // TODO: Pass this in as a constructor parameter
    override val debug: Boolean
        get() = BuildConfig.DEBUG && false

    override fun logVerbose(tag: String, message: String) {
        Log.v(tag, message)
    }

    override fun logDebug(tag: String, message: String) {
        Log.d(tag, message)
    }

    override fun logWarning(tag: String, message: String) {
        Log.w(tag, message)
    }

    override fun logError(tag: String, message: String, throwable: Throwable?) {
        if (throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
    }

    // HTTP client for Android (uses OkHttp engine)
    override val httpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
        engine {
            config {
                followRedirects(true)
            }
        }
    }

    private val _audioFrames = MutableSharedFlow<ByteArray>(replay = 0)
    actual override val audioFrames: Flow<ByteArray> = _audioFrames.asSharedFlow()
    
    private var peerConnection: PeerConnection? = null
    private var dataChannel: DataChannel? = null
    private var dataChannelOpened = false

    private var localAudioTrackMicrophone: AudioTrackWebRTC? = null
    private var localAudioTrackMicrophoneSender: RtpSender? = null

    data class RemoteAudioTrackInfo(
        val audioTrackWebRTC: AudioTrackWebRTC,
        val audioTrackAndroid: AudioTrackAndroid?,
        val audioTrackSink: AudioTrackSink?,
    )
    private val remoteAudioTrackInfos = mutableListOf<RemoteAudioTrackInfo>()

    private val useAudioPlayerWebRTC = true
    
    // AudioSwitch for managing audio routing (speaker, Bluetooth, wired headset)
    private var audioSwitch: AudioSwitch? = null
    
    // Volume control (0.0 to 1.0)
    private var audioVolume: Float = 1.0f
    
    // Context must be provided before connecting
    private var appContext: Context? = null

    /**
     * Initialize WebRTC with Android context.
     * Must be called before connect().
     */
    fun initialize(context: Context) {
        Log.d(TAG, "initialize: Initializing RealtimeClient with context")
        appContext = context.applicationContext
        
        // Initialize AudioSwitch for audio routing management
        try {
            audioSwitch = AudioSwitch(
                context = appContext!!,
                loggingEnabled = debug,
                audioFocusChangeListener = { focused ->
                    Log.d(TAG, "Audio focus changed: focused=$focused")
                },
                preferredDeviceList = listOf(
                    AudioDevice.BluetoothHeadset::class.java,
                    AudioDevice.WiredHeadset::class.java,
                    AudioDevice.Speakerphone::class.java,
                    AudioDevice.Earpiece::class.java
                )
            )
            Log.i(TAG, "initialize: AudioSwitch initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "initialize: Failed to initialize AudioSwitch: ${e.message}", e)
            // Continue without AudioSwitch - fallback to system default routing
        }
        
        // Initialize WebRTC
        val initOptions = PeerConnectionFactory.InitializationOptions.builder(appContext)
            .setEnableInternalTracer(false)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(initOptions)
        Log.i(TAG, "initialize: RealtimeClient initialized successfully")
    }
    
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    actual override suspend fun connect(config: RealtimeConfig) {
        if (_connectionState.value == ConnectionState.Connected || 
            _connectionState.value == ConnectionState.Connecting) {
            Log.w(TAG, "connect: Already connected or connecting, ignoring connect request")
            return
        }

        Log.i(TAG, "connect: Connecting to ${config.endpoint} with model ${config.model}")
        _connectionState.value = ConnectionState.Connecting
        
        try {
            if (appContext == null) {
                val errorMsg = "connect: RealtimeClientImpl not initialized. Call initialize(context) first."
                Log.e(TAG, errorMsg)
                throw IllegalStateException(errorMsg)
            }

            // Step 1: Get ephemeral token from OpenAI
            Log.d(TAG, "connect: Requesting ephemeral token...")
            val ephemeralToken = getEphemeralToken(config)
            Log.d(TAG, "connect: Ephemeral token received: ${ephemeralToken.take(10)}...")
            
            // Step 2: Initialize PeerConnectionFactory with JavaAudioDeviceModule
            Log.d(TAG, "connect: Creating PeerConnectionFactory with JavaAudioDeviceModule...")

            // Create JavaAudioDeviceModule with hardware AEC and NS
            val audioDeviceModule = JavaAudioDeviceModule.builder(appContext)
                .setUseHardwareAcousticEchoCanceler(true)
                .setUseHardwareNoiseSuppressor(true)
                .createAudioDeviceModule()

            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions
                    .builder(appContext).apply {
                        if (debug) {
                            setEnableInternalTracer(true)
                            setFieldTrials("WebRTC-LogLevel/Warning/")
                        } else {
                            setEnableInternalTracer(false)
                        }
                    }
                    .createInitializationOptions()
            )
            if (!debug) {
                Logging.enableLogToDebugOutput(Severity.LS_NONE)
            }
            val peerConnectionFactory = PeerConnectionFactory
                .builder()
                .setOptions(PeerConnectionFactory.Options())
                .setAudioDeviceModule(audioDeviceModule)
                .createPeerConnectionFactory()
            Log.d(TAG, "connect: PeerConnectionFactory created with hardware AEC/NS enabled")

            // Step 3: Create peer connection with STUN servers
            Log.d(TAG, "connect: Creating peer connection...")
            // ICE/STUN is not needed to talk to *server* (only needed for peer-to-peer)
            val iceServers = listOf<PeerConnection.IceServer>()
            val rtcConfig = PeerConnection.RTCConfiguration(iceServers)
//            val iceServers = listOf(
//                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
//            )
//            val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
//                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
//                continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
//            }

            peerConnection = peerConnectionFactory?.createPeerConnection(
                rtcConfig,
                createPeerConnectionObserver()
            )
            if (peerConnection == null) {
                val errorMsg = "Failed to create PeerConnection"
                Log.e(TAG, errorMsg)
                throw IllegalStateException(errorMsg)
            }
            Log.d(TAG, "connect: Peer connection created successfully")

            // Step 4: Add audio track (initially disabled for PTT)
            Log.d(TAG, "connect: Adding audio track...")
            setLocalAudioMicrophone(peerConnectionFactory)

            // Step 5: Create data channel for signaling
            Log.d(TAG, "connect: Creating data channel...")
            val dataChannelInit = DataChannel.Init()/*.apply {
                ordered = true
                negotiated = false
            }*/
            dataChannel = peerConnection?.createDataChannel("oai-events", dataChannelInit)
            dataChannel?.registerObserver(createDataChannelObserver())
            Log.d(TAG, "connect: Data channel created")

            // Step 6: Create SDP offer
            Log.d(TAG, "connect: Creating SDP offer...")
            peerConnection?.createOffer(
                createSdpObserver(config.endpoint, ephemeralToken),
                MediaConstraints().apply {
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
                }
            )
            
            // Step 7: Start AudioSwitch for audio routing management
            Log.d(TAG, "connect: Starting AudioSwitch...")
            audioSwitch?.start { availableDevices, selectedDevice ->
                Log.i(TAG, "AudioSwitch devices changed: available=$availableDevices, selected=$selectedDevice")
            }
            audioSwitch?.activate()
            Log.d(TAG, "connect: AudioSwitch started and activated")
        } catch (e: Exception) {
            val errorMsg = "Failed to connect: ${e.message}"
            Log.e(TAG, errorMsg, e)
            _connectionState.value = ConnectionState.Error(errorMsg)
            _events.emit(RealtimeEvent.Error(errorMsg))
        }
    }
    
    actual override suspend fun disconnect() {
        Log.i(TAG, "disconnect: Disconnecting...")
        try {
            // Stop AudioSwitch
            Log.d(TAG, "disconnect: Stopping AudioSwitch...")
            audioSwitch?.deactivate()
            audioSwitch?.stop()
            
            setLocalAudioTrackMicrophoneEnabled(false)
            localAudioTrackMicrophoneSender?.dispose()
            localAudioTrackMicrophoneSender = null
            localAudioTrackMicrophone?.dispose()
            localAudioTrackMicrophone = null

            dataChannel?.also {
                dataChannel = null
                it.unregisterObserver()
                it.close()
            }
            dataChannelOpened = false

            peerConnection?.also {
                peerConnection = null
                it.close()
            }

            _connectionState.value = ConnectionState.Disconnected
            _events.emit(RealtimeEvent.Disconnected)
            Log.i(TAG, "disconnect: Disconnected successfully")
        } catch (e: Exception) {
            Log.e(TAG, "disconnect: Error during disconnect: ${e.message}", e)
            _connectionState.value = ConnectionState.Disconnected
            _events.emit(RealtimeEvent.Disconnected)
        }
    }

    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    private fun setLocalAudioMicrophone(peerConnectionFactory: PeerConnectionFactory) {
        localAudioTrackMicrophoneSender?.also {
            peerConnection?.removeTrack(it)
            localAudioTrackMicrophoneSender = null
        }

        val audioConstraints = MediaConstraints()
        val audioSource = peerConnectionFactory.createAudioSource(audioConstraints)
        localAudioTrackMicrophone = peerConnectionFactory.createAudioTrack("MIC_TRACK", audioSource)
        if (localAudioTrackMicrophone != null) {
            localAudioTrackMicrophoneSender = peerConnection?.addTrack(localAudioTrackMicrophone)
            // Start with audio track disabled - will be enabled on PTT press
            setLocalAudioTrackMicrophoneEnabled(false)
            Log.d(TAG, "setLocalAudioMicrophone: Audio track added to peer connection (initially disabled for PTT)")
        }
    }

    /**
     * Enable or disable microphone audio transmission (for PTT control).
     * 
     * @param enabled true to enable microphone (PTT press), false to disable (PTT release)
     */
    fun setLocalAudioTrackMicrophoneEnabled(enabled: Boolean) {
        Log.d(TAG, "setLocalAudioTrackMicrophoneEnabled($enabled)")
        localAudioTrackMicrophone?.setEnabled(enabled)
    }

    private var isSpeakerEnabled: Boolean = false

    fun setLocalAudioTrackSpeakerEnabled(enabled: Boolean) {
        Log.d(TAG, "setLocalAudioTrackSpeakerEnabled($enabled)")
        if (isSpeakerEnabled != enabled) {
            isSpeakerEnabled = enabled
            remoteAudioTrackInfos.forEach { playback ->
                playback.audioTrackWebRTC.setEnabled(enabled)
                playback.audioTrackAndroid?.also {
                    if (enabled) {
                        it.flush()
                        it.play()
                    } else {
                        it.pause()
                        it.flush()
                    }
                }
            }
        }
    }

    /**
     * Create WebRTC peer connection observer.
     */
    private fun createPeerConnectionObserver() = object : PeerConnection.Observer {
        private val TAG = "PeerConnection"

        override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {
            Log.d(TAG, "onIceConnectionChange($newState)")
            CoroutineScope(Dispatchers.Main).launch {
                when (newState) {
                    PeerConnection.IceConnectionState.CONNECTED,
                    PeerConnection.IceConnectionState.COMPLETED -> {
                        Log.i(TAG, "ICE connection established")
                        _connectionState.value = ConnectionState.Connected
                        _events.emit(RealtimeEvent.Connected)
                    }
                    PeerConnection.IceConnectionState.FAILED -> {
                        Log.e(TAG, "ICE connection failed")
                        _connectionState.value = ConnectionState.Error("ICE connection failed")
                        _events.emit(RealtimeEvent.Error("ICE connection failed"))
                    }
                    PeerConnection.IceConnectionState.DISCONNECTED -> {
                        Log.w(TAG, "ICE connection disconnected")
                        _connectionState.value = ConnectionState.Disconnected
                        _events.emit(RealtimeEvent.Disconnected)
                    }
                    else -> {}
                }
            }
        }

        override fun onAddTrack(receiver: RtpReceiver, mediaStreams: Array<MediaStream>) {
            val track = receiver.track()
            Log.d(TAG, "onAddTrack(receiver={..., track=${track}, ...}, mediaStreams(${mediaStreams.size})=[...])")

            val trackKind = track?.kind()
            if (trackKind == AudioTrackWebRTC.AUDIO_TRACK_KIND) {
                val audioTrackWebRTC = track as AudioTrackWebRTC
                
                // WebRTC automatically handles audio playback through the selected audio device
                // AudioSwitch manages the routing (speaker, Bluetooth, wired headset)
                Log.i(TAG, "onAddTrack: Remote audio track received, WebRTC will handle playback")
                
                val remoteAudioTrackInfo = RemoteAudioTrackInfo(
                    audioTrackWebRTC = audioTrackWebRTC,
                    audioTrackAndroid = null, // Not using custom AudioTrack
                    audioTrackSink = null // Not extracting raw PCM data
                )
                remoteAudioTrackInfos.add(remoteAudioTrackInfo)

                // Enable speaker playback
                setLocalAudioTrackSpeakerEnabled(true)
                
                // Apply current volume setting to new track
                audioTrackWebRTC.setVolume(audioVolume.toDouble())
                Log.d(TAG, "onAddTrack: Applied volume ${audioVolume} to remote audio track")
            }
        }

        override fun onDataChannel(channel: DataChannel) {
            Log.d(TAG, "onDataChannel($channel)")
            // Data channel received from remote peer
            //Log.d(TAG, "Data channel received from remote peer")
            //dataChannel = channel
            //channel.registerObserver(createDataChannelObserver())
        }
        override fun onSignalingChange(newState: PeerConnection.SignalingState) {
            Log.v(TAG, "onSignalingChange($newState)")
        }
        override fun onIceConnectionReceivingChange(receiving: Boolean) {
            Log.v(TAG, "onIceConnectionReceivingChange($receiving)")
        }
        override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState) {
            Log.v(TAG, "onIceGatheringChange($newState)")
        }
        override fun onIceCandidate(candidate: IceCandidate) {
            // ICE candidates are handled automatically in this setup
            // OpenAI handles ICE over the data channel
            Log.v(TAG, "onIceCandidate($candidate)")
        }
        override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {
            Log.v(TAG, "onIceCandidatesRemoved($candidates)")
        }
        override fun onAddStream(stream: MediaStream) {
            Log.v(TAG, "onAddStream($stream)")
        }
        override fun onRemoveStream(stream: MediaStream) {
            Log.v(TAG, "onRemoveStream($stream)")
        }
        override fun onRenegotiationNeeded() {
            Log.v(TAG, "onRenegotiationNeeded")
        }
    }
    
    /**
     * Create observer for data channel messages.
     */
    private fun createDataChannelObserver() = object : DataChannel.Observer {
        private val TAG = "DataChannel"

        override fun onStateChange() {
            Log.v(TAG, "onStateChange()")
            dataChannel?.state()?.let { newState ->
                Log.d(TAG, "onStateChange: dataChannel.state() changed to $newState")
                when (newState) {
                    DataChannel.State.OPEN -> {
                        if (!dataChannelOpened) {
                            Log.i(TAG, "onStateChange: onDataChannelOpened()")
                            dataChannelOpened = true
                            onDataChannelOpened()
                        }
                    }
                    DataChannel.State.CLOSED -> {
                        if (dataChannelOpened) {
                            Log.i(TAG, "onStateChange: onDataChannelClosed()")
                            dataChannelOpened = false
                            onDataChannelClosed()
                        }
                    }
                    else -> {}
                }
            }
        }

        override fun onMessage(buffer: DataChannel.Buffer) {
            val bufferData = buffer.data
            val bytes = ByteArray(bufferData.remaining())
            bufferData.get(bytes)
            if (buffer.binary) {
                Log.e(TAG, "onMessage: Unhandled binary data received on data channel")
            } else {
                val messageText = String(bytes, Charsets.UTF_8)
                CoroutineScope(Dispatchers.Main).launch {
                    handleDataChannelText(messageText)
                }
            }
        }

        override fun onBufferedAmountChange(previousAmount: Long) {
            Log.v(TAG, "onBufferedAmountChange($previousAmount)")
        }
    }

    private fun createSdpObserver(endpoint: String, ephemeralToken: String): SdpObserver {
        return object : SdpObserver {
            override fun onCreateSuccess(sessionDescription: SessionDescription) {
                Log.d(TAG, "sdpObserverOffer: onCreateSuccess - SDP offer created successfully")

                peerConnection?.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(sdp: SessionDescription?) {
                        Log.d(TAG, "sdpObserverLocal: onCreateSuccess($sdp)")
                    }

                    override fun onSetSuccess() {
                        Log.d(TAG, "sdpObserverLocal: onSetSuccess() - Local description set successfully")
                        CoroutineScope(Dispatchers.IO).launch {
                            try {
                                // Step 7: Exchange SDP with OpenAI
                                Log.d(TAG, "sdpObserverLocal: Exchanging SDP with OpenAI...")
                                val answerSdp = exchangeSDP(
                                    endpoint = endpoint,
                                    ephemeralToken = ephemeralToken,
                                    sdpOffer = sessionDescription.description
                                )
                                Log.d(TAG, "sdpObserverLocal: SDP answer received from OpenAI (${answerSdp.length} chars)")

                                withContext(Dispatchers.Main) {
                                    peerConnection?.setRemoteDescription(object : SdpObserver {
                                        override fun onCreateSuccess(sdp: SessionDescription?) {
                                            Log.d(TAG, "sdpObserverRemote: onCreateSuccess($sdp)")
                                        }

                                        override fun onSetSuccess() {
                                            Log.i(TAG, "sdpObserverRemote: onSetSuccess() - Remote description set successfully, WebRTC connection established")
                                            // Connection is being established, wait for ICE connection state changes
                                        }

                                        override fun onCreateFailure(error: String?) {
                                            Log.e(TAG, "sdpObserverRemote: onCreateFailure($error)")
                                        }

                                        override fun onSetFailure(error: String) {
                                            Log.e(TAG, "sdpObserverRemote: onSetFailure($error)")
                                            CoroutineScope(Dispatchers.Main).launch {
                                                _connectionState.value = ConnectionState.Error("Failed to set remote description: $error")
                                                _events.emit(RealtimeEvent.Error(error))
                                            }
                                        }
                                    }, SessionDescription(
                                        SessionDescription.Type.ANSWER,
                                        answerSdp
                                    ))
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "sdpObserverLocal: Failed to exchange SDP: ${e.message}", e)
                                CoroutineScope(Dispatchers.Main).launch {
                                    _connectionState.value = ConnectionState.Error("Failed to exchange SDP: ${e.message}")
                                    _events.emit(RealtimeEvent.Error("Failed to exchange SDP: ${e.message}"))
                                }
                            }
                        }
                    }

                    override fun onCreateFailure(error: String?) {
                        Log.e(TAG, "sdpObserverLocal: onCreateFailure($error)")
                    }

                    override fun onSetFailure(error: String) {
                        Log.e(TAG, "sdpObserverLocal: onSetFailure - Failed to set local description: $error")
                        CoroutineScope(Dispatchers.Main).launch {
                            _connectionState.value = ConnectionState.Error("Failed to set local description: $error")
                            _events.emit(RealtimeEvent.Error(error))
                        }
                    }
                }, sessionDescription)
            }

            override fun onSetSuccess() {
                Log.v(TAG, "sdpObserverOffer: onSetSuccess()")
            }

            override fun onCreateFailure(error: String) {
                Log.e(TAG, "sdpObserverOffer: onCreateFailure($error)")
                CoroutineScope(Dispatchers.Main).launch {
                    _connectionState.value = ConnectionState.Error("Failed to create offer: $error")
                    _events.emit(RealtimeEvent.Error(error))
                }
            }

            override fun onSetFailure(error: String?) {
                Log.e(TAG, "sdpObserverOffer: onSetFailure($error)")
            }
        }
    }

    private fun onDataChannelOpened() {
        Log.i(TAG, "onDataChannelOpened(); Sending session.update...")
        CoroutineScope(Dispatchers.IO).launch {
            dataSendSessionUpdate()
        }
    }

    private fun onDataChannelClosed() {
        Log.w(TAG, "onDataChannelClosed()")
        CoroutineScope(Dispatchers.Main).launch {
            _connectionState.value = ConnectionState.Disconnected
            _events.emit(RealtimeEvent.Disconnected)
        }
    }

    actual override suspend fun sendAudioFrame(frame: ByteArray) {
        // With WebRTC and JavaAudioDeviceModule, audio is automatically captured
        // and sent via the WebRTC audio track. No manual frame sending needed.
        // The AudioDeviceModule handles microphone capture and routing to the peer connection.
    }

    actual override suspend fun dataSendJson(jsonObject: JsonObject): Boolean {
        if (!dataChannelOpened) throw IllegalStateException("dataChannel not opened")
        val type = jsonObject["type"].toString()
        try {
            val messageText = jsonObject.toString()
            logDataChannelText("TX", messageText)
            val messageBytes = messageText.toByteArray(Charsets.UTF_8)
            val byteBuffer = ByteBuffer.allocateDirect(messageBytes.size)
            byteBuffer.put(messageBytes)
            byteBuffer.flip()
            if (dataChannel?.send(DataChannel.Buffer(byteBuffer, false)) == true) {
                Log.d(TAG, "dataSendJson: $type successfully sent")
                return true
            } else {
                Log.e(TAG, "dataSendJson: $type failed to send")
                return false
            }
        } catch (e: Exception) {
            Log.e(TAG, "dataSendJson: $type failed to send: ${e.message}", e)
            _events.emit(RealtimeEvent.Error("$type failed to send: ${e.message}"))
            return false
        }
    }
    
    /**
     * Set playback volume for received audio.
     * 
     * @param volume Volume level from 0.0 (mute) to 1.0 (full volume)
     */
    fun setVolume(volume: Float) {
        require(volume in 0.0f..1.0f) { "Volume must be between 0.0 and 1.0" }
        audioVolume = volume
        Log.d(TAG, "setVolume: Setting playback volume to $volume")
        
        // Apply volume to all remote audio tracks
        remoteAudioTrackInfos.forEach { info ->
            info.audioTrackWebRTC.setVolume(volume.toDouble())
        }
    }
    
    /**
     * Get current playback volume.
     * 
     * @return Current volume level (0.0 to 1.0)
     */
    fun getVolume(): Float = audioVolume
    
    /**
     * Get list of available audio devices.
     * 
     * @return List of available audio devices, or empty list if AudioSwitch not initialized
     */
    fun getAvailableAudioDevices(): List<AudioDevice> {
        return audioSwitch?.availableAudioDevices ?: emptyList()
    }
    
    /**
     * Get currently selected audio device.
     * 
     * @return Currently selected audio device, or null if AudioSwitch not initialized
     */
    fun getSelectedAudioDevice(): AudioDevice? {
        return audioSwitch?.selectedAudioDevice
    }
    
    /**
     * Select a specific audio device for playback.
     * 
     * @param device The audio device to select (from getAvailableAudioDevices())
     */
    fun selectAudioDevice(device: AudioDevice) {
        Log.i(TAG, "selectAudioDevice: Selecting audio device: $device")
        audioSwitch?.selectDevice(device)
    }
}
