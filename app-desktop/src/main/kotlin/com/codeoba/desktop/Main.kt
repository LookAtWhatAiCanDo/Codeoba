package com.codeoba.desktop

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.codeoba.core.CodeobaApp
import com.codeoba.core.data.CompanionProxyStub
import com.codeoba.core.data.McpClientImpl
import com.codeoba.core.data.RealtimeClientImpl
import com.codeoba.core.domain.RealtimeConfig
import com.codeoba.core.platform.DesktopAudioCaptureService
import com.codeoba.core.platform.DesktopAudioRouteManager
import com.codeoba.core.ui.CodeobaUI
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

fun main() = application {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    val codeobaApp = CodeobaApp(
        audioCaptureService = DesktopAudioCaptureService(),
        audioRouteManager = DesktopAudioRouteManager(),
        realtimeClient = RealtimeClientImpl(),
        mcpClient = McpClientImpl(),
        companionProxy = CompanionProxyStub(),
        scope = scope
    )
    
    Window(
        onCloseRequest = ::exitApplication,
        title = "Codeoba"
    ) {
        MaterialTheme {
            Surface {
                // TODO: Load API key from config/environment
                val config = RealtimeConfig(
                    apiKey = "your-api-key-here", // TODO: Load from config file
                    endpoint = "wss://api.openai.com/v1/realtime"
                )
                
                CodeobaUI(app = codeobaApp, config = config)
            }
        }
    }
}
