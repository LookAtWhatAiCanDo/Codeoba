package llc.lookatwhataicando.codeoba.core.ui

import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import android.webkit.WebView as AndroidWebView

/**
 * Android implementation of WebView with back navigation support.
 * Handles:
 * - Back press to navigate WebView history
 * - Cookie persistence for logged-in sessions
 * - Pull-to-refresh gesture
 */
@Composable
actual fun WebViewWithBackHandler(
    url: String,
    modifier: Modifier,
    onWebViewCreated: ((Any?) -> Unit)?
) {
    var webView by remember { mutableStateOf<AndroidWebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    val swipeRefreshState = rememberSwipeRefreshState(isRefreshing)
    val coroutineScope = rememberCoroutineScope()
    
    // Handle back navigation
    BackHandler(enabled = canGoBack) {
        webView?.goBack()
    }
    
    SwipeRefresh(
        state = swipeRefreshState,
        onRefresh = {
            isRefreshing = true
            webView?.reload()
            coroutineScope.launch {
                delay(1000)
                isRefreshing = false
            }
        },
        modifier = modifier
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
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
                        
                        webViewClient = object : WebViewClient() {
                            override fun doUpdateVisitedHistory(
                                view: AndroidWebView?,
                                url: String?,
                                isReload: Boolean
                            ) {
                                super.doUpdateVisitedHistory(view, url, isReload)
                                // Update canGoBack state whenever navigation history changes
                                canGoBack = view?.canGoBack() ?: false
                            }
                        }
                        webChromeClient = WebChromeClient()
                        
                        loadUrl(url)
                        onWebViewCreated?.invoke(this)
                    }.also {
                        webView = it
                    }
                },
                update = { view ->
                    if (view.url != url) {
                        view.loadUrl(url)
                    }
                    // Update canGoBack state
                    canGoBack = view.canGoBack()
                }
            )
        }
    }
}
