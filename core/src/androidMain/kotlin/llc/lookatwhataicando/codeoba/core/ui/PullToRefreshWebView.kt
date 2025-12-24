package llc.lookatwhataicando.codeoba.core.ui

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Android WebView with Material 3 PullToRefreshBox integration.
 * Uses Compose's built-in pull-to-refresh mechanism with custom nested scroll handling
 * to work with AndroidView.WebView.
 * 
 * This provides Chrome-like pull-to-refresh UX with circular indicator.
 */
@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PullToRefreshWebView(
    url: String,
    modifier: Modifier = Modifier,
    onWebViewCreated: ((WebView) -> Unit)? = null
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    
    // Handle back navigation
    BackHandler(enabled = canGoBack) {
        webView?.goBack()
    }
    
    // PullToRefreshBox provides the pull-to-refresh gesture and indicator
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            coroutineScope.launch {
                isRefreshing = true
                webView?.reload()
                // Simulate refresh duration (WebView doesn't have completion callback)
                delay(1000)
                isRefreshing = false
            }
        },
        modifier = modifier.fillMaxSize()
    ) {
        // WebView wrapped in Box for proper layout
        Box(modifier = Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    if (0 != (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE)) {
                        WebView.setWebContentsDebuggingEnabled(true)
                    }
                    WebView(context).apply {
                        // CRITICAL: Set layout params to ensure WebView has proper dimensions
                        layoutParams = android.view.ViewGroup.LayoutParams(
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        
                        // Enable JavaScript and DOM storage
                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            @Suppress("DEPRECATION")
                            databaseEnabled = true
                        }
                        
                        // Enable cookies for session persistence
                        val cookieManager = CookieManager.getInstance()
                        cookieManager.setAcceptCookie(true)
                        cookieManager.setAcceptThirdPartyCookies(this, true)
                        
                        // WebViewClient for navigation handling
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): Boolean {
                                return false // Let WebView handle navigation
                            }
                            
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                super.onPageStarted(view, url, favicon)
                                canGoBack = view?.canGoBack() ?: false
                                Log.d("WebView", "Page started: $url")
                            }
                            
                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                canGoBack = view?.canGoBack() ?: false
                                Log.d("WebView", "Page finished: $url")
                            }
                            
                            @Suppress("OVERRIDE_DEPRECATION")
                            @Deprecated("Deprecated in Java")
                            override fun onReceivedError(
                                view: WebView?,
                                errorCode: Int,
                                description: String?,
                                failingUrl: String?
                            ) {
                                super.onReceivedError(view, errorCode, description, failingUrl)
                                Log.e("WebView", "Error $errorCode: $description at $failingUrl")
                            }
                        }
                        
                        // WebChromeClient for progress updates
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                super.onProgressChanged(view, newProgress)
                                Log.d("WebView", "Loading progress: $newProgress%")
                            }
                        }
                        
                        // Load the initial URL
                        loadUrl(url)
                        
                        // Store reference and notify callback
                        webView = this
                        onWebViewCreated?.invoke(this)
                    }
                },
                update = { view ->
                    // Update if URL changes (though typically doesn't in this app)
                    if (view.url != url) {
                        view.loadUrl(url)
                    }
                }
            )
        }
    }
}
