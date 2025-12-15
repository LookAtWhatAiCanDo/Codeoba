package com.codeoba.core.data

import android.content.Context
import com.codeoba.core.domain.*
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.*
import org.webrtc.*
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

/**
 * Android implementation of RealtimeClient using WebRTC for OpenAI Realtime API.
 * 
 * Uses io.github.webrtc-sdk:android library for WebRTC functionality.
 */
actual class RealtimeClientImpl actual constructor() : RealtimeClient {
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    actual override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    private val _events = MutableSharedFlow<RealtimeEvent>(replay = 0)
    actual override val events: SharedFlow<RealtimeEvent> = _events.asSharedFlow()
    
    private var peerConnection: PeerConnection? = null
    private var dataChannel: DataChannel? = null
    private var audioTrack: AudioTrack? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    
    private val httpClient = HttpClient()
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
        appContext = context.applicationContext
        
        // Initialize WebRTC
        val initOptions = PeerConnectionFactory.InitializationOptions.builder(appContext)
            .setEnableInternalTracer(false)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(initOptions)
    }
    
    actual override suspend fun connect(config: RealtimeConfig) {
        if (_connectionState.value == ConnectionState.Connected || 
            _connectionState.value == ConnectionState.Connecting) {
            return
        }
        
        _connectionState.value = ConnectionState.Connecting
        
        try {
            if (appContext == null) {
                throw IllegalStateException("RealtimeClientImpl not initialized. Call initialize(context) first.")
            }
            
            // Step 1: Get ephemeral token from OpenAI
            ephemeralKey = getEphemeralToken(config.apiKey, config.model)
            
            // Step 2: Initialize PeerConnectionFactory
            if (peerConnectionFactory == null) {
                val options = PeerConnectionFactory.Options()
                peerConnectionFactory = PeerConnectionFactory.builder()
                    .setOptions(options)
                    .createPeerConnectionFactory()
            }
            
            // Step 3: Create peer connection with STUN servers
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
                throw IllegalStateException("Failed to create PeerConnection")
            }
            
            // Step 4: Create data channel for signaling
            val dataChannelInit = DataChannel.Init().apply {
                ordered = true
                negotiated = false
            }
            dataChannel = peerConnection?.createDataChannel("oai-events", dataChannelInit)
            dataChannel?.registerObserver(createDataChannelObserver())
            
            // Step 5: Add audio track
            val audioConstraints = MediaConstraints()
            val audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
            audioTrack = peerConnectionFactory?.createAudioTrack("audio", audioSource)
            
            if (audioTrack != null) {
                peerConnection?.addTrack(audioTrack, listOf("stream"))
            }
            
            // Step 6: Create SDP offer
            val offerConstraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            }
            
            peerConnection?.createOffer(object : SdpObserver {
                override fun onCreateSuccess(sessionDescription: SessionDescription) {
                    peerConnection?.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            CoroutineScope(Dispatchers.IO).launch {
                                try {
                                    // Step 7: Exchange SDP with OpenAI
                                    val answer = exchangeSDP(sessionDescription.description, ephemeralKey!!)
                                    peerConnection?.setRemoteDescription(object : SdpObserver {
                                        override fun onSetSuccess() {
                                            // Connection being established, wait for ICE connection
                                        }
                                        override fun onSetFailure(error: String) {
                                            CoroutineScope(Dispatchers.Main).launch {
                                                _connectionState.value = ConnectionState.Error("Failed to set remote description: $error")
                                                _events.emit(RealtimeEvent.Error(error))
                                            }
                                        }
                                        override fun onCreateSuccess(p0: SessionDescription?) {}
                                        override fun onCreateFailure(p0: String?) {}
                                    }, SessionDescription(SessionDescription.Type.ANSWER, answer))
                                } catch (e: Exception) {
                                    CoroutineScope(Dispatchers.Main).launch {
                                        _connectionState.value = ConnectionState.Error("Failed to exchange SDP: ${e.message}")
                                        _events.emit(RealtimeEvent.Error("Failed to exchange SDP: ${e.message}"))
                                    }
                                }
                            }
                        }
                        override fun onSetFailure(error: String) {
                            CoroutineScope(Dispatchers.Main).launch {
                                _connectionState.value = ConnectionState.Error("Failed to set local description: $error")
                                _events.emit(RealtimeEvent.Error(error))
                            }
                        }
                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onCreateFailure(p0: String?) {}
                    }, sessionDescription)
                }
                
                override fun onCreateFailure(error: String) {
                    CoroutineScope(Dispatchers.Main).launch {
                        _connectionState.value = ConnectionState.Error("Failed to create offer: $error")
                        _events.emit(RealtimeEvent.Error(error))
                    }
                }
                
                override fun onSetSuccess() {}
                override fun onSetFailure(p0: String?) {}
            }, offerConstraints)
            
        } catch (e: Exception) {
            val errorMsg = "Failed to connect: ${e.message}"
            _connectionState.value = ConnectionState.Error(errorMsg)
            _events.emit(RealtimeEvent.Error(errorMsg))
        }
    }
    
    actual override suspend fun disconnect() {
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
            
            ephemeralKey = null
            
            _connectionState.value = ConnectionState.Disconnected
            _events.emit(RealtimeEvent.Disconnected)
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.Disconnected
            _events.emit(RealtimeEvent.Disconnected)
        }
    }
    
    actual override suspend fun sendAudioFrame(frame: ByteArray) {
        if (_connectionState.value != ConnectionState.Connected) {
            return
        }
        
        try {
            // With WebRTC AudioTrack, audio is sent automatically via RTP
            // The audioTrack handles encoding and transmission internally
            // No manual frame sending needed for standard WebRTC audio streaming
        } catch (e: Exception) {
            _events.emit(RealtimeEvent.Error("Failed to send audio: ${e.message}"))
        }
    }
    
    /**
     * Get ephemeral token from OpenAI for WebRTC session.
     */
    private suspend fun getEphemeralToken(apiKey: String, model: String): String {
        try {
            val response: HttpResponse = httpClient.post("https://api.openai.com/v1/realtime/sessions") {
                header(HttpHeaders.Authorization, "Bearer $apiKey")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("model", model)
                    put("voice", "alloy")
                }.toString())
            }
            
            val responseBody = response.bodyAsText()
            val jsonResponse = json.parseToJsonElement(responseBody).jsonObject
            
            return jsonResponse["client_secret"]?.jsonObject?.get("value")?.jsonPrimitive?.content
                ?: throw IllegalStateException("No ephemeral key in response")
                
        } catch (e: Exception) {
            throw IllegalStateException("Failed to get ephemeral token: ${e.message}", e)
        }
    }
    
    /**
     * Exchange SDP offer/answer with OpenAI.
     */
    private suspend fun exchangeSDP(sdpOffer: String, ephemeralToken: String): String {
        try {
            val response: HttpResponse = httpClient.post("https://api.openai.com/v1/realtime") {
                header(HttpHeaders.Authorization, "Bearer $ephemeralToken")
                header(HttpHeaders.ContentType, ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("type", "offer")
                    put("sdp", sdpOffer)
                }.toString())
            }
            
            val responseBody = response.bodyAsText()
            val jsonResponse = json.parseToJsonElement(responseBody).jsonObject
            
            return jsonResponse["sdp"]?.jsonPrimitive?.content
                ?: throw IllegalStateException("No SDP in response")
                
        } catch (e: Exception) {
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
            dataChannel = channel
            channel.registerObserver(createDataChannelObserver())
        }
        
        override fun onAddTrack(receiver: RtpReceiver, streams: Array<MediaStream>) {
            // Handle incoming audio track from OpenAI
        }
        
        override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {
            CoroutineScope(Dispatchers.Main).launch {
                when (newState) {
                    PeerConnection.IceConnectionState.CONNECTED,
                    PeerConnection.IceConnectionState.COMPLETED -> {
                        _connectionState.value = ConnectionState.Connected
                        _events.emit(RealtimeEvent.Connected)
                    }
                    PeerConnection.IceConnectionState.FAILED -> {
                        _connectionState.value = ConnectionState.Error("ICE connection failed")
                        _events.emit(RealtimeEvent.Error("ICE connection failed"))
                    }
                    PeerConnection.IceConnectionState.DISCONNECTED -> {
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
                when (state) {
                    DataChannel.State.OPEN -> {
                        // Data channel is open, can send session.update
                        CoroutineScope(Dispatchers.IO).launch {
                            sendSessionUpdate()
                        }
                    }
                    DataChannel.State.CLOSED -> {
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
        } catch (e: Exception) {
            _events.emit(RealtimeEvent.Error("Failed to send session update: ${e.message}"))
        }
    }
    
    /**
     * Handle messages received on the data channel.
     */
    private suspend fun handleDataChannelMessage(message: String) {
        try {
            val jsonElement = json.parseToJsonElement(message)
            val jsonObject = jsonElement.jsonObject
            
            val eventType = jsonObject["type"]?.jsonPrimitive?.content ?: return
            
            when (eventType) {
                "session.created" -> {
                    _events.emit(RealtimeEvent.Connected)
                }
                
                "session.updated" -> {
                    // Session configuration confirmed
                }
                
                "conversation.item.created" -> {
                    val item = jsonObject["item"]?.jsonObject ?: return
                    handleConversationItem(item)
                }
                
                "response.audio_transcript.delta" -> {
                    val delta = jsonObject["delta"]?.jsonPrimitive?.content ?: ""
                    if (delta.isNotEmpty()) {
                        _events.emit(RealtimeEvent.Transcript(delta, false))
                    }
                }
                
                "response.audio_transcript.done" -> {
                    val transcript = jsonObject["transcript"]?.jsonPrimitive?.content ?: ""
                    if (transcript.isNotEmpty()) {
                        _events.emit(RealtimeEvent.Transcript(transcript, true))
                    }
                }
                
                "conversation.item.input_audio_transcription.completed" -> {
                    val transcript = jsonObject["transcript"]?.jsonPrimitive?.content ?: ""
                    if (transcript.isNotEmpty()) {
                        _events.emit(RealtimeEvent.Transcript("User: $transcript", true))
                    }
                }
                
                "response.function_call_arguments.done" -> {
                    val name = jsonObject["name"]?.jsonPrimitive?.content ?: return
                    val arguments = jsonObject["arguments"]?.jsonPrimitive?.content ?: "{}"
                    _events.emit(RealtimeEvent.ToolCall(name, arguments))
                }
                
                "error" -> {
                    val error = jsonObject["error"]?.jsonObject
                    val errorMessage = error?.get("message")?.jsonPrimitive?.content ?: "Unknown error"
                    _events.emit(RealtimeEvent.Error(errorMessage))
                }
            }
        } catch (e: Exception) {
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
