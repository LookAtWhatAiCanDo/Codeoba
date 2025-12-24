package llc.lookatwhataicando.codeoba.core.ui

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.awt.SwingPanel
import javafx.application.Platform
import javafx.embed.swing.JFXPanel
import javafx.scene.Scene
import javafx.scene.web.WebView as JFXWebView
import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * Desktop implementation of WebView with back navigation support.
 * Note: Desktop back navigation is handled via browser built-in controls.
 */
@Composable
actual fun WebViewWithBackHandler(
    url: String,
    modifier: Modifier,
    onWebViewCreated: ((Any?) -> Unit)?,
    onDebugInfoUpdate: ((scrollY: Int, isAtTop: Boolean, pullOffset: Float) -> Unit)?
) {
    // Desktop back navigation is handled by browser controls
    // Just delegate to the standard WebView
    // Note: Desktop doesn't support pull-to-refresh, so debug callback is ignored
    WebView(url = url, modifier = modifier)
}
