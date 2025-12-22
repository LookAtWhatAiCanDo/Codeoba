package llc.lookatwhataicando.codeoba.android

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Simple test activity with just a WebView - no tabs, no drawer, no pull-to-refresh.
 * Used to isolate WebView rendering issues.
 */
class TestWebViewActivity : ComponentActivity() {
    
    companion object {
        private const val TAG = "TestWebViewActivity"
        private const val TEST_URL = "https://github.com/copilot/agents"
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    SimpleWebView(url = TEST_URL)
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SimpleWebView(url: String) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                Log.d("TestWebViewActivity", "Creating WebView")
                
                // Basic settings
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                
                // Cookie support
                CookieManager.getInstance().setAcceptCookie(true)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                
                // Cache configuration
                settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
                settings.databaseEnabled = true
                
                // Modern web features
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                settings.allowFileAccess = true
                settings.allowContentAccess = true
                
                // Zoom
                settings.setSupportZoom(true)
                settings.builtInZoomControls = true
                settings.displayZoomControls = false
                
                // Set white background
                setBackgroundColor(android.graphics.Color.WHITE)
                
                // WebView client for logging
                webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                        super.onPageStarted(view, url, favicon)
                        Log.d("TestWebViewActivity", "Page started: $url")
                    }
                    
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d("TestWebViewActivity", "Page finished: $url")
                    }
                    
                    override fun onReceivedError(
                        view: WebView?,
                        errorCode: Int,
                        description: String?,
                        failingUrl: String?
                    ) {
                        super.onReceivedError(view, errorCode, description, failingUrl)
                        Log.e("TestWebViewActivity", "Error: $description (code: $errorCode) URL: $failingUrl")
                    }
                }
                
                webChromeClient = object : WebChromeClient() {
                    override fun onProgressChanged(view: WebView?, newProgress: Int) {
                        super.onProgressChanged(view, newProgress)
                        Log.d("TestWebViewActivity", "Progress: $newProgress%")
                    }
                }
                
                Log.d("TestWebViewActivity", "Loading URL: $url")
                loadUrl(url)
            }
        }
    )
}
