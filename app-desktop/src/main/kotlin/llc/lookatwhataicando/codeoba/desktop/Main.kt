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
import llc.lookatwhataicando.codeoba.core.domain.createLogger
import llc.lookatwhataicando.codeoba.core.domain.realtime.RealtimeConfig
import llc.lookatwhataicando.codeoba.core.platform.DesktopAudioCaptureService
import llc.lookatwhataicando.codeoba.core.platform.DesktopAudioRouteManager
import llc.lookatwhataicando.codeoba.core.ui.CodeobaUI
import java.io.File
import java.util.Properties

fun main() = application {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    val logger = createLogger()
    
    val codeobaApp = CodeobaApp(
        audioCaptureService = DesktopAudioCaptureService(),
        audioRouteManager = DesktopAudioRouteManager(),
        realtimeClient = RealtimeClientImpl(),
        mcpClient = createMcpClient(logger),
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
 * Creates MCP client with GitHub token if configured, otherwise returns a stub.
 */
private fun createMcpClient(logger: llc.lookatwhataicando.codeoba.core.domain.Logger): llc.lookatwhataicando.codeoba.core.domain.McpClient {
    val githubToken = getGithubToken()
    return if (githubToken != null) {
        logger.i("MCP Client", "Initializing with GitHub token")
        McpClientImpl(
            githubToken = githubToken,
            logger = logger
        )
    } else {
        logger.w("MCP Client", "No GitHub token configured, MCP features disabled")
        // Return stub implementation that doesn't connect
        object : llc.lookatwhataicando.codeoba.core.domain.McpClient {
            override suspend fun handleToolCall(name: String, argsJson: String) = 
                llc.lookatwhataicando.codeoba.core.domain.McpResult.Failure(
                    "GitHub token not configured. Set GITHUB_TOKEN environment variable or add DANGEROUS_GITHUB_TOKEN to local.properties"
                )
        }
    }
}

/**
 * Gets the GitHub token from various sources in priority order:
 * 1. GITHUB_TOKEN environment variable
 * 2. github.token system property
 * 3. DANGEROUS_GITHUB_TOKEN from local.properties
 */
private fun getGithubToken(): String? {
    // Check environment variable
    System.getenv("GITHUB_TOKEN")?.let { if (it.isNotBlank()) return it }
    
    // Check system property
    System.getProperty("github.token")?.let { if (it.isNotBlank()) return it }
    
    // Check local.properties file
    val localPropertiesFile = File("local.properties")
    if (localPropertiesFile.exists()) {
        val properties = Properties()
        localPropertiesFile.inputStream().use { properties.load(it) }
        properties.getProperty("DANGEROUS_GITHUB_TOKEN")?.let { 
            if (it.isNotBlank()) return it 
        }
    }
    
    return null
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
