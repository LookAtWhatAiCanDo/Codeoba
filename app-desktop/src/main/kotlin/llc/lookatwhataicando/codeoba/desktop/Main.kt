package llc.lookatwhataicando.codeoba.desktop

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import llc.lookatwhataicando.codeoba.core.CodeobaApp
import llc.lookatwhataicando.codeoba.core.data.CompanionProxyStub
import llc.lookatwhataicando.codeoba.core.data.McpClientImpl
import llc.lookatwhataicando.codeoba.core.data.realtime.RealtimeClientImpl
import llc.lookatwhataicando.codeoba.core.domain.realtime.RealtimeConfig
import llc.lookatwhataicando.codeoba.core.platform.DesktopAudioCaptureService
import llc.lookatwhataicando.codeoba.core.platform.DesktopAudioRouteManager
import llc.lookatwhataicando.codeoba.core.ui.CodeobaUI
import java.io.File
import java.util.Properties

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
                // API key priority:
                // 1. Environment variable OPENAI_API_KEY
                // 2. System property openai.api.key
                // 3. local.properties file
                val apiKey = getApiKey()
                
                val config = RealtimeConfig(
                    dangerousApiKey = apiKey,
                    endpoint = System.getenv("REALTIME_ENDPOINT") 
                        ?: System.getProperty("realtime.endpoint")
                        ?: "https://api.openai.com/v1/realtime"
                )
                
                CodeobaUI(app = codeobaApp, config = config)
            }
        }
    }
}

/**
 * Gets the API key from various sources in priority order:
 * 1. OPENAI_API_KEY environment variable
 * 2. openai.api.key system property  
 * 3. DANGEROUS_OPENAI_API_KEY from local.properties
 */
private fun getApiKey(): String {
    // Check environment variable
    System.getenv("OPENAI_API_KEY")?.let { return it }
    
    // Check system property
    System.getProperty("openai.api.key")?.let { return it }
    
    // Check local.properties file
    val localPropertiesFile = File("local.properties")
    if (localPropertiesFile.exists()) {
        val properties = Properties()
        localPropertiesFile.inputStream().use { properties.load(it) }
        properties.getProperty("DANGEROUS_OPENAI_API_KEY")?.let { 
            if (it.isNotBlank()) return it 
        }
    }
    
    error("OPENAI_API_KEY not configured. Set OPENAI_API_KEY environment variable or add DANGEROUS_OPENAI_API_KEY to local.properties. See docs/dev-setup.md")
}
