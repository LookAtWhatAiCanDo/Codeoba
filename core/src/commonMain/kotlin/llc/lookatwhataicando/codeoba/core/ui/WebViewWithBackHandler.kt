package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Platform-agnostic WebView component with back navigation support.
 * Handles back press to navigate within the WebView history.
 * 
 * @param url The URL to load in the WebView
 * @param modifier The modifier to apply to the WebView
 * @param onWebViewCreated Callback when WebView is created (for platform-specific handling)
 */
@Composable
expect fun WebViewWithBackHandler(
    url: String,
    modifier: Modifier = Modifier,
    onWebViewCreated: ((Any?) -> Unit)? = null
)
