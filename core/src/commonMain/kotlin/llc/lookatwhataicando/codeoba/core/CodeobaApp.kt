package llc.lookatwhataicando.codeoba.core

import llc.lookatwhataicando.codeoba.core.domain.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * Main app state and coordinator.
 * Manages the overall application state and coordinates between services.
 */
class CodeobaApp(
    private val audioCaptureService: AudioCaptureService,
    private val audioRouteManager: AudioRouteManager,
    private val realtimeClient: RealtimeClient,
    private val mcpClient: McpClient,
    private val companionProxy: CompanionProxy,
    private val scope: CoroutineScope
) {
    // State flows
    val connectionState: StateFlow<ConnectionState> = realtimeClient.connectionState
    val audioCaptureState: StateFlow<AudioCaptureState> = audioCaptureService.state
    val audioRoutes: StateFlow<List<AudioRoute>> = audioRouteManager.availableRoutes
    val activeAudioRoute: StateFlow<AudioRoute?> = audioRouteManager.activeRoute
    
    private val _eventLog = MutableStateFlow<List<EventLogEntry>>(emptyList())
    val eventLog: StateFlow<List<EventLogEntry>> = _eventLog.asStateFlow()
    
    init {
        // Observe realtime events and add to event log
        scope.launch {
            realtimeClient.events.collect { event ->
                addEventLogEntry(event.toEventLogEntry())
                
                // Handle tool calls via MCP
                if (event is RealtimeEvent.ToolCall) {
                    handleToolCall(event.name, event.argumentsJson)
                }
            }
        }
        
        // Pipe audio frames to realtime client
        scope.launch {
            var frameCount = 0L
            audioCaptureService.audioFrames.collect { frame ->
                if (connectionState.value == ConnectionState.Connected) {
                    frameCount++
                    // Log every 100th frame to avoid spam
                    if (frameCount % 100 == 0L) {
                        addEventLogEntry(EventLogEntry.Info("Audio streaming: ${frameCount} frames sent"))
                    }
                    realtimeClient.sendAudioFrame(frame)
                }
            }
        }
    }
    
    suspend fun connect(config: RealtimeConfig) {
        addEventLogEntry(EventLogEntry.Info("Connecting to ${config.endpoint}..."))
        try {
            realtimeClient.connect(config)
            // Connection state changes are reported via events flow
        } catch (e: IllegalStateException) {
            addEventLogEntry(EventLogEntry.Error("Connection failed: ${e.message}"))
        } catch (e: Exception) {
            addEventLogEntry(EventLogEntry.Error("Connection error: ${e.message}"))
        }
    }
    
    suspend fun disconnect() {
        realtimeClient.disconnect()
        if (audioCaptureState.value == AudioCaptureState.Capturing) {
            stopMicrophone()
        }
    }
    
    suspend fun startMicrophone() {
        addEventLogEntry(EventLogEntry.Info("Starting microphone..."))
        try {
            audioCaptureService.start()
            // Check if start failed by checking state after a brief moment
            kotlinx.coroutines.delay(100)
            when (val currentState = audioCaptureState.value) {
                is AudioCaptureState.Error -> {
                    addEventLogEntry(EventLogEntry.Error("Microphone error: ${currentState.message}"))
                }
                is AudioCaptureState.Capturing -> {
                    addEventLogEntry(EventLogEntry.Info("Microphone started successfully"))
                }
                else -> {
                    // Still starting or other state
                }
            }
        } catch (e: SecurityException) {
            addEventLogEntry(EventLogEntry.Error("Permission denied: Please grant microphone permission"))
        } catch (e: Exception) {
            addEventLogEntry(EventLogEntry.Error("Failed to start microphone: ${e.message}"))
        }
    }
    
    suspend fun stopMicrophone() {
        addEventLogEntry(EventLogEntry.Info("Stopping microphone..."))
        audioCaptureService.stop()
    }
    
    suspend fun selectAudioRoute(route: AudioRoute) {
        audioRouteManager.selectRoute(route)
        addEventLogEntry(EventLogEntry.Info("Audio route changed to: ${route.name}"))
    }
    
    private suspend fun handleToolCall(name: String, argsJson: String) {
        addEventLogEntry(EventLogEntry.ToolCall(name, argsJson))
        
        val result = mcpClient.handleToolCall(name, argsJson)
        when (result) {
            is McpResult.Success -> {
                addEventLogEntry(EventLogEntry.ToolResult(name, result.summary, true))
                companionProxy.sendCommand(CompanionCommand.ShowRepoEvent(result.summary))
            }
            is McpResult.Failure -> {
                addEventLogEntry(EventLogEntry.ToolResult(name, result.message, false))
                companionProxy.sendCommand(CompanionCommand.ShowError(result.message))
            }
        }
    }
    
    private fun addEventLogEntry(entry: EventLogEntry) {
        _eventLog.value = _eventLog.value + entry
    }
}

sealed class EventLogEntry {
    data class Transcript(val text: String, val isFinal: Boolean) : EventLogEntry()
    data class ToolCall(val name: String, val args: String) : EventLogEntry()
    data class ToolResult(val name: String, val result: String, val success: Boolean) : EventLogEntry()
    data class Info(val message: String) : EventLogEntry()
    data class Error(val message: String) : EventLogEntry()
}

private fun RealtimeEvent.toEventLogEntry(): EventLogEntry = when (this) {
    is RealtimeEvent.Transcript -> EventLogEntry.Transcript(text, isFinal)
    is RealtimeEvent.ToolCall -> EventLogEntry.ToolCall(name, argumentsJson)
    is RealtimeEvent.Error -> EventLogEntry.Error(message)
    is RealtimeEvent.Connected -> EventLogEntry.Info("Connected to Realtime API")
    is RealtimeEvent.Disconnected -> EventLogEntry.Info("Disconnected from Realtime API")
}
