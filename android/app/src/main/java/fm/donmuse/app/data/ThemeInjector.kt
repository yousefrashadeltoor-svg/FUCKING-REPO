package fm.donmuse.app.data

import android.content.Context
import android.util.Log
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import fm.donmuse.app.bridge.AppStorage
import org.json.JSONObject

/**
 * Hands the persisted app settings to the web UI *before* it paints.
 *
 * The web app applies theme / accent / density / language from a tiny bootstrap
 * script in `<head>` that reads `window.__dmTheme` (native) or localStorage
 * (web) — that is what stops the one-frame wrong-theme flash on cold start.
 * In the Android build the settings live in app-private SharedPreferences, not
 * localStorage, so nothing would be there: we inject the JSON through a
 * document-start script, which runs before any page script and before the first
 * paint.
 *
 * The injected value is the whole persisted document (`{state:{…},version:2}`),
 * exactly like the web's `localStorage["aura-settings"]`, so the bootstrap and
 * the store rehydrate from the same shape.
 */
object ThemeInjector {

    private const val PREFS_KEY = "aura-settings"
    private const val TAG = "DonMuseTheme"
    private val SCRIPT_ID = "donmuse-theme-bootstrap"

    /** Serialised settings document, or null when the user never changed one. */
    fun currentJson(context: Context): String? {
        val raw = AppStorage(context).get(PREFS_KEY) ?: return null
        // Only forward something that really is a settings document.
        return try {
            JSONObject(raw).put("__native", true).toString()
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Install the document-start script. Returns true when the underlying
     * WebView supports it; callers keep [currentJson] as a fallback for WebViews
     * that do not (old system components).
     */
    fun install(context: Context, webView: android.webkit.WebView): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Log.i(TAG, "document-start scripts unsupported; falling back to page-finished injection")
            return false
        }
        return try {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                scriptFor(currentJson(context)),
                setOf("*"),
            )
            true
        } catch (e: Exception) {
            Log.w(TAG, "could not install theme bootstrap: ${e.message}")
            false
        }
    }

    /** Re-inject after the user changes the theme (SPA switch, no page reload). */
    fun push(context: Context, webView: android.webkit.WebView) {
        val payload = JSONObject.quote(currentJson(context) ?: "")
        val js = "(function(){var s=$payload;if(!s)return;" +
            "window.__dmTheme=s;try{" +
            "var p=JSON.parse(s),st=p&&p.state?p.state:p," +
            "d=document.documentElement," +
            "ACCENT={emerald:'#1DB954',rose:'#FA2D55',violet:'#8B5CF6',cyan:'#00D4FF',amber:'#FFB800',gold:'#D4AF37'}," +
            "hex=ACCENT[st&&st.accent]||ACCENT.gold;" +
            "d.dataset.theme=(st&&st.theme)||'midnight';" +
            "d.dataset.density=(st&&st.density)||'comfortable';" +
            "d.dataset.motion=st&&st.reducedEffects?'reduced':(st&&st.highRefresh?'fast':'normal');" +
            "d.style.setProperty('--app-accent',hex);" +
            "d.style.setProperty('--dynamic-primary',hex);" +
            "d.style.setProperty('--dynamic-glow',hex+'40');" +
            "}catch(e){}})()"
        webView.post { runCatching { webView.evaluateJavascript(js, null) } }
    }

    /** The script itself: sets `window.__dmTheme` before anything else runs. */
    private fun scriptFor(json: String?): String =
        if (json == null) {
            "window.__dmTheme = window.__dmTheme || null;"
        } else {
            "(function(){try{window.__dmTheme=${JSONObject.quote(json)};}catch(e){}})();"
        }
}
