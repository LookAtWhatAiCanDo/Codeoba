package llc.lookatwhataicando.codeoba.core.platform

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import llc.lookatwhataicando.codeoba.core.domain.AudioRoute
import llc.lookatwhataicando.codeoba.core.domain.AudioRouteManager
import llc.lookatwhataicando.codeoba.core.domain.AudioRouteType

/**
 * Desktop implementation of AudioRouteManager.
 * MVP: Minimal implementation with system default route only.
 */
class DesktopAudioRouteManager : AudioRouteManager {
    
    private val defaultRoute = AudioRoute(
        id = "default",
        type = AudioRouteType.SystemDefault,
        name = "System Default"
    )
    
    private val _availableRoutes = MutableStateFlow(listOf(defaultRoute))
    override val availableRoutes: StateFlow<List<AudioRoute>> = _availableRoutes.asStateFlow()
    
    private val _activeRoute = MutableStateFlow<AudioRoute?>(defaultRoute)
    override val activeRoute: StateFlow<AudioRoute?> = _activeRoute.asStateFlow()
    
    override suspend fun refreshRoutes() {
        // Desktop MVP: only default route
    }
    
    override suspend fun selectRoute(route: AudioRoute) {
        _activeRoute.value = route
    }
}
