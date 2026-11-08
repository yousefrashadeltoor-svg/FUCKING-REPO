package fm.donmuse.app.bridge

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Vibrator
import android.os.VibrationEffect
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.ContextCompat
import fm.donmuse.app.BuildConfig
import fm.donmuse.app.DonMuseApp
import fm.donmuse.app.data.MediaStoreRepository
import fm.donmuse.app.data.ThemeInjector
import fm.donmuse.app.playback.NativePlayer
import fm.donmuse.app.widget.WidgetUpdater
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

object PendingPermissions {
    var pending: Array<String> = emptyArray()
}

/**
 * The single JS ↔ native surface (`window.DonMuseNative`).
 * Every method is real: MediaStore queries, ExoPlayer control, app-private
 * storage, MediaStore metadata writes, downloads and diagnostics.
 */
class NativeBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val permissionLauncher: ActivityResultLauncher<Array<String>>,
    private val manageStorageLauncher: ActivityResultLauncher<Intent>,
) {
    // App-private JSON document (no size limits, survives process death).
    private val prefs = AppStorage(activity)
    private val repo = MediaStoreRepository(activity)

    /* ----------------------------- platform info ---------------------------- */

    @JavascriptInterface
    fun platformInfo(): String = JSONObject().apply {
        put("platform", "android")
        put("sdk", Build.VERSION.SDK_INT)
        put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
        put("appVersion", BuildConfig.VERSION_NAME)
        put("server", DonMuseApp.startUrl(activity))
    }.toString()

    @JavascriptInterface
    fun diagnostics(): String = JSONObject().apply {
        val rt = Runtime.getRuntime()
        put("platform", "android")
        put("sdk", Build.VERSION.SDK_INT)
        put("cores", rt.availableProcessors())
        put("heapUsedMb", (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024))
        put("heapMaxMb", rt.maxMemory() / (1024 * 1024))
        put("playing", NativePlayer.isPlaying())
        put("positionMs", NativePlayer.positionMs())
        put("durationMs", NativePlayer.durationMs())
        put("queueLength", NativePlayer.queueLength())
        put("hasAudioPermission", hasPermissionRaw("audio"))
        put("freeStorageGb", activity.filesDir.usableSpace / (1024.0 * 1024 * 1024))
    }.toString()

    /* ------------------------------ permissions ----------------------------- */

    @JavascriptInterface
    fun hasPermission(kind: String): String = hasPermissionRaw(kind).toString()

    private fun hasPermissionRaw(kind: String): Boolean {
        val perm = when (kind) {
            "audio" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
            "video" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_VIDEO else Manifest.permission.READ_EXTERNAL_STORAGE
            "images" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
            "notifications" -> Manifest.permission.POST_NOTIFICATIONS
            else -> return true
        }
        return ContextCompat.checkSelfPermission(activity, perm) == PackageManager.PERMISSION_GRANTED
    }

    /** Called by the activity when the system permission dialog closes. */
    @JavascriptInterface
    fun requestPermissions(kinds: String): String {
        val wanted = mutableListOf<String>()
        kinds.split(",").map { it.trim() }.filter { it.isNotEmpty() }.forEach { kind ->
            val perm = when (kind) {
                "audio" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
                "video" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_VIDEO else Manifest.permission.READ_EXTERNAL_STORAGE
                "images" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
                "notifications" -> Manifest.permission.POST_NOTIFICATIONS
                else -> null
            }
            if (perm != null && ContextCompat.checkSelfPermission(activity, perm) != PackageManager.PERMISSION_GRANTED) {
                wanted += perm
            }
        }
        if (wanted.isEmpty()) {
            return JSONObject().put("granted", JSONArray()).put("denied", JSONArray()).toString()
        }
        PendingPermissions.pending = wanted.toTypedArray()
        activity.runOnUiThread { permissionLauncher.launch(wanted.toTypedArray()) }
        return JSONObject().put("granted", JSONArray()).put("denied", JSONArray()).toString()
    }

    fun onPermissionsResult(granted: List<String>, denied: List<String>) {
        val g = JSONArray()
        granted.forEach { g.put(it) }
        val d = JSONArray()
        denied.forEach { d.put(it) }
        emit("__donmusePermissions", JSONObject().put("granted", g).put("denied", d).toString())
        if (denied.isNotEmpty() && denied.any { it == Manifest.permission.READ_MEDIA_AUDIO || it == Manifest.permission.READ_EXTERNAL_STORAGE }) {
            toast("امنح صلاحية الوسائط لعرض مكتبتك · Grant media access to browse your library")
        }
    }

    fun onManageStorageResult(ok: Boolean) {
        emit("__donmuseStorageAccess", ok.toString())
    }

    /** Android 11+ "All files access" helper for full metadata editing. */
    @JavascriptInterface
    fun requestAllFilesAccess(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            activity.runOnUiThread {
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                        .setData(Uri.parse("package:${activity.packageName}"))
                    manageStorageLauncher.launch(intent)
                } catch (_: Exception) {
                    try {
                        manageStorageLauncher.launch(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                    } catch (_: Exception) { }
                }
            }
            return "requested"
        }
        return "granted"
    }

    /* ---------------------------- media library ----------------------------- */

    @JavascriptInterface
    fun scanMedia(kind: String): String {
        var scanned = 0L
        val t0 = System.currentTimeMillis()
        val list = if (kind == "video") repo.videos() else repo.songs()
        scanned = System.currentTimeMillis() - t0
        android.util.Log.i("DonMuseNative", "scanMedia($kind) → ${list.length} in ${scanned}ms")
        return list.toString()
    }

    @JavascriptInterface
    fun updateMediaMetadata(uri: String, json: String): String {
        return try {
            val obj = JSONObject(json)
            val values = android.content.ContentValues()
            if (obj.has("title")) values.put(MediaStore.Audio.Media.TITLE, obj.getString("title"))
            if (obj.has("artist")) values.put(MediaStore.Audio.Media.ARTIST, obj.getString("artist"))
            if (obj.has("album")) values.put(MediaStore.Audio.Media.ALBUM, obj.getString("album"))
            if (obj.has("year")) values.put(MediaStore.Audio.Media.YEAR, obj.getInt("year"))
            val updated = activity.contentResolver.update(Uri.parse(uri), values, null, null)
            JSONObject().put("ok", updated > 0)
                .put("message", if (updated > 0) "تم تحديث الملف · Updated the original file" else "لم يتم التعديل")
                .toString()
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("message", e.message ?: "failed").toString()
        }
    }

    @JavascriptInterface
    fun saveArtwork(uri: String, base64: String): String {
        return try {
            // Writing embedded artwork requires the write permission granted by
            // MediaStore for user-selected items; we attach it via
            // MediaStore.Audio.Media.EXTERNAL_CONTENT_URI + album art table.
            val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            val artDir = File(activity.filesDir, "artwork").apply { mkdirs() }
            val file = File(artDir, UUID.randomUUID().toString() + ".jpg")
            file.writeBytes(bytes)
            val values = android.content.ContentValues().apply {
                put(MediaStore.Audio.Albums.ALBUM_ART, file.absolutePath)
            }
            val updated = activity.contentResolver.update(Uri.parse(uri), values, null, null)
            JSONObject().put("ok", true)
                .put("message", if (updated > 0) "تم تحديث الغلاف" else "حُفظ الغلاف داخل التطبيق")
                .toString()
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("message", e.message ?: "failed").toString()
        }
    }

    /* ------------------------------- storage -------------------------------- */

    @JavascriptInterface
    fun storeGet(key: String): String = prefs.get(key) ?: ""

    @JavascriptInterface
    fun storeSet(key: String, value: String): String {
        prefs.set(key, value)
        // Theme / accent / density / language changed → restyle the live page and
        // keep the persisted document in sync with what the UI shows.
        if (key == "aura-settings") {
            webView.post { ThemeInjector.push(activity, webView) }
        }
        return "ok"
    }

    @JavascriptInterface
    fun storeRemove(key: String): String {
        prefs.remove(key)
        return "ok"
    }

    @JavascriptInterface
    fun storeKeys(): String {
        val arr = JSONArray()
        prefs.keys().forEach { arr.put(it) }
        return arr.toString()
    }

    /* ------------------------------ playback -------------------------------- */

    @JavascriptInterface
    fun playQueue(json: String): String {
        return try {
            // Start (or reconnect to) the foreground service BEFORE the queue is
            // handed over, so playback keeps running when the activity dies.
            val svc = Intent(activity, fm.donmuse.app.playback.PlaybackService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                activity.startForegroundService(svc)
            } else {
                activity.startService(svc)
            }
            NativePlayer.setQueue(activity, json)
            WidgetUpdater.refresh(activity)
            "ok"
        } catch (e: Exception) {
            JSONObject().put("error", e.message ?: "failed").toString()
        }
    }

    /** Explicit toggle — used by UI buttons that only know "play/pause". */
    @JavascriptInterface
    fun playPause(): String {
        NativePlayer.toggle(); WidgetUpdater.refresh(activity); return "ok"
    }

    /**
     * Idempotent play. The web engine calls this for absolute intent, so a late
     * `pause()` can never invert it into a pause (the old toggle-only bridge did
     * exactly that and left the UI out of sync with the service).
     */
    @JavascriptInterface
    fun play(): String {
        NativePlayer.play(); WidgetUpdater.refresh(activity); return "ok"
    }

    /** Idempotent pause. */
    @JavascriptInterface
    fun pause(): String {
        NativePlayer.pause(); WidgetUpdater.refresh(activity); return "ok"
    }

    @JavascriptInterface
    fun next(): String { NativePlayer.next(); WidgetUpdater.refresh(activity); return "ok" }

    @JavascriptInterface
    fun previous(): String { NativePlayer.previous(); WidgetUpdater.refresh(activity); return "ok" }

    @JavascriptInterface
    fun stopPlayback(): String { NativePlayer.stop(); WidgetUpdater.refresh(activity); return "ok" }

    @JavascriptInterface
    fun seekTo(ms: Long): String { NativePlayer.seek(ms); return "ok" }

    @JavascriptInterface
    fun setVolume(volume: Float): String { NativePlayer.setVolume(volume); return "ok" }

    @JavascriptInterface
    fun setRate(rate: Float): String { NativePlayer.setRate(rate); return "ok" }

    @JavascriptInterface
    fun setSleepTimer(ms: Long): String { NativePlayer.setSleepTimer(ms); return "ok" }

    @JavascriptInterface
    fun playbackState(): String = NativePlayer.stateJson()

    @JavascriptInterface
    fun setPlaybackChangedCallback(name: String): String {
        NativeEvents.addPlaybackCallback(name)
        return "ok"
    }

    /**
     * Register a JS function that receives real download progress:
     *   { id, filename, status: "queued"|"running"|"done"|"error", bytes, total, error? }
     * The callback is invoked from the download manager thread on the UI thread.
     */
    @JavascriptInterface
    fun setDownloadCallback(name: String): String {
        NativeEvents.addDownloadCallback(name)
        return "ok"
    }

    /* ------------------------------ downloads ------------------------------- */

    @JavascriptInterface
    fun downloadToMusic(url: String, filename: String, mime: String): String {
        return try {
            repo.download(url, filename, mime)
        } catch (e: Exception) {
            JSONObject().put("error", e.message ?: "failed").toString()
        }
    }

    @JavascriptInterface
    fun cancelDownload(id: String): String {
        repo.cancel(id.toLongOrNull() ?: return JSONObject().put("error", "bad id").toString())
        return "ok"
    }

    /** Live status of one transfer, for UIs that prefer polling over callbacks. */
    @JavascriptInterface
    fun downloadStatus(id: String): String = repo.status(id.toLongOrNull() ?: -1L)

    /* -------------------------------- misc ---------------------------------- */

    @JavascriptInterface
    fun refreshWidgets(): String { WidgetUpdater.refresh(activity); return "ok" }

    @JavascriptInterface
    fun toast(message: String): String {
        activity.runOnUiThread { Toast.makeText(activity, message, Toast.LENGTH_SHORT).show() }
        return "ok"
    }

    @JavascriptInterface
    fun vibrate(ms: Int): String {
        val v = activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return "no-vibrator"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION") v.vibrate(ms.toLong())
        }
        return "ok"
    }

    @JavascriptInterface
    fun openExternal(url: String): String {
        return try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            "ok"
        } catch (e: Exception) {
            "failed"
        }
    }

    @JavascriptInterface
    fun setAlarmSound(): String {
        return try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            JSONObject().put("uri", uri.toString()).toString()
        } catch (_: Exception) {
            "{}"
        }
    }

    /* ------------------------------ internals ------------------------------- */

    private fun emit(name: String, payload: String) = NativeEvents.emit(name, payload)
}
