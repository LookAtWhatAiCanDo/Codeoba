package com.codeoba.android

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import com.codeoba.core.CodeobaApp
import com.codeoba.core.data.CompanionProxyStub
import com.codeoba.core.data.McpClientImpl
import com.codeoba.core.data.RealtimeClientImpl
import com.codeoba.core.domain.RealtimeConfig
import com.codeoba.core.platform.AndroidAudioCaptureService
import com.codeoba.core.platform.AndroidAudioRouteManager
import com.codeoba.core.ui.CodeobaUI
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class MainActivity : ComponentActivity() {
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var codeobaApp: CodeobaApp
    
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (!isGranted) {
            // Handle permission denied
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Request microphone permission
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
        
        // Initialize CodeobaApp with platform-specific implementations
        codeobaApp = CodeobaApp(
            audioCaptureService = AndroidAudioCaptureService(this, scope),
            audioRouteManager = AndroidAudioRouteManager(this),
            realtimeClient = RealtimeClientImpl(),
            mcpClient = McpClientImpl(),
            companionProxy = CompanionProxyStub(),
            scope = scope
        )
        
        setContent {
            MaterialTheme {
                Surface {
                    // TODO: Load API key from config/environment
                    val config = RealtimeConfig(
                        apiKey = "your-api-key-here", // TODO: Load from secure storage
                        endpoint = "wss://api.openai.com/v1/realtime"
                    )
                    
                    CodeobaUI(app = codeobaApp, config = config)
                }
            }
        }
    }
}
