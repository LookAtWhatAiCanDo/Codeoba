package llc.lookatwhataicando.codeoba.core.ui

import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.util.Log
import android.view.MotionEvent
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Android implementation of WebView with back navigation support.
 * Handles:
 * - Back press to navigate WebView history
 * - Cookie persistence for logged-in sessions
 * - Pull-to-refresh gesture (custom implementation to avoid gesture conflicts)
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun WebViewWithBackHandler(
    url: String,
    modifier: Modifier,
    onWebViewCreated: ((Any?) -> Unit)?
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var pullOffset by remember { mutableFloatStateOf(0f) }
    var scrollY by remember { mutableIntStateOf(0) }
    val coroutineScope = rememberCoroutineScope()
    
    val refreshThreshold = with(LocalDensity.current) { 80.dp.toPx() }
    
    // Handle back navigation
    BackHandler(enabled = canGoBack) {
        webView?.goBack()
    }
    
    Box(
        modifier = modifier.fillMaxSize()
    ) {
        // WebView
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .offset { IntOffset(0, pullOffset.roundToInt()) },
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
                    
                    // Security: Restrict file access since we only load remote HTTPS content
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    
                    // Set background color
                    setBackgroundColor(android.graphics.Color.WHITE)

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            super.onPageStarted(view, url, favicon)
                            Log.d("WebView", "Page started loading: $url")
                        }
                        
                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            Log.d("WebView", "Page finished loading: $url")
                            scrollY = view?.scrollY ?: 0
                        }
                        
                        override fun doUpdateVisitedHistory(
                            view: WebView?,
                            url: String?,
                            isReload: Boolean
                        ) {
                            super.doUpdateVisitedHistory(view, url, isReload)
                            canGoBack = view?.canGoBack() ?: false
                            scrollY = view?.scrollY ?: 0
                        }
                        
                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?
                        ): Boolean {
                            // Allow all navigation within the WebView
                            return false
                        }
                        
                        override fun onReceivedError(
                            view: WebView?,
                            errorCode: Int,
                            description: String?,
                            failingUrl: String?
                        ) {
                            super.onReceivedError(view, errorCode, description, failingUrl)
                            Log.e("WebView", "Error loading page: $description (code: $errorCode) URL: $failingUrl")
                        }
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView?, newProgress: Int) {
                            super.onProgressChanged(view, newProgress)
                            Log.d("WebView", "Loading progress: $newProgress%")
                        }
                    }
                    
                    // Monitor scroll changes
                    setOnScrollChangeListener { _, _, newScrollY, _, _ ->
                        scrollY = newScrollY
                    }
                    
                    // Implement pull-to-refresh with touch listener
                    // This must be done at the WebView level since AndroidView consumes touches
                    var downY = 0f
                    var totalDragDistance = 0f
                    var isDragging = false
                    
                    setOnTouchListener { view, event ->
                        when (event.action) {
                            MotionEvent.ACTION_DOWN -> {
                                downY = event.y
                                totalDragDistance = 0f
                                isDragging = false
                                false // Don't consume, let WebView handle it
                            }
                            MotionEvent.ACTION_MOVE -> {
                                val currentY = event.y
                                val deltaY = currentY - downY
                                
                                // Check if we're at the top of the page and dragging down
                                val isAtTop = (view as? WebView)?.scrollY == 0
                                
                                if (isAtTop && deltaY > 0 && !isRefreshing) {
                                    // Start pull-to-refresh
                                    isDragging = true
                                    totalDragDistance = deltaY
                                    
                                    // Apply resistance
                                    val resistance = if (totalDragDistance > refreshThreshold) 0.3f else 0.5f
                                    pullOffset = (totalDragDistance * resistance).coerceAtLeast(0f)
                                    
                                    // Consume touch event to prevent scrolling
                                    true
                                } else {
                                    false // Let WebView handle normal scrolling
                                }
                            }
                            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                                if (isDragging) {
                                    isDragging = false
                                    
                                    // Trigger refresh if threshold met
                                    if (totalDragDistance > refreshThreshold) {
                                        isRefreshing = true
                                        coroutineScope.launch {
                                            (view as? WebView)?.reload()
                                            delay(1000)
                                            isRefreshing = false
                                        }
                                    }
                                    
                                    // Animate pull offset back to 0
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
                                    
                                    true // Consume the up event
                                } else {
                                    false // Let WebView handle it
                                }
                            }
                            else -> false
                        }
                    }
                    
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
