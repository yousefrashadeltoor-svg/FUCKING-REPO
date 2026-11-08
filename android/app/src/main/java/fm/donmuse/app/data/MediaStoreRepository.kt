package fm.donmuse.app.data

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.ContentValues
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import fm.donmuse.app.bridge.NativeEvents
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicLong

/**
 * The device media library.
 *
 * Two hard rules:
 *   • we never copy the user's files around — they are read in place through
 *     MediaStore content URIs;
 *   • we never request blanket storage access. Android 13+ media permissions are
 *     per-type, and writing into the public Music/Movies folders goes through
 *     MediaStore on Q+ (so WRITE_EXTERNAL_STORAGE is not needed at all).
 *
 * Everything returns JSON strings because this is called from the WebView's
 * JavaScript interface.
 */
class MediaStoreRepository(private val activity: Activity) {

    private val io = Executors.newFixedThreadPool(2)
    private val running = ConcurrentHashMap<Long, Future<*>>()
    private val statuses = ConcurrentHashMap<Long, JSONObject>()
    private val downloadSeq = AtomicLong(System.currentTimeMillis() % 100000)

    /* ------------------------------- reading ------------------------------- */

    fun songs(): String {
        val out = JSONArray()
        if (!canRead(Manifest.permission.READ_MEDIA_AUDIO)) return out.toString()

        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.ARTIST_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.YEAR,
            MediaStore.Audio.Media.MIME_TYPE,
        )
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        }
        activity.contentResolver.query(
            collection,
            projection,
            "${MediaStore.Audio.Media.IS_MUSIC} != 0",
            null,
            "${MediaStore.Audio.Media.TITLE} COLLATE NOCASE ASC",
        )?.use { c ->
            while (c.moveToNext()) out.put(songJson(c) as Any)
        }
        return out.toString()
    }

    fun videos(): String {
        val out = JSONArray()
        if (!canRead(Manifest.permission.READ_MEDIA_VIDEO)) return out.toString()

        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.TITLE,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.MIME_TYPE,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
        )
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        }
        activity.contentResolver.query(
            collection,
            projection,
            null,
            null,
            "${MediaStore.Video.Media.DATE_ADDED} DESC",
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Video.Media._ID))
                out.put(
                    JSONObject().apply {
                        put("id", id.toString())
                        put("uri", ContentUris.withAppendedId(collection, id).toString())
                        put("title", c.getString(c.getColumnIndexOrThrow(MediaStore.Video.Media.TITLE)).orEmpty())
                        put("artist", c.getString(c.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)).orEmpty())
                        put("album", "")
                        put("artistId", JSONObject.NULL)
                        put("albumId", JSONObject.NULL)
                        put("albumArtUri", JSONObject.NULL)
                        put("durationMs", c.getLong(c.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)))
                        put("mimeType", c.getString(c.getColumnIndexOrThrow(MediaStore.Video.Media.MIME_TYPE)).orEmpty())
                        put("sizeBytes", c.getLong(c.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)))
                        put("dateAdded", c.getLong(c.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED)))
                        put("trackNumber", 0)
                        put("year", 0)
                        put("isVideo", true)
                    },
                )
            }
        }
        return out.toString()
    }

    private fun songJson(c: android.database.Cursor): JSONObject {
        fun str(name: String): String =
            c.getColumnIndex(name).let { if (it < 0) "" else c.getString(it).orEmpty() }
        fun num(name: String): Long =
            c.getColumnIndex(name).let { if (it < 0) 0L else c.getLong(it) }

        val id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID))
        val albumId = num(MediaStore.Audio.Media.ALBUM_ID)
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        return JSONObject().apply {
            put("id", id.toString())
            put("uri", ContentUris.withAppendedId(collection, id).toString())
            put("title", str(MediaStore.Audio.Media.TITLE).ifBlank { "Unknown" })
            put("artist", str(MediaStore.Audio.Media.ARTIST).ifBlank { "Unknown artist" })
            put("artistId", num(MediaStore.Audio.Media.ARTIST_ID).takeIf { it > 0 }?.toString() ?: JSONObject.NULL)
            put("album", str(MediaStore.Audio.Media.ALBUM))
            put("albumId", albumId.takeIf { it > 0 }?.toString() ?: JSONObject.NULL)
            put(
                "albumArtUri",
                if (albumId > 0) DeviceMusic.albumArt(albumId).toString() else JSONObject.NULL,
            )
            put("durationMs", num(MediaStore.Audio.Media.DURATION))
            put("mimeType", str(MediaStore.Audio.Media.MIME_TYPE))
            put("sizeBytes", num(MediaStore.Audio.Media.SIZE))
            put("dateAdded", num(MediaStore.Audio.Media.DATE_ADDED))
            put("trackNumber", num(MediaStore.Audio.Media.TRACK))
            put("year", num(MediaStore.Audio.Media.YEAR))
            put("isVideo", false)
        }
    }

    /* ------------------------------- writing ------------------------------- */

    /** Real metadata write into the user's own file (no copies, no re-tagging). */
    fun updateMetadata(uri: String, values: ContentValues): Int =
        activity.contentResolver.update(Uri.parse(uri), values, null, null)

    /* ------------------------------ downloads ------------------------------ */

    /**
     * Download a file the user explicitly asked for into the public Music/Movies
     * collection (MediaStore on Q+, the legacy public dir below that).
     * Progress is pushed to the web UI through [NativeEvents].
     *
     * @return JSON `{ id, pending, filename }` so the UI can track the transfer.
     */
    fun download(url: String, filename: String, mime: String): String {
        val id = downloadSeq.incrementAndGet()
        val safeName = filename.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(120)
            .ifBlank { "donmuse-$id" }
        val isVideo = mime.startsWith("video/")
        emit(id, safeName, "queued", 0, 0, null)

        val job = io.submit {
            val tmp = File(activity.cacheDir, "dl-$id.part")
            try {
                val conn = java.net.URL(url).openConnection().apply {
                    connectTimeout = 20_000
                    readTimeout = 30_000
                    setRequestProperty("User-Agent", "Mozilla/5.0 (DON MUSE)")
                }
                val total = conn.contentLengthLong
                conn.getInputStream().use { input ->
                    tmp.outputStream().use { output ->
                        val buf = ByteArray(64 * 1024)
                        var copied = 0L
                        var lastEmit = 0L
                        while (true) {
                            val n = input.read(buf)
                            if (n <= 0) break
                            output.write(buf, 0, n)
                            copied += n
                            val now = System.currentTimeMillis()
                            if (now - lastEmit > 400) {
                                lastEmit = now
                                emit(id, safeName, "running", copied, total, null)
                            }
                        }
                        output.flush()
                    }
                }
                val finalUri = publish(tmp, safeName, mime, isVideo)
                emit(id, safeName, "done", tmp.length(), tmp.length(), null, finalUri?.toString())
                tmp.delete()
            } catch (e: Exception) {
                runCatching { tmp.delete() }
                emit(id, safeName, "error", 0, 0, e.message ?: "failed")
            } finally {
                running.remove(id)
            }
        }
        running[id] = job
        return JSONObject().put("id", id).put("pending", true).put("filename", safeName).toString()
    }

    /** Move the finished temp file into the public library and return its URI. */
    private fun publish(tmp: File, name: String, mime: String, isVideo: Boolean): Uri? {
        val relative = (if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC) + "/DON MUSE"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val collection = if (isVideo) {
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            }
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, relative)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = activity.contentResolver.insert(collection, values) ?: return null
            activity.contentResolver.openOutputStream(uri)?.use { out ->
                tmp.inputStream().use { it.copyTo(out) }
            }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            activity.contentResolver.update(uri, values, null, null)
            return uri
        }
        @Suppress("DEPRECATION")
        val dir = File(
            Environment.getExternalStoragePublicDirectory(
                if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC,
            ),
            "DON MUSE",
        )
        if (!dir.exists()) dir.mkdirs()
        val dest = File(dir, name)
        tmp.copyTo(dest, overwrite = true)
        // Let the system index it so every other music app sees it too.
        MediaScannerConnection.scanFile(activity, arrayOf(dest.absolutePath), arrayOf(mime), null)
        return Uri.fromFile(dest)
    }

    /** Last known state of one transfer as JSON ("{}" when unknown). */
    fun status(id: Long): String = statuses[id]?.toString() ?: "{}"

    fun cancel(id: Long) {
        running.remove(id)?.cancel(true)
        emit(id, "", "error", 0, 0, "cancelled")
    }

    private fun emit(
        id: Long,
        filename: String,
        status: String,
        bytes: Long,
        total: Long,
        error: String?,
        uri: String? = null,
    ) {
        val payload = JSONObject().apply {
            put("id", id)
            put("filename", filename)
            put("status", status)
            put("bytes", bytes)
            put("total", total)
            if (error != null) put("error", error)
            if (uri != null) put("uri", uri)
        }
        statuses[id] = payload
        if (statuses.size > 50) {
            statuses.entries.filter { it.value.optString("status") != "running" }.take(10)
                .forEach { statuses.remove(it.key) }
        }
        NativeEvents.pushDownload(payload.toString())
    }

    /* ------------------------------ permissions ---------------------------- */

    /**
     * Android 13+ uses the per-type media permissions, older releases fall back to
     * READ_EXTERNAL_STORAGE. "All files access" (granted only from Settings, on the
     * user's own initiative) also implies read access, so accept it too.
     */
    private fun canRead(perMediaPermission: String): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()) {
            return true
        }
        val perm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perMediaPermission
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
        return ContextCompat.checkSelfPermission(activity, perm) == PackageManager.PERMISSION_GRANTED
    }
}
