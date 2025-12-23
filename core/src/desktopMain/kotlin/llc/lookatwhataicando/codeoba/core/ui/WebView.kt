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
 * 
 * Note: JavaFX is automatically initialized when the first JFXPanel is created.
 * We don't need to explicitly call Platform.startup() as that can cause issues
 * when JavaFX is already initialized.
 */
@Composable
actual fun WebView(
    url: String,
    modifier: Modifier
) {
    SwingPanel(
        modifier = modifier,
        factory = {
            JPanel(BorderLayout()).apply {
                try {
                    // Creating JFXPanel automatically initializes JavaFX toolkit
                    val jfxPanel = JFXPanel()
                    add(jfxPanel, BorderLayout.CENTER)
                    
                    // Use Platform.runLater to ensure JavaFX thread is ready
                    Platform.runLater {
                        try {
                            val view = JFXWebView().apply {
                                // Enable JavaScript
                                engine.isJavaScriptEnabled = true
                                
                                // Set a modern user agent to ensure GitHub serves proper CSS
                                // Using Chrome on macOS to ensure full CSS/JS support
                                engine.userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                                    "Chrome/120.0.0.0 Safari/537.36"
                                
                                // Load the URL
                                engine.load(url)
                                
                                // Add console logging for debugging
                                engine.loadWorker.stateProperty().addListener { _, _, newState ->
                                    println("D/WebView: Load state: $newState, URL: ${engine.location}")
                                }
                            }
                            
                            val scene = Scene(view)
                            jfxPanel.scene = scene
                        } catch (e: Exception) {
                            e.printStackTrace()
                            println("Error initializing JavaFX WebView: ${e.message}")
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                    println("Error creating JFXPanel: ${e.message}")
                }
            }
        },
        update = { panel ->
            // Update URL when it changes
            try {
                Platform.runLater {
                    try {
                        val jfxPanel = panel.components.firstOrNull() as? JFXPanel
                        jfxPanel?.scene?.let { scene ->
                            val webView = scene.root as? JFXWebView
                            if (webView != null && webView.engine.location != url) {
                                webView.engine.load(url)
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        println("Error updating WebView URL: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                println("Error in Platform.runLater: ${e.message}")
            }
        }
    )
}
