package llc.lookatwhataicando.codeoba.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureService
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureState
import llc.lookatwhataicando.codeoba.core.domain.AudioRoute
import llc.lookatwhataicando.codeoba.core.domain.AudioRouteManager
import llc.lookatwhataicando.codeoba.core.domain.CompanionCommand
import llc.lookatwhataicando.codeoba.core.domain.CompanionProxy
import llc.lookatwhataicando.codeoba.core.domain.McpClient
import llc.lookatwhataicando.codeoba.core.domain.McpResult
import llc.lookatwhataicando.codeoba.core.domain.realtime.ConnectionState
import llc.lookatwhataicando.codeoba.core.domain.realtime.RealtimeClient
import llc.lookatwhataicando.codeoba.core.domain.realtime.RealtimeConfig
import llc.lookatwhataicando.codeoba.core.domain.realtime.RealtimeEvent

/**
 * Main app state and coordinator.
 * Manages the overall application state and coordinates between services.
 */
class CodeobaApp(
    private val audioCaptureService: AudioCaptureService,
    private val audioRouteManager: AudioRouteManager,
    val realtimeClient: RealtimeClient,
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
        
        // Note: With WebRTC JavaAudioDeviceModule, audio capture and transmission
        // is handled automatically by WebRTC. No need to manually pipe audio frames.
    }
    
    suspend fun connect(config: RealtimeConfig) {
        addEventLogEntry(EventLogEntry.Info("Connecting to ${config.endpoint}..."))
        try {
            realtimeClient.connect(config)
            // Connection state changes are reported via events flow
        } catch (e: IllegalStateException) {
            // IllegalStateException indicates initialization or state issues
            addEventLogEntry(EventLogEntry.Error("Setup error: ${e.message}"))
        } catch (e: Exception) {
            // Other exceptions are typically network-related
            addEventLogEntry(EventLogEntry.Error("Network error: ${e.message}"))
        }
    }
    
    suspend fun disconnect() {
        realtimeClient.disconnect()
        if (audioCaptureState.value == AudioCaptureState.Capturing) {
            stopMicrophone()
        }
    }
    
    suspend fun startMicrophone() {
        addEventLogEntry(EventLogEntry.Info("Enabling microphone..."))
        try {
            // Note: AudioCaptureService is only used for UI state tracking on Android.
            // Actual audio capture is handled by WebRTC's JavaAudioDeviceModule.
            audioCaptureService.start()
            addEventLogEntry(EventLogEntry.Info("Microphone enabled"))
        } catch (e: SecurityException) {
            addEventLogEntry(EventLogEntry.Error("Permission denied: Please grant microphone permission"))
        } catch (e: Exception) {
            addEventLogEntry(EventLogEntry.Error("Failed to enable microphone: ${e.message}"))
        }
    }
    
    suspend fun stopMicrophone() {
        addEventLogEntry(EventLogEntry.Info("Disabling microphone..."))
        audioCaptureService.stop()
    }
    
    suspend fun sendTextMessage(text: String) {
        addEventLogEntry(EventLogEntry.Info("Sending text message: $text"))
        try {
            val success = realtimeClient.dataSendConversationItemCreateUserMessageInputText(text)
            if (success) {
                // Add user's text message to event log
                addEventLogEntry(EventLogEntry.Transcript(text, true))
                // Request response from AI
                try {
                    realtimeClient.dataSendResponseCreate()
                } catch (e: Exception) {
                    addEventLogEntry(EventLogEntry.Error("Failed to request AI response: ${e.message}"))
                }
            } else {
                addEventLogEntry(EventLogEntry.Error("Failed to send text message"))
            }
        } catch (e: IllegalStateException) {
            addEventLogEntry(EventLogEntry.Error("Not connected: ${e.message}"))
        } catch (e: Exception) {
            addEventLogEntry(EventLogEntry.Error("Failed to send text: ${e.message}"))
        }
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
