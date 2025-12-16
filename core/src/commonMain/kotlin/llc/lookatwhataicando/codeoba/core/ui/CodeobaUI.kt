package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import llc.lookatwhataicando.codeoba.core.CodeobaApp
import llc.lookatwhataicando.codeoba.core.EventLogEntry
import llc.lookatwhataicando.codeoba.core.domain.*
import kotlinx.coroutines.launch

@Composable
fun CodeobaUI(app: CodeobaApp, config: RealtimeConfig) {
    val connectionState by app.connectionState.collectAsState()
    val audioCaptureState by app.audioCaptureState.collectAsState()
    val eventLog by app.eventLog.collectAsState()
    val audioRoutes by app.audioRoutes.collectAsState()
    val activeRoute by app.activeAudioRoute.collectAsState()
    
    val scope = rememberCoroutineScope()
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Connection Panel
        ConnectionPanel(
            connectionState = connectionState,
            onConnect = { scope.launch { app.connect(config) } },
            onDisconnect = { scope.launch { app.disconnect() } }
        )
        
        // Voice Panel
        VoicePanel(
            audioCaptureState = audioCaptureState,
            connectionState = connectionState,
            onStartMic = { scope.launch { app.startMicrophone() } },
            onStopMic = { scope.launch { app.stopMicrophone() } }
        )
        
        // Audio Route Selection (if available)
        if (audioRoutes.isNotEmpty()) {
            AudioRoutePanel(
                routes = audioRoutes,
                activeRoute = activeRoute,
                onSelectRoute = { route -> scope.launch { app.selectAudioRoute(route) } }
            )
        }
        
        // Event Log
        EventLog(
            events = eventLog,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
fun ConnectionPanel(
    connectionState: ConnectionState,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit
) {
    Card {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Connection",
                style = MaterialTheme.typography.titleMedium
            )
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = when (connectionState) {
                        is ConnectionState.Disconnected -> "Disconnected"
                        is ConnectionState.Connecting -> "Connecting..."
                        is ConnectionState.Connected -> "Connected"
                        is ConnectionState.Error -> "Error: ${connectionState.message}"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f)
                )
                
                if (connectionState is ConnectionState.Connected) {
                    Button(onClick = onDisconnect) {
                        Text("Disconnect")
                    }
                } else {
                    Button(
                        onClick = onConnect,
                        enabled = connectionState !is ConnectionState.Connecting
                    ) {
                        Text("Connect")
                    }
                }
            }
        }
    }
}

@Composable
fun VoicePanel(
    audioCaptureState: AudioCaptureState,
    connectionState: ConnectionState,
    onStartMic: () -> Unit,
    onStopMic: () -> Unit
) {
    var textInput by remember { mutableStateOf("") }
    
    Card {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Voice & Text Input",
                style = MaterialTheme.typography.titleMedium
            )
            
            // Push-to-Talk Button (Walkie-Talkie Style)
            val isCapturing = audioCaptureState is AudioCaptureState.Capturing
            val isConnected = connectionState is ConnectionState.Connected
            
            Button(
                onClick = if (isCapturing) onStopMic else onStartMic,
                enabled = isConnected && audioCaptureState !is AudioCaptureState.Starting,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isCapturing) 
                        MaterialTheme.colorScheme.error 
                    else 
                        MaterialTheme.colorScheme.primary
                )
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = if (isCapturing) "🔴 Release to Stop" else "🎤 Push to Talk",
                        style = MaterialTheme.typography.titleLarge
                    )
                    Text(
                        text = when (audioCaptureState) {
                            is AudioCaptureState.Idle -> "Ready to record"
                            is AudioCaptureState.Starting -> "Starting..."
                            is AudioCaptureState.Capturing -> "Recording..."
                            is AudioCaptureState.Error -> "Error: ${audioCaptureState.message}"
                        },
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            
            // Text Input Alternative
            OutlinedTextField(
                value = textInput,
                onValueChange = { textInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Or type your command...") },
                placeholder = { Text("e.g., Create a new function called calculateSum") },
                enabled = isConnected,
                trailingIcon = {
                    if (textInput.isNotEmpty()) {
                        IconButton(
                            onClick = {
                                // TODO: Handle text submission
                                println("Text submitted: $textInput")
                                textInput = ""
                            }
                        ) {
                            Text("Send", style = MaterialTheme.typography.labelLarge)
                        }
                    }
                },
                maxLines = 3
            )
        }
    }
}

@Composable
fun AudioRoutePanel(
    routes: List<AudioRoute>,
    activeRoute: AudioRoute?,
    onSelectRoute: (AudioRoute) -> Unit
) {
    Card {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Audio Route",
                style = MaterialTheme.typography.titleMedium
            )
            
            routes.forEach { route ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    RadioButton(
                        selected = route.id == activeRoute?.id,
                        onClick = { onSelectRoute(route) }
                    )
                    Text(
                        text = route.name,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}

@Composable
fun EventLog(
    events: List<EventLogEntry>,
    modifier: Modifier = Modifier
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                text = "Event Log",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                items(events) { event ->
                    EventLogItem(event)
                }
            }
        }
    }
}

@Composable
fun EventLogItem(event: EventLogEntry) {
    val (text, color) = when (event) {
        is EventLogEntry.Transcript -> {
            val prefix = if (event.isFinal) "📝 " else "💭 "
            prefix + event.text to MaterialTheme.colorScheme.primary
        }
        is EventLogEntry.ToolCall -> {
            "🔧 Tool: ${event.name}\n   Args: ${event.args}" to MaterialTheme.colorScheme.secondary
        }
        is EventLogEntry.ToolResult -> {
            val icon = if (event.success) "✅" else "❌"
            "$icon ${event.name}: ${event.result}" to 
                if (event.success) MaterialTheme.colorScheme.tertiary 
                else MaterialTheme.colorScheme.error
        }
        is EventLogEntry.Info -> {
            "ℹ️ ${event.message}" to MaterialTheme.colorScheme.onSurface
        }
        is EventLogEntry.Error -> {
            "⚠️ ${event.message}" to MaterialTheme.colorScheme.error
        }
    }
    
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = color
    )
}
