package fm.donmuse.app.bridge

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import org.json.JSONObject
import java.lang.ref.WeakReference

/** Events are queued until the bundled document has installed its receiver. */
object NativeEvents {
    private val main = Handler(Looper.getMainLooper())
    private var view = WeakReference<WebView>(null)
    private var activity = WeakReference<Activity>(null)
    private var ready = false
    private val pending = ArrayDeque<Pair<String,String>>()
    @Synchronized fun attach(a: Activity, w: WebView) { activity = WeakReference(a); view = WeakReference(w); ready = false }
    @Synchronized fun ready() { ready = true; drain() }
    @Synchronized fun detach(w: WebView) { if (view.get() === w) { view.clear(); activity.clear(); ready = false; pending.clear() } }
    fun emit(name: String, payload: String) {
        main.post { synchronized(this) { if (!ready) { if (pending.size >= 30) pending.removeFirst(); pending.addLast(name to payload) } else send(name,payload) } }
    }
    fun reply(id: String, ok: Boolean, payload: String) {
        val js = "window.__donmuseNativeReply&&window.__donmuseNativeReply(${JSONObject.quote(id)},$ok,${JSONObject.quote(payload)})"
        evaluate(js)
    }
    private fun drain() { while (pending.isNotEmpty()) { val (n,p)=pending.removeFirst(); send(n,p) } }
    private fun send(name:String,payload:String) {
        // Playback is state, not a log: only the latest snapshot is useful.
        if(name=="playback") { val it=pending.iterator(); while(it.hasNext()) if(it.next().first=="playback") it.remove() }
        evaluate("window.__donmuseNativeEvent&&window.__donmuseNativeEvent(${JSONObject.quote(name)},${JSONObject.quote(payload)})")
    }
    private fun evaluate(js:String) { main.post { val a=activity.get(); val w=view.get(); if(a!=null&&!a.isFinishing&&!a.isDestroyed&&w!=null) runCatching { w.evaluateJavascript(js,null) } } }
}
