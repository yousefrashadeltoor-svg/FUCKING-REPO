package fm.donmuse.app.bridge

import android.content.Context
import java.io.File

/**
 * App-private storage for everything the app owns: playlists, settings,
 * favourites, downloads metadata. Nothing is written to the user's media
 * library unless the user explicitly edits a real file.
 *
 * Values live in a single JSON document under the app's private files dir so
 * large libraries (thousands of entries) never hit SharedPreferences limits.
 */
class AppStorage(private val ctx: Context) {
    private val file = File(ctx.filesDir, "donmuse-store.json")
    private val lock = Any()

    private fun readAll(): MutableMap<String, String> {
        if (!file.exists()) return mutableMapOf()
        return runCatching {
            val json = org.json.JSONObject(file.readText())
            val out = mutableMapOf<String, String>()
            for (key in json.keys()) out[key] = json.getString(key)
            out
        }.getOrElse { mutableMapOf() }
    }

    private fun writeAll(map: Map<String, String>) {
        val json = org.json.JSONObject()
        map.forEach { (k, v) -> json.put(k, v) }
        val tmp = File(ctx.filesDir, "donmuse-store.json.tmp")
        tmp.writeText(json.toString())
        tmp.renameTo(file)
    }

    fun get(key: String): String? = synchronized(lock) { readAll()[key] }

    fun set(key: String, value: String) = synchronized(lock) {
        val all = readAll()
        all[key] = value
        writeAll(all)
    }

    fun remove(key: String) = synchronized(lock) {
        val all = readAll()
        all.remove(key)
        writeAll(all)
    }

    fun keys(): List<String> = synchronized(lock) { readAll().keys.toList() }
}
