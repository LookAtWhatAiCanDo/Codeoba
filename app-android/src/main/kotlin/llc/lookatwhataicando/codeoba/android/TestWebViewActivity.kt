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
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Test activity with WebView and editable address bar.
 * Used to isolate and diagnose WebView rendering issues.
 */
class TestWebViewActivity : ComponentActivity() {
    
    companion object {
        private const val TAG = "TestWebViewActivity"
        private const val DEFAULT_URL = "https://github.com/copilot/agents"
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContent {
            MaterialTheme {
                TestWebViewScreen(defaultUrl = DEFAULT_URL)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TestWebViewScreen(defaultUrl: String) {
    var currentUrl by remember { mutableStateOf(defaultUrl) }
    var addressBarText by remember { mutableStateOf(defaultUrl) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    val focusManager = LocalFocusManager.current
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Test WebView") },
                navigationIcon = {
                    IconButton(onClick = { /* Activity will handle back */ }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { webView?.reload() }) {
                        Icon(Icons.Default.Refresh, "Reload")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color.White) // Ensure white background for entire column
        ) {
            // Address bar - wrapped in Surface to ensure visibility
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp
            ) {
                OutlinedTextField(
                    value = addressBarText,
                    onValueChange = { addressBarText = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("URL") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(
                        onGo = {
                            var url = addressBarText.trim()
                            // Add https:// if no protocol specified
                            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                                url = "https://$url"
                                addressBarText = url
                            }
                            currentUrl = url
                            focusManager.clearFocus()
                        }
                    )
                )
            }
            
            // WebView - ensure it's in its own layer
            TestWebView(
                url = currentUrl,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .background(Color.White), // Explicit white background
                onWebViewCreated = { webView = it },
                onUrlChanged = { newUrl -> 
                    addressBarText = newUrl
                }
            )
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TestWebView(
    url: String,
    modifier: Modifier = Modifier,
    onWebViewCreated: (WebView) -> Unit = {},
    onUrlChanged: (String) -> Unit = {}
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                Log.d("TestWebViewActivity", "Creating WebView")
                
                // CRITICAL: Set layout params to ensure WebView has proper dimensions
                layoutParams = android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT
                )
                
                // CRITICAL: Enable hardware acceleration explicitly on the view
                setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
                
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
                
                // CRITICAL: Use wide viewport for proper rendering
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                
                // CRITICAL: Ensure layout algorithm is correct
                settings.layoutAlgorithm = android.webkit.WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING
                
                // Set white background
                setBackgroundColor(android.graphics.Color.WHITE)
                
                // CRITICAL: Force the WebView to be visible
                visibility = android.view.View.VISIBLE
                
                // WebView client for logging and URL updates
                webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                        super.onPageStarted(view, url, favicon)
                        Log.d("TestWebViewActivity", "Page started: $url")
                        url?.let { onUrlChanged(it) }
                    }
                    
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d("TestWebViewActivity", "Page finished: $url")
                        // Force a layout pass after page loads
                        view?.post {
                            view.requestLayout()
                            view.invalidate()
                        }
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
                onWebViewCreated(this)
            }
        },
        update = { view ->
            // Ensure WebView stays visible
            view.visibility = android.view.View.VISIBLE
            if (view.url != url) {
                Log.d("TestWebViewActivity", "Updating URL to: $url")
                view.loadUrl(url)
            }
        }
    )
}
