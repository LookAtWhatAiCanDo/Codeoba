package llc.lookatwhataicando.codeoba.core.domain

import kotlinx.coroutines.flow.StateFlow

/**
 * Manages audio routing (e.g., Bluetooth headset, speaker, earpiece).
 * Platform-specific implementations handle device-specific routing APIs.
 */
interface AudioRouteManager {
    val availableRoutes: StateFlow<List<AudioRoute>>
    val activeRoute: StateFlow<AudioRoute?>
    
    suspend fun refreshRoutes()
    suspend fun selectRoute(route: AudioRoute)
}

data class AudioRoute(
    val id: String,
    val type: AudioRouteType,
    val name: String
)

enum class AudioRouteType {
    BluetoothHeadset,
    WiredHeadset,
    Speaker,
    Earpiece,
    SystemDefault
}
