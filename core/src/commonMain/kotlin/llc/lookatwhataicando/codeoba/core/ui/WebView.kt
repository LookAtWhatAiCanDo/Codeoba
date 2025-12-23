package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Platform-agnostic WebView component.
 * Displays web content with basic navigation support.
 * 
 * @param url The URL to load in the WebView
 * @param modifier The modifier to apply to the WebView
 */
@Composable
expect fun WebView(
    url: String,
    modifier: Modifier = Modifier
)
