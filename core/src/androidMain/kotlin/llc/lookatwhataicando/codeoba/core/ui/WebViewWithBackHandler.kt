package llc.lookatwhataicando.codeoba.core.ui

import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import android.webkit.WebView as AndroidWebView
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Android implementation of WebView with back navigation support.
 * Handles:
 * - Back press to navigate WebView history
 * - Cookie persistence for logged-in sessions
 * - Pull-to-refresh gesture (custom implementation to avoid gesture conflicts)
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
    var pullOffset by remember { mutableFloatStateOf(0f) }
    val coroutineScope = rememberCoroutineScope()
    
    val refreshThreshold = with(LocalDensity.current) { 80.dp.toPx() }
    
    // Handle back navigation
    BackHandler(enabled = canGoBack) {
        webView?.goBack()
    }
    
    Box(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    var totalDrag = 0f
                    
                    // Check if WebView is scrolled to top
                    val isAtTop = webView?.scrollY == 0
                    
                    if (isAtTop && !isRefreshing) {
                        drag(down.id) { change ->
                            val dragAmount = change.positionChange().y
                            
                            // Only handle downward drags when at top
                            if (dragAmount > 0 || totalDrag > 0) {
                                totalDrag += dragAmount
                                
                                // Apply resistance to the drag
                                val resistance = if (totalDrag > refreshThreshold) 0.3f else 0.5f
                                pullOffset = (totalDrag * resistance).coerceAtLeast(0f)
                                
                                // Consume the change to prevent the drawer from opening
                                if (abs(dragAmount) > abs(change.positionChange().x)) {
                                    change.consume()
                                }
                            }
                        }
                        
                        // Trigger refresh if threshold met
                        if (totalDrag > refreshThreshold) {
                            isRefreshing = true
                            coroutineScope.launch {
                                webView?.reload()
                                delay(1000)
                                isRefreshing = false
                            }
                        }
                        
                        // Animate back to 0
                        coroutineScope.launch {
                            val start = pullOffset
                            val duration = 200L
                            val startTime = System.currentTimeMillis()
                            
                            while (pullOffset > 0) {
                                val elapsed = System.currentTimeMillis() - startTime
                                val progress = (elapsed.toFloat() / duration).coerceIn(0f, 1f)
                                pullOffset = start * (1f - progress)
                                
                                if (progress >= 1f) {
                                    pullOffset = 0f
                                    break
                                }
                                delay(16)
                            }
                        }
                    }
                }
            }
    ) {
        // WebView
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .offset { IntOffset(0, pullOffset.roundToInt()) },
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
        
        // Refresh indicator
        if (isRefreshing || pullOffset > 0) {
            CircularProgressIndicator(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset { IntOffset(0, (pullOffset * 0.5f).roundToInt()) }
                    .size(32.dp)
                    .graphicsLayer {
                        alpha = (pullOffset / refreshThreshold).coerceIn(0f, 1f)
                        scaleX = (pullOffset / refreshThreshold).coerceIn(0f, 1f)
                        scaleY = (pullOffset / refreshThreshold).coerceIn(0f, 1f)
                    }
            )
        }
    }
}
