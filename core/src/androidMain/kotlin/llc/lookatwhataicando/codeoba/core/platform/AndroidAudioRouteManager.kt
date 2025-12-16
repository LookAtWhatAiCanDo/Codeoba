package llc.lookatwhataicando.codeoba.core.platform

import android.Manifest
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.annotation.RequiresPermission
import llc.lookatwhataicando.codeoba.core.domain.AudioRoute
import llc.lookatwhataicando.codeoba.core.domain.AudioRouteManager
import llc.lookatwhataicando.codeoba.core.domain.AudioRouteType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Android implementation of AudioRouteManager.
 * Manages audio routing (Bluetooth, speaker, earpiece, etc.).
 */
class AndroidAudioRouteManager(
    private val context: Context
) : AudioRouteManager {
    
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    
    private val _availableRoutes = MutableStateFlow<List<AudioRoute>>(emptyList())
    override val availableRoutes: StateFlow<List<AudioRoute>> = _availableRoutes.asStateFlow()
    
    private val _activeRoute = MutableStateFlow<AudioRoute?>(null)
    override val activeRoute: StateFlow<AudioRoute?> = _activeRoute.asStateFlow()
    
    init {
        refreshRoutesSync()
    }
    
    override suspend fun refreshRoutes() {
        refreshRoutesSync()
    }
    
    private fun refreshRoutesSync() {
        val routes = mutableListOf<AudioRoute>()
        
        // Get available audio devices
        val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        
        devices.forEach { device ->
            val route = when (device.type) {
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> {
                    AudioRoute(
                        id = "bluetooth_${device.id}",
                        type = AudioRouteType.BluetoothHeadset,
                        name = device.productName.toString().ifEmpty { "Bluetooth Device" }
                    )
                }
                AudioDeviceInfo.TYPE_WIRED_HEADSET,
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> {
                    AudioRoute(
                        id = "wired_${device.id}",
                        type = AudioRouteType.WiredHeadset,
                        name = "Wired Headset"
                    )
                }
                AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> {
                    AudioRoute(
                        id = "speaker_${device.id}",
                        type = AudioRouteType.Speaker,
                        name = "Speaker"
                    )
                }
                AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> {
                    AudioRoute(
                        id = "earpiece_${device.id}",
                        type = AudioRouteType.Earpiece,
                        name = "Earpiece"
                    )
                }
                else -> null
            }
            
            route?.let { routes.add(it) }
        }
        
        // Add system default if no routes found
        if (routes.isEmpty()) {
            routes.add(
                AudioRoute(
                    id = "default",
                    type = AudioRouteType.SystemDefault,
                    name = "System Default"
                )
            )
        }
        
        _availableRoutes.value = routes
        
        // Set active route if not set
        if (_activeRoute.value == null && routes.isNotEmpty()) {
            _activeRoute.value = routes.first()
        }
    }
    
    @RequiresPermission(
        allOf = [
            Manifest.permission.BLUETOOTH,
            Manifest.permission.MODIFY_AUDIO_SETTINGS
        ]
    )
    override suspend fun selectRoute(route: AudioRoute) {
        // Basic implementation - in production, use AudioManager.setMode and routing APIs
        _activeRoute.value = route
        
        when (route.type) {
            AudioRouteType.Speaker -> {
                audioManager.mode = AudioManager.MODE_NORMAL
                audioManager.isSpeakerphoneOn = true
            }
            AudioRouteType.BluetoothHeadset -> {
                audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                audioManager.startBluetoothSco()
                audioManager.isBluetoothScoOn = true
            }
            else -> {
                audioManager.mode = AudioManager.MODE_NORMAL
                audioManager.isSpeakerphoneOn = false
            }
        }
    }
}
