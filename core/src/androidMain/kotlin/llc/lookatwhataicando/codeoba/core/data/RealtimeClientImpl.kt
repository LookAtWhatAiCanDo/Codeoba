package llc.lookatwhataicando.codeoba.core.data

import android.content.Context
import android.util.Log
import llc.lookatwhataicando.codeoba.core.domain.*
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
import kotlinx.serialization.json.*
import org.webrtc.*
import org.webrtc.audio.AudioDeviceModule
import org.webrtc.audio.JavaAudioDeviceModule
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

/**
 * Android implementation of RealtimeClient using WebRTC for OpenAI Realtime API.
 * 
 * Uses io.github.webrtc-sdk:android library for WebRTC functionality.
 */
actual class RealtimeClientImpl actual constructor() : RealtimeClient {
    companion object {
        private const val TAG = "RealtimeClient"
    }
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    actual override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    private val _events = MutableSharedFlow<RealtimeEvent>(replay = 0)
    actual override val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()
    
    private val _audioFrames = MutableSharedFlow<ByteArray>(replay = 0)
    actual override val audioFrames: Flow<ByteArray> = _audioFrames.asSharedFlow()
    
    private var peerConnection: PeerConnection? = null
    private var dataChannel: DataChannel? = null
    private var audioTrack: AudioTrack? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var audioDeviceModule: AudioDeviceModule? = null
    
    private val httpClient = HttpClient(OkHttp) {
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
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }
    
    private var ephemeralKey: String? = null
    
    // Context must be provided before connecting
    private var appContext: Context? = null
    
    /**
     * Initialize WebRTC with Android context.
     * Must be called before connect().
     */
    fun initialize(context: Context) {
        Log.d(TAG, "initialize: Initializing RealtimeClient with context")
        appContext = context.applicationContext
        
        // Initialize WebRTC
        val initOptions = PeerConnectionFactory.InitializationOptions.builder(appContext)
            .setEnableInternalTracer(false)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(initOptions)
        Log.i(TAG, "initialize: RealtimeClient initialized successfully")
    }
    
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
            ephemeralKey = getEphemeralToken(config.apiKey, config.model)
            Log.d(TAG, "connect: Ephemeral token received: ${ephemeralKey?.take(10)}...")
            
            // Step 2: Initialize PeerConnectionFactory with JavaAudioDeviceModule
            if (peerConnectionFactory == null) {
                Log.d(TAG, "connect: Creating PeerConnectionFactory with JavaAudioDeviceModule...")
                
                // Create JavaAudioDeviceModule with hardware AEC and NS
                audioDeviceModule = JavaAudioDeviceModule.builder(appContext)
                    .setUseHardwareAcousticEchoCanceler(true)
                    .setUseHardwareNoiseSuppressor(true)
                    .createAudioDeviceModule()
                
                val options = PeerConnectionFactory.Options()
                peerConnectionFactory = PeerConnectionFactory.builder()
                    .setOptions(options)
                    .setAudioDeviceModule(audioDeviceModule)
                    .createPeerConnectionFactory()
                
                Log.d(TAG, "connect: PeerConnectionFactory created with hardware AEC/NS enabled")
            }
            
            // Step 3: Create peer connection with STUN servers
            Log.d(TAG, "connect: Creating peer connection...")
            val iceServers = listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
            )
            val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
                continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            }
            
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
            
            // Step 4: Create data channel for signaling
            Log.d(TAG, "connect: Creating data channel...")
            val dataChannelInit = DataChannel.Init().apply {
                ordered = true
                negotiated = false
            }
            dataChannel = peerConnection?.createDataChannel("oai-events", dataChannelInit)
            dataChannel?.registerObserver(createDataChannelObserver())
            Log.d(TAG, "connect: Data channel created")
            
            // Step 5: Add audio track (initially disabled for PTT)
            Log.d(TAG, "connect: Adding audio track...")
            val audioConstraints = MediaConstraints()
            val audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
            audioTrack = peerConnectionFactory?.createAudioTrack("audio", audioSource)
            
            if (audioTrack != null) {
                peerConnection?.addTrack(audioTrack, listOf("stream"))
                // Start with audio track disabled - will be enabled on PTT press
                setMicrophoneEnabled(false)
                Log.d(TAG, "connect: Audio track added to peer connection (initially disabled for PTT)")
            }
            
            // Step 6: Create SDP offer
            Log.d(TAG, "connect: Creating SDP offer...")
            val offerConstraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
            }
            peerConnection?.createOffer(object : SdpObserver {
                override fun onCreateSuccess(sessionDescription: SessionDescription) {
                    Log.d(TAG, "sdpObserverOffer: onCreateSuccess - SDP offer created successfully")

                    peerConnection?.setLocalDescription(object : SdpObserver {
                        override fun onCreateSuccess(sdp: SessionDescription?) {
                            Log.d(TAG, "sdpObserverLocal: onCreateSuccess($sdp)")
                        }

                        override fun onSetSuccess() {
                            Log.d(TAG, "sdpObserverLocal: setSuccess - Local description set successfully")
                            CoroutineScope(Dispatchers.IO).launch {
                                try {
                                    // Step 7: Exchange SDP with OpenAI
                                    Log.d(TAG, "sdpObserverLocal: Exchanging SDP with OpenAI...")
                                    val answerSdp = exchangeSDP(sessionDescription.description, ephemeralKey!!)
                                    Log.d(TAG, "sdpObserverLocal: SDP answer received from OpenAI (${answerSdp.length} chars)")

                                    val answerDescription = SessionDescription(
                                        SessionDescription.Type.ANSWER,
                                        answerSdp
                                    )

                                    withContext(Dispatchers.Main) {
                                        peerConnection?.setRemoteDescription(object : SdpObserver {
                                            override fun onCreateSuccess(sdp: SessionDescription?) {
                                                Log.d(TAG, "sdpObserverRemote: onCreateSuccess($sdp)")
                                            }

                                            override fun onSetSuccess() {
                                                Log.i(TAG, "sdpObserverRemote: setSuccess - Remote description set successfully, WebRTC connection established")
                                                // Connection is being established, wait for ICE connection state changes
                                            }

                                            override fun onCreateFailure(error: String?) {
                                                Log.e(TAG, "sdpObserverRemote: onCreateFailure($error)")
                                            }

                                            override fun onSetFailure(error: String) {
                                                Log.e(TAG, "sdpObserverRemote: onSetFailure - Failed to set remote description: $error")
                                                CoroutineScope(Dispatchers.Main).launch {
                                                    _connectionState.value = ConnectionState.Error("Failed to set remote description: $error")
                                                    _events.emit(RealtimeEvent.Error(error))
                                                }
                                            }
                                        }, answerDescription)
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
                    Log.d(TAG, "sdpObserverOffer: setSuccess")
                }

                override fun onCreateFailure(error: String) {
                    Log.e(TAG, "sdpObserverOffer: onCreateFailure - Failed to create offer: $error")
                    CoroutineScope(Dispatchers.Main).launch {
                        _connectionState.value = ConnectionState.Error("Failed to create offer: $error")
                        _events.emit(RealtimeEvent.Error(error))
                    }
                }

                override fun onSetFailure(error: String?) {
                    Log.e(TAG, "sdpObserverOffer: onSetFailure($error)")
                }
            }, offerConstraints)

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
            dataChannel?.close()
            dataChannel?.unregisterObserver()
            dataChannel = null
            
            audioTrack?.dispose()
            audioTrack = null
            
            peerConnection?.close()
            peerConnection = null
            
            peerConnectionFactory?.dispose()
            peerConnectionFactory = null
            
            audioDeviceModule?.release()
            audioDeviceModule = null
            
            ephemeralKey = null
            
            _connectionState.value = ConnectionState.Disconnected
            _events.emit(RealtimeEvent.Disconnected)
            Log.i(TAG, "disconnect: Disconnected successfully")
        } catch (e: Exception) {
            Log.e(TAG, "disconnect: Error during disconnect: ${e.message}", e)
            _connectionState.value = ConnectionState.Disconnected
            _events.emit(RealtimeEvent.Disconnected)
        }
    }
    
    actual override suspend fun sendAudioFrame(frame: ByteArray) {
        // With WebRTC and JavaAudioDeviceModule, audio is automatically captured
        // and sent via the WebRTC audio track. No manual frame sending needed.
        // The AudioDeviceModule handles microphone capture and routing to the peer connection.
    }
    
    /**
     * Enable or disable microphone audio transmission (for PTT control).
     * 
     * @param enabled true to enable microphone (PTT press), false to disable (PTT release)
     */
    fun setMicrophoneEnabled(enabled: Boolean) {
        audioTrack?.setEnabled(enabled)
        Log.d(TAG, "setMicrophoneEnabled: Audio track ${if (enabled) "enabled" else "disabled"}")
    }
    
    /**
     * Get ephemeral token from OpenAI for WebRTC session.
     */
    private suspend fun getEphemeralToken(apiKey: String, model: String): String {
        try {
            Log.d(TAG, "getEphemeralToken: Requesting ephemeral token for model: $model")
            val response: HttpResponse = httpClient.post("https://api.openai.com/v1/realtime/sessions") {
                header(HttpHeaders.Authorization, "Bearer $apiKey")
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", model)
                    put("voice", "alloy")
                }.toString())
            }
            
            val responseBody = response.bodyAsText()
            Log.d(TAG, "getEphemeralToken: Ephemeral token response status: ${response.status}")
            
            // Check HTTP status
            if (response.status.value !in 200..299) {
                Log.e(TAG, "getEphemeralToken:Failed to get ephemeral token: HTTP ${response.status.value}: $responseBody")
                throw IllegalStateException("HTTP ${response.status.value}: $responseBody")
            }
            
            val jsonResponse = json.parseToJsonElement(responseBody).jsonObject
            
            val ephemeralKey = jsonResponse["client_secret"]?.jsonObject?.get("value")?.jsonPrimitive?.content
            if (ephemeralKey == null) {
                Log.e(TAG, "getEphemeralToken: No ephemeral key in response. Response body: $responseBody")
                throw IllegalStateException("No ephemeral key in response")
            }
            
            Log.d(TAG, "getEphemeralToken: Ephemeral token received: ${ephemeralKey.take(10)}...")
            return ephemeralKey
                
        } catch (e: Exception) {
            Log.e(TAG, "getEphemeralToken: Failed to get ephemeral token", e)
            throw IllegalStateException("Failed to get ephemeral token: ${e.message}", e)
        }
    }
    
    /**
     * Exchange SDP offer/answer with OpenAI.
     */
    private suspend fun exchangeSDP(sdpOffer: String, ephemeralToken: String): String {
        try {
            Log.d(TAG, "exchangeSDP: Exchanging SDP offer with OpenAI...")
            val response: HttpResponse = httpClient.post("https://api.openai.com/v1/realtime") {
                header(HttpHeaders.Authorization, "Bearer $ephemeralToken")
                // OpenAI Realtime API requires application/sdp content type for SDP exchange
                contentType(ContentType("application", "sdp"))
                setBody(sdpOffer)
            }
            
            val responseBody = response.bodyAsText()
            Log.d(TAG, "exchangeSDP: SDP exchange response status: ${response.status}")
            Log.d(TAG, "exchangeSDP: SDP exchange response (SDP answer): ${responseBody.take(200)}...")
            
            // Check HTTP status
            if (response.status.value !in 200..299) {
                throw IllegalStateException("HTTP ${response.status.value}: $responseBody")
            }
            
            // Response should be raw SDP answer text, not JSON
            if (responseBody.isBlank()) {
                throw IllegalStateException("Received empty SDP answer from OpenAI")
            }
            
            Log.d(TAG, "exchangeSDP: SDP answer received successfully (${responseBody.length} chars)")
            return responseBody
                
        } catch (e: Exception) {
            Log.e(TAG, "exchangeSDP: Failed to exchange SDP", e)
            throw IllegalStateException("Failed to exchange SDP: ${e.message}", e)
        }
    }
    
    /**
     * Create WebRTC peer connection observer.
     */
    private fun createPeerConnectionObserver() = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) {
            // ICE candidates are handled automatically in this setup
            // OpenAI handles ICE over the data channel
        }
        
        override fun onDataChannel(channel: DataChannel) {
            // Data channel received from remote peer
            Log.d(TAG, "Data channel received from remote peer")
            dataChannel = channel
            channel.registerObserver(createDataChannelObserver())
        }
        
        override fun onAddTrack(receiver: RtpReceiver, streams: Array<MediaStream>) {
            // Handle incoming audio track from OpenAI
            Log.d(TAG, "Audio track received from OpenAI")
            // Note: Audio frames are typically received via RTP and would need
            // a custom audio sink to extract PCM data. For now, this is a placeholder.
            // In production, you would set up an AudioTrackSink to capture frames.
        }
        
        override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {
            Log.d(TAG, "ICE connection state changed: $newState")
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
        
        override fun onSignalingChange(newState: PeerConnection.SignalingState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onRenegotiationNeeded() {}
        override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}
    }
    
    /**
     * Create observer for data channel messages.
     */
    private fun createDataChannelObserver() = object : DataChannel.Observer {
        override fun onMessage(buffer: DataChannel.Buffer) {
            val data = ByteArray(buffer.data.remaining())
            buffer.data.get(data)
            val message = String(data, StandardCharsets.UTF_8)
            CoroutineScope(Dispatchers.Main).launch {
                handleDataChannelMessage(message)
            }
        }
        
        override fun onBufferedAmountChange(amount: Long) {}
        override fun onStateChange() {
            dataChannel?.state()?.let { state ->
                Log.d(TAG, "Data channel state changed: $state")
                when (state) {
                    DataChannel.State.OPEN -> {
                        Log.i(TAG, "Data channel opened, sending session.update")
                        // Data channel is open, can send session.update
                        CoroutineScope(Dispatchers.IO).launch {
                            sendSessionUpdate()
                        }
                    }
                    DataChannel.State.CLOSED -> {
                        Log.w(TAG, "Data channel closed")
                        CoroutineScope(Dispatchers.Main).launch {
                            _connectionState.value = ConnectionState.Disconnected
                            _events.emit(RealtimeEvent.Disconnected)
                        }
                    }
                    else -> {}
                }
            }
        }
    }
    
    /**
     * Send session configuration to OpenAI.
     */
    private suspend fun sendSessionUpdate() {
        try {
            val sessionUpdate = buildJsonObject {
                put("type", "session.update")
                putJsonObject("session") {
                    put("modalities", buildJsonArray {
                        add("text")
                        add("audio")
                    })
                    put("instructions", "You are a helpful AI assistant for coding tasks.")
                    put("voice", "alloy")
                    put("input_audio_format", "pcm16")
                    put("output_audio_format", "pcm16")
                    put("input_audio_transcription", buildJsonObject {
                        put("model", "whisper-1")
                    })
                    put("turn_detection", buildJsonObject {
                        put("type", "server_vad")
                        put("threshold", 0.5)
                        put("prefix_padding_ms", 300)
                        put("silence_duration_ms", 200)
                    })
                    put("tools", buildJsonArray {
                        // MCP tools will be defined here in future
                    })
                }
            }
            
            val messageBytes = sessionUpdate.toString().toByteArray(StandardCharsets.UTF_8)
            val buffer = ByteBuffer.allocateDirect(messageBytes.size)
            buffer.put(messageBytes)
            buffer.flip()
            
            dataChannel?.send(DataChannel.Buffer(buffer, false))
            Log.d(TAG, "Session update sent successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send session update: ${e.message}", e)
            _events.emit(RealtimeEvent.Error("Failed to send session update: ${e.message}"))
        }
    }
    
    /**
     * Handle messages received on the data channel.
     */
    private suspend fun handleDataChannelMessage(message: String) {
        try {
            Log.d(TAG, "Received message: ${message.take(100)}...")
            val jsonElement = json.parseToJsonElement(message)
            val jsonObject = jsonElement.jsonObject
            
            val eventType = jsonObject["type"]?.jsonPrimitive?.content ?: return
            Log.d(TAG, "Event type: $eventType")
            
            when (eventType) {
                "session.created" -> {
                    Log.i(TAG, "Session created")
                    _events.emit(RealtimeEvent.Connected)
                }
                
                "session.updated" -> {
                    Log.d(TAG, "Session configuration confirmed")
                    // Session configuration confirmed
                }
                
                "conversation.item.created" -> {
                    Log.d(TAG, "Conversation item created")
                    val item = jsonObject["item"]?.jsonObject ?: return
                    handleConversationItem(item)
                }
                
                "response.audio_transcript.delta" -> {
                    val delta = jsonObject["delta"]?.jsonPrimitive?.content ?: ""
                    if (delta.isNotEmpty()) {
                        Log.d(TAG, "Transcript delta: $delta")
                        _events.emit(RealtimeEvent.Transcript(delta, false))
                    }
                }
                
                "response.audio_transcript.done" -> {
                    val transcript = jsonObject["transcript"]?.jsonPrimitive?.content ?: ""
                    if (transcript.isNotEmpty()) {
                        Log.i(TAG, "Transcript complete: $transcript")
                        _events.emit(RealtimeEvent.Transcript(transcript, true))
                    }
                }
                
                "conversation.item.input_audio_transcription.completed" -> {
                    val transcript = jsonObject["transcript"]?.jsonPrimitive?.content ?: ""
                    if (transcript.isNotEmpty()) {
                        Log.i(TAG, "User transcript: $transcript")
                        _events.emit(RealtimeEvent.Transcript("User: $transcript", true))
                    }
                }
                
                "response.function_call_arguments.done" -> {
                    val name = jsonObject["name"]?.jsonPrimitive?.content ?: return
                    val arguments = jsonObject["arguments"]?.jsonPrimitive?.content ?: "{}"
                    Log.i(TAG, "Tool call: $name with args: $arguments")
                    _events.emit(RealtimeEvent.ToolCall(name, arguments))
                }
                
                "error" -> {
                    val error = jsonObject["error"]?.jsonObject
                    val errorMessage = error?.get("message")?.jsonPrimitive?.content ?: "Unknown error"
                    Log.e(TAG, "Error from API: $errorMessage")
                    _events.emit(RealtimeEvent.Error(errorMessage))
                }
                
                else -> {
                    Log.d(TAG, "Unhandled event type: $eventType")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse message: ${e.message}", e)
            _events.emit(RealtimeEvent.Error("Failed to parse message: ${e.message}"))
        }
    }
    
    private suspend fun handleConversationItem(item: JsonObject) {
        val itemType = item["type"]?.jsonPrimitive?.content ?: return
        
        when (itemType) {
            "message" -> {
                val content = item["content"]?.jsonArray ?: return
                for (contentItem in content) {
                    val contentObj = contentItem.jsonObject
                    val contentType = contentObj["type"]?.jsonPrimitive?.content
                    
                    if (contentType == "text") {
                        val text = contentObj["text"]?.jsonPrimitive?.content ?: ""
                        if (text.isNotEmpty()) {
                            _events.emit(RealtimeEvent.Transcript(text, true))
                        }
                    }
                }
            }
            
            "function_call" -> {
                val name = item["name"]?.jsonPrimitive?.content ?: return
                val arguments = item["arguments"]?.jsonPrimitive?.content ?: "{}"
                _events.emit(RealtimeEvent.ToolCall(name, arguments))
            }
        }
    }
}
