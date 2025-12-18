package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import llc.lookatwhataicando.codeoba.core.CodeobaApp
import llc.lookatwhataicando.codeoba.core.EventLogEntry
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureState
import llc.lookatwhataicando.codeoba.core.domain.AudioRoute
import llc.lookatwhataicando.codeoba.core.domain.realtime.ConnectionState
import llc.lookatwhataicando.codeoba.core.domain.realtime.RealtimeConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CodeobaUI(app: CodeobaApp, config: RealtimeConfig) {
    val connectionState by app.connectionState.collectAsState()
    val audioCaptureState by app.audioCaptureState.collectAsState()
    val eventLog by app.eventLog.collectAsState()
    val audioRoutes by app.audioRoutes.collectAsState()
    val activeRoute by app.activeAudioRoute.collectAsState()
    
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                // Placeholder drawer content
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        "Menu",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(vertical = 16.dp)
                    )
                    Divider()
                    // Placeholder menu items
                    Text("Settings")
                    Text("About")
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Codeoba") },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Text("☰", style = MaterialTheme.typography.headlineMedium)
                        }
                    },
                    actions = {
                        Switch(
                            checked = connectionState is ConnectionState.Connected || connectionState is ConnectionState.Connecting,
                            onCheckedChange = { isChecked ->
                                if (isChecked) {
                                    scope.launch { app.connect(config) }
                                } else {
                                    scope.launch { app.disconnect() }
                                }
                            },
                            enabled = connectionState !is ConnectionState.Connecting
                        )
                    }
                )
            },
            bottomBar = {
                Column {
                    // Footer with PTT Button
                    PushToTalkFooter(
                        audioCaptureState = audioCaptureState,
                        connectionState = connectionState,
                        onStartMic = { scope.launch {
                            // TODO: cancelRemoteSpeech()
                            // TODO: play intro sound
                            app.startMicrophone()
                            app.realtimeClient.dataSendInputAudioBufferClear()
                        } },
                        onStopMic = { scope.launch {
                            app.stopMicrophone()
                            app.realtimeClient.dataSendInputAudioBufferCommit()
                            app.realtimeClient.dataSendResponseCreate()
                            // TODO: play outro sound
                        } }
                    )
                    
                    // Audio Route Dropdown (only show if multiple routes available)
                    if (audioRoutes.size > 1) {
                        AudioRouteDropdown(
                            routes = audioRoutes,
                            activeRoute = activeRoute,
                            onSelectRoute = { route -> scope.launch { app.selectAudioRoute(route) } }
                        )
                    }
                }
            }
        ) { innerPadding ->
            // Conversation panel with integrated text input
            ConversationPanel(
                events = eventLog,
                connectionState = connectionState,
                onSendText = { text ->
                    scope.launch {
                        app.sendTextMessage(text)
                    }
                },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(16.dp)
            )
        }
    }
}

@Composable
fun PushToTalkFooter(
    audioCaptureState: AudioCaptureState,
    connectionState: ConnectionState,
    onStartMic: () -> Unit,
    onStopMic: () -> Unit
) {
    val isCapturing = audioCaptureState is AudioCaptureState.Capturing
    val isConnected = connectionState is ConnectionState.Connected
    var isPressed by remember { mutableStateOf(false) }
    
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 3.dp,
        shadowElevation = 8.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Status text
            Text(
                text = when (audioCaptureState) {
                    is AudioCaptureState.Idle -> "Ready to talk"
                    is AudioCaptureState.Starting -> "Starting microphone..."
                    is AudioCaptureState.Capturing -> "🔴 Talking..."
                    is AudioCaptureState.Error -> "⚠️ ${audioCaptureState.message}"
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (isCapturing || isPressed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
            )
            
            // Large PTT Button - positioned for thumb access with momentary press behavior
            val buttonModifier = Modifier
                .fillMaxWidth()
                .height(72.dp)
                .then(
                    if (isConnected && audioCaptureState !is AudioCaptureState.Starting) {
                        Modifier.pointerInput(Unit) {
                            awaitEachGesture {
                                // Wait for initial press
                                awaitFirstDown()
                                isPressed = true
                                onStartMic()
                                
                                // Wait for all pointers to be released
                                do {
                                    val event = awaitPointerEvent()
                                } while (event.changes.any { !it.changedToUp() })
                                
                                // All pointers released
                                isPressed = false
                                onStopMic()
                            }
                        }
                    } else {
                        Modifier
                    }
                )
            
            Button(
                onClick = { /* Handled by pointerInput */ },
                enabled = isConnected && audioCaptureState !is AudioCaptureState.Starting,
                modifier = buttonModifier,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isCapturing || isPressed) 
                        MaterialTheme.colorScheme.error 
                    else 
                        MaterialTheme.colorScheme.primary,
                    disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Text(
                    text = if (isCapturing || isPressed) "🔴 Release to Stop" else "🎤 Push to Talk",
                    style = MaterialTheme.typography.titleLarge
                )
            }
        }
    }
}

@Composable
fun ConversationPanel(
    events: List<EventLogEntry>,
    connectionState: ConnectionState,
    onSendText: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var textInput by remember { mutableStateOf("") }
    val isConnected = connectionState is ConnectionState.Connected
    
    Card(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
        ) {
            // Conversation header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Conversation:",
                    style = MaterialTheme.typography.titleMedium
                )
            }
            
            // Conversation messages (scrollable)
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(events) { event ->
                    ConversationMessage(event)
                }
            }
            
            // Text input at bottom
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = textInput,
                    onValueChange = { textInput = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Text Input") },
                    enabled = isConnected,
                    singleLine = true
                )
                Button(
                    onClick = {
                        if (textInput.isNotEmpty()) {
                            onSendText(textInput)
                            textInput = ""
                        }
                    },
                    enabled = isConnected && textInput.isNotEmpty()
                ) {
                    Text("Send")
                }
            }
        }
    }
}

@Composable
fun ConversationMessage(event: EventLogEntry) {
    when (event) {
        is EventLogEntry.Transcript -> {
            // Local message (user input) - aligned left
            Card(
                modifier = Modifier.fillMaxWidth(0.8f),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Text(
                    text = event.text,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }
        is EventLogEntry.ToolCall, is EventLogEntry.ToolResult, is EventLogEntry.Info -> {
            // Remote message (AI response) - aligned right
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                Card(
                    modifier = Modifier.fillMaxWidth(0.8f),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    )
                ) {
                    val text = when (event) {
                        is EventLogEntry.ToolCall -> "Tool: ${event.name}"
                        is EventLogEntry.ToolResult -> {
                            val icon = if (event.success) "✅" else "❌"
                            "$icon ${event.name}: ${event.result}"
                        }
                        is EventLogEntry.Info -> event.message
                        else -> ""
                    }
                    Text(
                        text = text,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }
        }
        is EventLogEntry.Error -> {
            // Error message - full width
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = "⚠️ ${event.message}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AudioRouteDropdown(
    routes: List<AudioRoute>,
    activeRoute: AudioRoute?,
    onSelectRoute: (AudioRoute) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 1.dp
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = !expanded }
            ) {
                OutlinedTextField(
                    value = activeRoute?.name ?: "Select Audio Device",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Audio Device") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    routes.forEach { route ->
                        DropdownMenuItem(
                            text = { Text(route.name) },
                            onClick = {
                                onSelectRoute(route)
                                expanded = false
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TextInputPanel(
    connectionState: ConnectionState,
    onSendText: (String) -> Unit
) {
    var textInput by remember { mutableStateOf("") }
    val isConnected = connectionState is ConnectionState.Connected
    
    Card {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Text Input",
                style = MaterialTheme.typography.titleMedium
            )
            
            OutlinedTextField(
                value = textInput,
                onValueChange = { textInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Type your command...") },
                placeholder = { Text("e.g., Create a new function called calculateSum") },
                enabled = isConnected,
                trailingIcon = {
                    if (textInput.isNotEmpty()) {
                        IconButton(
                            onClick = {
                                onSendText(textInput)
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

