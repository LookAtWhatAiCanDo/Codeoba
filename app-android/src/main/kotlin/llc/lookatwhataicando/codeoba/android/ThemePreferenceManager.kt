package llc.lookatwhataicando.codeoba.android

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Theme mode options for the app.
 */
enum class ThemeMode {
    LIGHT,
    DARK,
    SYSTEM
}

/**
 * Manages theme preferences for the application.
 * Stores user's theme selection and provides reactive state updates.
 */
class ThemePreferenceManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "theme_prefs",
        Context.MODE_PRIVATE
    )
    
    private val _themeMode = MutableStateFlow(loadThemeMode())
    val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()
    
    companion object {
        private const val KEY_THEME_MODE = "theme_mode"
    }
    
    private fun loadThemeMode(): ThemeMode {
        val savedMode = prefs.getString(KEY_THEME_MODE, ThemeMode.SYSTEM.name)
        return try {
            ThemeMode.valueOf(savedMode ?: ThemeMode.SYSTEM.name)
        } catch (e: IllegalArgumentException) {
            ThemeMode.SYSTEM
        }
    }
    
    fun setThemeMode(mode: ThemeMode) {
        prefs.edit().putString(KEY_THEME_MODE, mode.name).apply()
        _themeMode.value = mode
    }
}

/**
 * Composable helper to get the current theme mode.
 */
@Composable
fun ThemePreferenceManager.currentThemeMode(): ThemeMode {
    val mode by themeMode.collectAsState()
    return mode
}
