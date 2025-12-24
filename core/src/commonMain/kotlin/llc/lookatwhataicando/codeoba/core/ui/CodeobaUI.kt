package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import llc.lookatwhataicando.codeoba.core.CodeobaApp
import llc.lookatwhataicando.codeoba.core.EventLogEntry
import llc.lookatwhataicando.codeoba.core.domain.AudioCaptureState
import llc.lookatwhataicando.codeoba.core.domain.AudioRoute
import llc.lookatwhataicando.codeoba.core.domain.createLogger
import llc.lookatwhataicando.codeoba.core.domain.realtime.ConnectionState
import llc.lookatwhataicando.codeoba.core.domain.realtime.RealtimeConfig
import llc.lookatwhataicando.codeoba.core.mirror

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CodeobaUI(
    app: CodeobaApp,
    config: RealtimeConfig,
    currentThemeMode: String = "SYSTEM",
    onThemeChange: ((String) -> Unit)? = null,
    onTestWebViewClick: (() -> Unit)? = null
) {
    val connectionState by app.connectionState.collectAsState()
    val audioCaptureState by app.audioCaptureState.collectAsState()
    val eventLog by app.eventLog.collectAsState()
    val audioRoutes by app.audioRoutes.collectAsState()
    val activeRoute by app.activeAudioRoute.collectAsState()
    
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    
    // Tab state
    var selectedTabIndex by remember { mutableStateOf(0) }
    val tabs = listOf("Realtime", "Agent")
    
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        "Menu",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(vertical = 16.dp)
                    )
                    HorizontalDivider()
                    
                    // Theme Selector
                    if (onThemeChange != null) {
                        Text(
                            "Theme",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
                        )
                        ThemeSelector(
                            currentMode = currentThemeMode,
                            onModeSelected = onThemeChange
                        )
                        HorizontalDivider(modifier = Modifier.padding(top = 8.dp))
                    }
                    
                    // Test WebView menu item
                    if (onTestWebViewClick != null) {
                        TextButton(
                            onClick = {
                                scope.launch {
                                    drawerState.close()
                                }
                                onTestWebViewClick()
                            }
                        ) {
                            Text("Test WebView")
                        }
                        HorizontalDivider()
                    }
                    
                    // Placeholder menu items
                    Text("Settings")
                    Text("About")
                }
            }
        }
    ) {
        Scaffold(
            topBar = {
                Column {
                    TopAppBar(
                        title = { Text("Codeoba") },
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Text("☰", style = MaterialTheme.typography.headlineMedium)
                            }
                        },
                        actions = {
                            // Only show connection switch in Realtime tab
                            if (selectedTabIndex == 0) {
                                Switch(
                                    modifier = Modifier.padding(horizontal = 16.dp),
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
                        },
                        windowInsets = WindowInsets(0, 0, 0, 0)
                    )
                    
                    // Tabs below the top bar
                    PrimaryTabRow(selectedTabIndex = selectedTabIndex) {
                        tabs.forEachIndexed { index, title ->
                            Tab(
                                selected = selectedTabIndex == index,
                                onClick = { selectedTabIndex = index },
                                text = { Text(title) }
                            )
                        }
                    }
                }
            },
            bottomBar = {
                // Only show bottom bar for Realtime tab
                if (selectedTabIndex == 0) {
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
            }
        ) { innerPadding ->
            // Tab content
            when (selectedTabIndex) {
                0 -> {
                    // Realtime tab: Conversation panel with integrated text input
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
                1 -> {
                    // Agents tab: Browser view
                    AgentTabContent(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    )
                }
            }
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
    val TAG = "PushToTalkFooter"
    val logger = remember { createLogger() }
    val isCapturing = audioCaptureState is AudioCaptureState.Capturing
    val isConnected = connectionState is ConnectionState.Connected
    var isPressed by remember { mutableStateOf(false) }
    
    // Log state changes for debugging
    remember(isCapturing, isConnected, isPressed) {
        logger.d(TAG, "State: isCapturing=$isCapturing, isConnected=$isConnected, isPressed=$isPressed, audioCaptureState=${audioCaptureState::class.simpleName}")
        null
    }
    
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
            // Large PTT Button - positioned for thumb access with momentary press behavior
            val isEnabled = isConnected && audioCaptureState !is AudioCaptureState.Starting
            
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(72.dp)
                    .background(
                        color = if (isCapturing || isPressed) {
                            MaterialTheme.colorScheme.error
                        } else if (isEnabled) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant
                        },
                        shape = RoundedCornerShape(8.dp)
                    )
                    .alpha(if (isEnabled) 1.0f else 0.38f)
                    .pointerInput(isEnabled) {
                        if (isEnabled) {
                            awaitEachGesture {
                                // Wait for initial press
                                val down = awaitFirstDown()
                                down.consume()
                                isPressed = true
                                onStartMic()
                                
                                // Wait for all pointers to be released
                                // Continue loop while the original pointer is still down
                                do {
                                    val event = awaitPointerEvent()
                                    event.changes.forEach { change -> change.consume() }
                                    // Check if the original pointer (or any currently pressed pointer from this gesture) is still down
                                    val anyPressed = event.changes.any { it.pressed }
                                } while (anyPressed)
                                
                                // All pointers released
                                isPressed = false
                                onStopMic()
                            }
                        } else {
                            awaitEachGesture {
                                while (true) {
                                    val event = awaitPointerEvent()
                                    event.changes.forEach { it.consume() }
                                }
                            }
                        }
                    }
            ) {
                Text(
                    text = if (isCapturing || isPressed) "Release to Stop" else "Push to Talk",
                    style = MaterialTheme.typography.titleLarge,
                    color = if (isEnabled) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                    }
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
                fun doSendInputText() {
                    textInput = textInput.trim()
                    if (textInput.isNotEmpty()) {
                        onSendText(textInput)
                        textInput = ""
                    }
                }

                Box(modifier = Modifier.weight(1f)) {
                    OutlinedTextField(
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Default
                        ),
                        value = textInput,
                        onValueChange = { textInput = it },
                        placeholder = { Text("Text Input") },
                        enabled = isConnected,
                        minLines = 3,
                        maxLines = 10
                    )
                    IconButton(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(end = 8.dp, bottom = 8.dp),
                        enabled = isConnected && textInput.isNotEmpty(),
                        onClick = { doSendInputText() }
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Send"
                        )
                    }
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
                        .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
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

@Composable
fun ThemeSelector(
    currentMode: String,
    onModeSelected: (String) -> Unit
) {
    val themeModes = listOf("LIGHT", "DARK", "SYSTEM")
    val themeLabels = mapOf(
        "LIGHT" to "☀️ Light",
        "DARK" to "🌙 Dark",
        "SYSTEM" to "⚙️ System"
    )
    
    val selectedIndex = themeModes.indexOf(currentMode).takeIf { it >= 0 } ?: 2
    
    SingleChoiceSegmentedButtonRow(
        modifier = Modifier.fillMaxWidth()
    ) {
        themeModes.forEachIndexed { index, mode ->
            SegmentedButton(
                selected = index == selectedIndex,
                onClick = { onModeSelected(mode) },
                shape = SegmentedButtonDefaults.itemShape(
                    index = index,
                    count = themeModes.size
                ),
                icon = {}
            ) {
                Text(
                    text = themeLabels[mode] ?: mode,
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

