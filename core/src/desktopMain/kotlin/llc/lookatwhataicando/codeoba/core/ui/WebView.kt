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
 * Desktop implementation of WebView using JavaFX WebView.
 */
@Composable
actual fun WebView(
    url: String,
    modifier: Modifier
) {
    var webView by remember { mutableStateOf<JFXWebView?>(null) }
    
    // Initialize JavaFX platform if not already initialized
    LaunchedEffect(Unit) {
        try {
            Platform.startup {}
        } catch (e: IllegalStateException) {
            // JavaFX platform already initialized
        }
    }
    
    // Load URL when it changes
    LaunchedEffect(url) {
        webView?.let { view ->
            Platform.runLater {
                view.engine.load(url)
            }
        }
    }
    
    SwingPanel(
        modifier = modifier,
        factory = {
            JPanel(BorderLayout()).apply {
                val jfxPanel = JFXPanel()
                add(jfxPanel, BorderLayout.CENTER)
                
                Platform.runLater {
                    val view = JFXWebView().apply {
                        engine.load(url)
                    }
                    
                    webView = view
                    
                    val scene = Scene(view)
                    jfxPanel.scene = scene
                }
            }
        }
    )
}
