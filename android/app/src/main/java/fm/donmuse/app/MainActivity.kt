package fm.donmuse.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
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
import androidx.webkit.WebViewAssetLoader
import fm.donmuse.app.bridge.NativeBridge
import fm.donmuse.app.bridge.NativeEvents
import java.io.ByteArrayInputStream
import java.security.SecureRandom

/** Native Android capabilities + the exact, locally bundled DON MUSE interface.
 * There is intentionally no hosted-site URL or remote fallback. */
class MainActivity : ComponentActivity() {
    private lateinit var web:WebView
    private lateinit var bridge:NativeBridge
    private lateinit var loader:WebViewAssetLoader
    @Volatile var trustedDocument=false;private set
    private var pendingDeepLink:String?=null
    private val token=ByteArray(32).also{SecureRandom().nextBytes(it)}.joinToString(""){"%02x".format(it)}
    private val permissions=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){bridge.onPermissionsResult()}
    private val documents=registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()){bridge.onDocuments(it)}
    private val image=registerForActivityResult(ActivityResultContracts.OpenDocument()){bridge.onImage(it)}
    private val write=registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()){bridge.onWriteResult(it.resultCode==RESULT_OK)}

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window,false)
        WindowInsetsControllerCompat(window,window.decorView).apply{isAppearanceLightStatusBars=false;isAppearanceLightNavigationBars=false}
        check(runCatching{assets.open("www/index.html").close()}.isSuccess){"Bundled UI is missing. Build with npm run bundle."}
        loader=WebViewAssetLoader.Builder().setDomain("appassets.androidplatform.net").addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
        web=WebView(this).apply{setBackgroundColor(0xff05060a.toInt());layoutParams=ViewGroup.LayoutParams(-1,-1)}
        setContentView(web)
        bridge=NativeBridge(this,token,permissions,documents,image,write)
        NativeEvents.attach(this,web)
        web.addJavascriptInterface(bridge,"DonMuseNative")
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
        web.settings.apply{
            javaScriptEnabled=true;domStorageEnabled=true;databaseEnabled=true
            mediaPlaybackRequiresUserGesture=false;allowFileAccess=false;allowContentAccess=true
            mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode=WebSettings.LOAD_DEFAULT;useWideViewPort=true;loadWithOverviewMode=true
            builtInZoomControls=false;displayZoomControls=false;textZoom=100;safeBrowsingEnabled=true
            setSupportMultipleWindows(false);javaScriptCanOpenWindowsAutomatically=false
        }
        web.webChromeClient=object:WebChromeClient(){
            override fun onConsoleMessage(m:ConsoleMessage):Boolean{android.util.Log.d("DonMuseUI","${m.message()} @${m.lineNumber()}");return true}
            override fun onPermissionRequest(request:PermissionRequest){request.deny()}
        }
        web.webViewClient=object:WebViewClient(){
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?{
                val uri=request.url
                if(!DonMuseApp.isLocal(uri))return null
                val response=loader.shouldInterceptRequest(uri)
                val path=uri.path.orEmpty()
                val isIndex=path.endsWith("/index.html")||path.endsWith("/assets/www/")||(!path.substringAfterLast('/').contains('.')&&!path.contains("/assets/www/assets/"))
                if(request.isForMainFrame&&isIndex){
                    val html=assets.open("www/index.html").bufferedReader().use{it.readText()}
                    val bootstrap="<script>window.__DM_NATIVE_TOKEN__=${org.json.JSONObject.quote(token)};document.documentElement.dataset.host='android';</script>"
                    val injected=html.replaceFirst("<head>","<head>$bootstrap")
                    return WebResourceResponse("text/html","UTF-8",200,"OK",securityHeaders(),ByteArrayInputStream(injected.toByteArray()))
                }
                return response
            }
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean{
                val uri=request.url;if(DonMuseApp.isLocal(uri))return true.also{if(request.isForMainFrame)loadRoute(uri)}
                if(request.isForMainFrame&&uri.scheme in setOf("http","https")){runCatching{startActivity(Intent(Intent.ACTION_VIEW,uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))};return true}
                return uri.scheme !in setOf("http","https","blob","data","about")
            }
            override fun onPageStarted(view:WebView,url:String?,favicon:android.graphics.Bitmap?){trustedDocument=url?.let{DonMuseApp.isLocal(Uri.parse(it))}==true}
            override fun onPageFinished(view:WebView,url:String?){
                if(!trustedDocument)return
                view.evaluateJavascript("document.documentElement.dataset.host='android';window.__donmuseNativeEvent&&window.__donmuseNativeEvent('ready','{}');",null)
                flushDeepLink();applyInsets()
            }
            override fun onReceivedError(view:WebView,request:WebResourceRequest,error:WebResourceError){if(request.isForMainFrame)android.util.Log.e("DonMuseUI","Bundled page failed: ${error.description}")}
        }
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed(){web.evaluateJavascript("!!(window.__donmuseBack&&window.__donmuseBack())"){handled->if(handled!="true"){if(web.canGoBack())web.goBack()else moveTaskToBack(true)}}}})
        pendingDeepLink=routeFromIntent(intent)
        web.loadUrl(DonMuseApp.START_URL)
        applyInsets()
    }
    private fun securityHeaders()=mapOf("Cache-Control" to "no-store","X-Content-Type-Options" to "nosniff","Cross-Origin-Opener-Policy" to "same-origin")
    private fun applyInsets(){if(!::web.isInitialized)return;WindowInsetsCompat.Type.systemBars().let{type->val insets=WindowInsetsCompat.toWindowInsetsCompat(window.decorView.rootWindowInsets ?: return,web);val bars=insets.getInsets(type or WindowInsetsCompat.Type.displayCutout());val density=resources.displayMetrics.density;web.evaluateJavascript("document.documentElement.style.setProperty('--dm-safe-top','${bars.top/density}px');document.documentElement.style.setProperty('--dm-safe-bottom','${bars.bottom/density}px');",null)}}
    private fun loadRoute(uri:Uri){val path=uri.path.orEmpty().removePrefix("/assets/www/");web.loadUrl(DonMuseApp.routeUrl(path)+(uri.query?.let{"?$it"} ?: ""))}
    private fun routeFromIntent(i:Intent?):String?{
        val data=i?.data
        if(data!=null){
            if(data.scheme=="donmuse"){val route=(data.host.orEmpty()+data.path.orEmpty()).trim('/');return "/$route"+(data.query?.let{"?$it"} ?: "")}
            if(i.action==Intent.ACTION_VIEW&&data.scheme in setOf("content","file"))return "/my-music?open=${Uri.encode(data.toString())}"
        }
        if(i?.action==Intent.ACTION_SEND)return i.getStringExtra(Intent.EXTRA_TEXT)?.let{"/downloads?link=${Uri.encode(it)}"}
        return null
    }
    private fun flushDeepLink(){val route=pendingDeepLink ?: return;pendingDeepLink=null;web.evaluateJavascript("window.__donmuseNavigate&&window.__donmuseNavigate(${org.json.JSONObject.quote(route)});",null)}
    fun onUiReady(){flushDeepLink()}
    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);pendingDeepLink=routeFromIntent(intent);if(trustedDocument)flushDeepLink()}
    override fun onResume(){super.onResume();if(::web.isInitialized){web.onResume();web.evaluateJavascript("window.__donmuseResync&&window.__donmuseResync();",null)}}
    override fun onPause(){if(::web.isInitialized)web.onPause();super.onPause()}
    override fun onDestroy(){NativeEvents.detach(web);web.removeJavascriptInterface("DonMuseNative");web.destroy();super.onDestroy()}
}
