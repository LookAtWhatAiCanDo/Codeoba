package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Agents tab content displaying the GitHub Copilot Agents page in a browser.
 * Provides easy navigation with gestures support and a refresh button.
 * 
 * @param onWebViewCreated Callback when WebView is created, provides the WebView instance
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentTabContent(
    modifier: Modifier = Modifier,
    onWebViewCreated: ((Any?) -> Unit)? = null
) {
    // Debug flag - tap title 3 times to toggle
    val showDebugInfo = remember { mutableStateOf(false) }
    var debugScrollY by remember { mutableIntStateOf(0) }
    var debugIsAtTop by remember { mutableStateOf(false) }
    var debugPullOffset by remember { mutableFloatStateOf(0f) }
    var tapCount by remember { mutableIntStateOf(0) }
    var lastTapTime by remember { mutableLongStateOf(0L) }
    
    // WebView reference for refresh button
    var webViewRef by remember { mutableStateOf<Any?>(null) }
    
    Column(modifier = modifier.fillMaxSize()) {
        // Header
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surfaceVariant,
            tonalElevation = 2.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Title with tap-to-enable debug feature (triple-tap to toggle)
                Text(
                    text = "GitHub Copilot Agents",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier
                        .weight(1f)
                        .clickable {
                            val currentTime = System.currentTimeMillis()
                            if (currentTime - lastTapTime < 500) {
                                tapCount++
                                if (tapCount >= 3) {
                                    showDebugInfo.value = !showDebugInfo.value
                                    tapCount = 0
                                }
                            } else {
                                tapCount = 1
                            }
                            lastTapTime = currentTime
                        }
                )
                
                // Debug info display (triple-tap title to toggle)
                if (showDebugInfo.value) {
                    Text(
                        text = "scrollY=$debugScrollY ${if (debugIsAtTop) "TOP" else "---"} pull=${debugPullOffset.toInt()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
                
                // Refresh button
                IconButton(
                    onClick = {
                        // Reload the WebView using platform-specific handling
                        webViewRef?.let { view ->
                            // Try to call reload() via reflection for platform compatibility
                            try {
                                val reloadMethod = view::class.java.getMethod("reload")
                                reloadMethod.invoke(view)
                            } catch (e: Exception) {
                                // Silently fail if reload method not available
                            }
                        }
                    }
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Refresh page"
                    )
                }
            }
        }
        
        // WebView content
        WebViewWithBackHandler(
            url = "https://github.com/copilot/agents",
            modifier = Modifier.fillMaxSize(),
            onWebViewCreated = { view ->
                webViewRef = view
                onWebViewCreated?.invoke(view)
            },
            onDebugInfoUpdate = if (showDebugInfo.value) {
                { scrollY, isAtTop, pullOffset ->
                    debugScrollY = scrollY
                    debugIsAtTop = isAtTop
                    debugPullOffset = pullOffset
                }
            } else null
        )
    }
}
