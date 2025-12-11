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
                // API key must be provided via environment variable or config file
                // See docs/dev-setup.md for configuration instructions
                val apiKey = System.getenv("OPENAI_API_KEY") 
                    ?: System.getProperty("openai.api.key")
                    ?: error("OPENAI_API_KEY not configured. Set environment variable or system property. See docs/dev-setup.md for details.")
                
                val config = RealtimeConfig(
                    apiKey = apiKey,
                    endpoint = System.getenv("REALTIME_ENDPOINT") 
                        ?: System.getProperty("realtime.endpoint")
                        ?: "wss://api.openai.com/v1/realtime"
                )
                
                CodeobaUI(app = codeobaApp, config = config)
            }
        }
    }
}
