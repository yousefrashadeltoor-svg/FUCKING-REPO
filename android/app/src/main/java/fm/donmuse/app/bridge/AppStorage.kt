package fm.donmuse.app.bridge

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** One shared monitor for every caller: bridge, downloads, alarms and widgets. */
class AppStorage(ctx: Context) {
    private val file = File(ctx.applicationContext.filesDir, "donmuse-store.json").canonicalFile
    private fun <T> locked(fn: (LinkedHashMap<String, String>) -> T): T = synchronized(monitor) {
        val values = cache.getOrPut(file) {
            val map = LinkedHashMap<String, String>()
            runCatching { val json = JSONObject(file.readText()); for (k in json.keys()) map[k] = json.getString(k) }
            map
        }
        fn(values)
    }
    fun get(key: String): String? = locked { it[key] }
    fun set(key: String, value: String) { locked { it[key] = value; save(it) } }
    fun remove(key: String) { locked { it.remove(key); save(it) } }
    fun keys(): List<String> = locked { it.keys.toList() }
    private fun save(values: Map<String, String>) {
        val json = JSONObject(); values.forEach { (k, v) -> json.put(k, v) }
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.outputStream().use { out -> out.write(json.toString().toByteArray(Charsets.UTF_8)); out.fd.sync() }
        // Linux rename replaces an existing file atomically. Never report success
        // when the durable write failed (the bridge surfaces this to the UI).
        if (!tmp.renameTo(file)) { tmp.delete(); throw IOException("تعذّر حفظ البيانات محليًا") }
    }
    companion object {
        private val monitor = Any()
        private val cache = HashMap<File, LinkedHashMap<String, String>>()
    }
}
