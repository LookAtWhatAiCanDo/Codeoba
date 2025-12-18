package llc.lookatwhataicando.codeoba.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import llc.lookatwhataicando.codeoba.core.CodeobaApp
import llc.lookatwhataicando.codeoba.core.data.CompanionProxyStub
import llc.lookatwhataicando.codeoba.core.data.McpClientImpl
import llc.lookatwhataicando.codeoba.core.data.RealtimeClientImpl
import llc.lookatwhataicando.codeoba.core.domain.RealtimeConfig
import llc.lookatwhataicando.codeoba.core.platform.AndroidAudioCaptureService
import llc.lookatwhataicando.codeoba.core.platform.AndroidAudioRouteManager
import llc.lookatwhataicando.codeoba.core.ui.CodeobaUI
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.util.Base64

class MainActivity : ComponentActivity() {
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var codeobaApp: CodeobaApp
    
    companion object {
        private const val TAG = "MainActivity"
        private const val PREFS_NAME = "codeoba_prefs"
        private const val KEY_API_KEY_ENCRYPTED = "api_key_encrypted"
        private const val KEY_IV = "api_key_iv"
        private const val KEYSTORE_ALIAS = "CodeobaApiKeyAlias"
    }
    
    private val snackbarHostState = SnackbarHostState()
    
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (!isGranted) {
            // Handle permission denied
        }
    }
    
    private val requestMultiplePermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        permissions.entries.forEach { entry ->
            if (!entry.value) {
                // Handle permission denied
                val permissionName = when (entry.key) {
                    Manifest.permission.RECORD_AUDIO -> "Microphone"
                    Manifest.permission.BLUETOOTH_CONNECT -> "Bluetooth"
                    else -> entry.key
                }
                val message = "$permissionName permission denied. Some features may not work."
                Log.w(TAG, message)
                
                // Show snackbar to inform user
                scope.launch {
                    snackbarHostState.showSnackbar(message)
                }
            }
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Request required permissions
        requestRequiredPermissions()
        
        // Initialize CodeobaApp with platform-specific implementations
        val realtimeClient = RealtimeClientImpl()
        realtimeClient.initialize(this) // Initialize with Android Context
        
        val audioCaptureService = AndroidAudioCaptureService(this, scope)
        audioCaptureService.realtimeClient = realtimeClient // Wire up for PTT control
        
        codeobaApp = CodeobaApp(
            audioCaptureService = audioCaptureService,
            audioRouteManager = AndroidAudioRouteManager(this),
            realtimeClient = realtimeClient,
            mcpClient = McpClientImpl(),
            companionProxy = CompanionProxyStub(),
            scope = scope
        )
        
        setContent {
            MaterialTheme {
                Scaffold(
                    snackbarHost = { SnackbarHost(snackbarHostState) }
                ) { _ ->
                    Surface {
                        // Get API key from secure storage or BuildConfig default
                        val apiKey = getApiKey()
                        
                        val config = RealtimeConfig(
                            dangerousApiKey = apiKey,
                            // TODO: Better injection of endpoint from BuildConfig...
                            endpoint = System.getProperty("realtime.endpoint")
                                ?: "https://api.openai.com/v1/realtime"
                        )
                        
                        CodeobaUI(app = codeobaApp, config = config)
                    }
                }
            }
        }
    }
    
    /**
     * Gets the API key from encrypted SharedPreferences.
     * Falls back to BuildConfig default if not found.
     * 
     * The API key is encrypted using Android Keystore for security.
     */
    private fun getApiKey(): String {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val encryptedKey = prefs.getString(KEY_API_KEY_ENCRYPTED, null)
        val iv = prefs.getString(KEY_IV, null)
        
        return if (encryptedKey != null && iv != null) {
            try {
                decryptApiKey(encryptedKey, iv)
            } catch (e: Exception) {
                // Fall back to BuildConfig default if decryption fails
                initializeDefaultApiKey()
            }
        } else {
            // Initialize with BuildConfig default on first run
            initializeDefaultApiKey()
        }
    }
    
    /**
     * Stores the API key in encrypted SharedPreferences.
     * 
     * @param apiKey The API key to store securely
     */
    private fun setApiKey(apiKey: String) {
        val (encrypted, iv) = encryptApiKey(apiKey)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_API_KEY_ENCRYPTED, encrypted)
            .putString(KEY_IV, iv)
            .apply()
    }
    
    private fun initializeDefaultApiKey(): String {
        val defaultKey = BuildConfig.DANGEROUS_OPENAI_API_KEY
        if (defaultKey.isNotBlank()) {
            // Store the default key securely on first run
            setApiKey(defaultKey)
            return defaultKey
        } else {
            error("OPENAI_API_KEY not configured. Add DANGEROUS_OPENAI_API_KEY to local.properties. See docs/dev-setup.md")
        }
    }
    
    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        
        return if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
            (keyStore.getEntry(KEYSTORE_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
        } else {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
            )
            keyGenerator.init(
                KeyGenParameterSpec.Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(false)
                    .build()
            )
            keyGenerator.generateKey()
        }
    }
    
    private fun encryptApiKey(apiKey: String): Pair<String, String> {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val iv = cipher.iv
        val encrypted = cipher.doFinal(apiKey.toByteArray(Charsets.UTF_8))
        
        return Pair(
            Base64.encodeToString(encrypted, Base64.NO_WRAP),
            Base64.encodeToString(iv, Base64.NO_WRAP)
        )
    }
    
    private fun decryptApiKey(encryptedKey: String, ivString: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val iv = Base64.decode(ivString, Base64.NO_WRAP)
        val spec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), spec)
        
        val encrypted = Base64.decode(encryptedKey, Base64.NO_WRAP)
        val decrypted = cipher.doFinal(encrypted)
        
        return String(decrypted, Charsets.UTF_8)
    }
    
    /**
     * Request required runtime permissions.
     * - RECORD_AUDIO: Required for microphone access
     * - BLUETOOTH_CONNECT: Required for Bluetooth audio routing on Android 12+ (API 31+)
     */
    private fun requestRequiredPermissions() {
        val permissionsToRequest = mutableListOf<String>()
        
        // Check RECORD_AUDIO permission
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            permissionsToRequest.add(Manifest.permission.RECORD_AUDIO)
        }
        
        // Check BLUETOOTH_CONNECT permission (required on Android 12+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.BLUETOOTH_CONNECT
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                permissionsToRequest.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        }
        
        // Request permissions if needed
        if (permissionsToRequest.isNotEmpty()) {
            requestMultiplePermissionsLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }
}
