package llc.lookatwhataicando.codeoba.core.ui

import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import android.webkit.WebView as AndroidWebView

/**
 * Android implementation of WebView using Android WebView.
 * Supports:
 * - Cookie persistence for logged-in sessions
 * - Cache for better performance
 */
@Composable
actual fun WebView(
    url: String,
    modifier: Modifier
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            AndroidWebView(context).apply {
                // Enable JavaScript and DOM storage
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                
                // Enable zoom controls
                settings.setSupportZoom(true)
                settings.builtInZoomControls = true
                settings.displayZoomControls = false
                
                // Enable persistent cookies and cache for logged-in sessions
                settings.databaseEnabled = true
                settings.setGeolocationEnabled(false)
                
                // Enable cookies and persistent storage
                CookieManager.getInstance().setAcceptCookie(true)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                
                // Cache configuration for better performance
                settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
                
                // User agent (keep default)
                settings.userAgentString = settings.userAgentString
                
                webViewClient = WebViewClient()
                webChromeClient = WebChromeClient()
                
                loadUrl(url)
            }
        },
        update = { view ->
            if (view.url != url) {
                view.loadUrl(url)
            }
        }
    )
}
