package fm.donmuse.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.ViewCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import fm.donmuse.app.bridge.NativeBridge
import fm.donmuse.app.bridge.NativeEvents
import fm.donmuse.app.data.OfflineWeb
import fm.donmuse.app.data.ThemeInjector
import fm.donmuse.app.playback.PlaybackService

/**
 * DON MUSE — Android host.
 *
 * This is NOT a "website in a box": the WebView renders the UI (the same UI the
 * web app uses) while everything the platform can do better is delegated to
 * real Android code through the `DonMuseNative` bridge:
 *
 *   • ExoPlayer + MediaSessionService  → background playback, media-style
 *     notification (play/pause/prev/next), lock-screen + Bluetooth controls,
 *     widgets, gapless playback, audio focus, becoming-noisy handling.
 *   • MediaStore                        → the device library, read in place.
 *   • SharedPreferences (app-private)   → all app data, invisible to the user
 *     and to other apps. No IndexedDB for app data.
 *   • DownloadManager / MediaStore      → saving audio into the Music library.
 *   • WorkManager                       → release notifications.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: NativeBridge
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var themeBootstrapInstalled = false

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        bridge.onPermissionsResult(
            result.filterValues { it }.keys.toList(),
            result.filterValues { !it }.keys.toList(),
        )
    }

    private val manageStorageLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { bridge.onManageStorageResult(true) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        // Connect a controller so the UI can read/replace the real native queue.
        val token = SessionToken(this, android.content.ComponentName(this, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync()

        webView = WebView(this).apply {
            setBackgroundColor(0xFF05060A.toInt())
            setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        }
        setContentView(webView)
        // The activity is edge-to-edge; keep the app inside the actual safe area.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(webView)

        bridge = NativeBridge(this, webView, permissionLauncher, manageStorageLauncher)
        webView.addJavascriptInterface(bridge, "DonMuseNative")
        NativeEvents.attach(this, webView)
        // Hand the saved theme/accent/density/language to the page before it
        // paints, so a cold start never flashes the default (wrong) theme.
        themeBootstrapInstalled = ThemeInjector.install(this, webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                android.util.Log.d("DonMuseWeb", "${m.message()} @${m.lineNumber()}")
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) = request.grant(request.resources)
        }

        webView.webViewClient = object : WebViewClient() {
            /**
             * The bundled UI is served by OfflineWeb (a real https origin backed
             * by assets/www): correct MIME types, one shared origin, no network.
             */
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? {
                val url = request.url
                if (!OfflineWeb.isOurs(url) || OfflineWeb.isApiPath(url)) return null
                // Always serve the packaged appassets origin locally. Never
                // replace a missing local interface by silently loading the web host.
                return OfflineWeb.resolve(
                    this@MainActivity,
                    OfflineWeb.pathOf(url),
                    isNavigation = request.isForMainFrame,
                )
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val host = url.host ?: return false
                if (isInternalHost(host)) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (_: Exception) {
                    false
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Lets the design system apply Android-specific safe areas and
                // disables web-only paths (IndexedDB storage, file pickers…).
                view?.evaluateJavascript(
                    "document.documentElement.dataset.host='android';",
                    null,
                )
                // Fallback for WebViews without document-start scripts: paint the
                // persisted theme as soon as the page exists.
                if (!themeBootstrapInstalled) ThemeInjector.push(this@MainActivity, webView)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Ask the SPA to close a sheet / go back one history entry.
                webView.evaluateJavascript(
                    "(function(){if(window.__donmuseBack&&window.__donmuseBack()){return '1'}return '0'})()",
                ) { handled ->
                    if (handled != "\"1\"") {
                        if (webView.canGoBack()) webView.goBack() else finish()
                    }
                }
            }
        })

        webView.loadUrl(firstUrl(intent))
    }

    private fun isInternalHost(host: String): Boolean =
        host == DonMuseApp.WEB_HOST ||
            host.endsWith(".donmuse.app") ||
            host == "localhost" ||
            host == "appassets.androidplatform.net"

    /** True when this APK actually carries the static UI bundle. */
    private fun hasBundledUi(): Boolean = DonMuseApp.hasBundledUi(this)

    private fun firstUrl(intent: Intent?): String {
        // `intent?.data` is already a smart-cast Uri?: keep the null check local so
        // the compiler can narrow it (the old `val data: Uri? = … ?: return`
        // form left it nullable for every later use).
        val data: Uri = intent?.data ?: return DonMuseApp.startUrl(this)
        return when {
            data.scheme == "donmuse" -> DonMuseApp.routeUrl(this, data.path.orEmpty())
            data.scheme?.startsWith("content") == true ->
                DonMuseApp.routeUrl(this, "my-music") + "?open=" + Uri.encode(data.toString())
            else -> data.toString()
        }
    }


    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val data: Uri = intent.data ?: return
        val target = when {
            data.scheme == "donmuse" -> DonMuseApp.routeUrl(this, data.path.orEmpty())
            data.scheme?.startsWith("content") == true ->
                DonMuseApp.routeUrl(this, "my-music") + "?open=" + Uri.encode(data.toString())
            else -> data.toString()
        }
        webView.loadUrl(target)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        // Re-sync the UI with whatever the notification/widget did while away.
        webView.evaluateJavascript(
            "window.__donmuseResync&&window.__donmuseResync()",
            null,
        )
    }

    override fun onPause() {
        // Playback deliberately keeps running: it lives in the foreground
        // service, not in the WebView.
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        controllerFuture?.let { MediaController.releaseFuture(it) }
        super.onDestroy()
    }

    @Suppress("unused")
    private fun applyInsets() {
        WindowCompat.getInsetsController(window, window.decorView)
            .hide(WindowInsetsCompat.Type.systemBars())
    }
}
