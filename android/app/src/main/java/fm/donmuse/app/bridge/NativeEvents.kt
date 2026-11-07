package fm.donmuse.app.bridge

import android.app.Activity
import android.webkit.WebView
import org.json.JSONObject

/**
 * Push channel from native → web. Anything the system does behind the UI's back
 * (notification buttons, lock screen, Bluetooth headset, widget taps) is
 * forwarded here so the UI stays in perfect sync with the real player.
 */
object NativeEvents {
    private var webView: WebView? = null
    private var activity: Activity? = null
    private val playbackCallbacks = LinkedHashSet<String>()

    fun attach(activity: Activity, webView: WebView) {
        this.activity = activity
        this.webView = webView
    }

    fun addPlaybackCallback(name: String) {
        playbackCallbacks += name
    }

    fun pushPlayback(stateJson: String) {
        if (playbackCallbacks.isEmpty()) return
        val payload = JSONObject.quote(stateJson)
        val js = "(function(){var s=$payload;" +
            playbackCallbacks.joinToString("") { name ->
                "try{if(window.donmuseNative&&window.donmuseNative['$name'])window.donmuseNative['$name'](s)}catch(e){};"
            } + "})()"
        evaluate(js)
    }

    fun emit(name: String, payload: String) {
        val safeName = name.replace("'", "")
        evaluate(
            "(function(){var f=window.donmuseNative&&window.donmuseNative['$safeName'];" +
                "if(f){try{f(${JSONObject.quote(payload)})}catch(e){}}})()",
        )
    }

    private fun evaluate(js: String) {
        val act = activity ?: return
        val wv = webView ?: return
        act.runOnUiThread { runCatching { wv.evaluateJavascript(js, null) } }
    }
}
