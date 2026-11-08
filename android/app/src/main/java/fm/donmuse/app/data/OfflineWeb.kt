package fm.donmuse.app.data

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.MimeTypeMap
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream

/**
 * Serves the bundled UI (`assets/www`) to the WebView over a real http-ish
 * origin instead of `file://`.
 *
 * Why this exists: the app ships a full static build of the site. Under
 * `file://` the browser treats every page as an isolated opaque origin — the
 * app's absolute asset URLs, its stored settings and its in-app links all break
 * (that is what produced blank pages and "broken image" icons). Chrome's
 * `WebViewAssetLoader` gives the same files a stable origin
 * (`https://appassets.androidplatform.net/`) with correct MIME types, so the
 * exact web UI runs inside the APK with no network at all.
 *
 * Route mapping, because a static export writes `route/index.html`:
 *   /            → www/index.html
 *   /radio       → www/radio/index.html   (also /radio/ and /radio/index.html)
 *   /_next/x.js  → www/_next/x.js
 *   missing file → www/index.html for navigations, 404 for sub-resources
 */
object OfflineWeb {

    const val ORIGIN = "https://appassets.androidplatform.net"
    private const val TAG = "DonMuseOffline"

    fun url(path: String = "/"): String = ORIGIN + if (path.startsWith("/")) path else "/$path"

    /** True when `uri` belongs to the bundled UI origin. */
    fun isOurs(uri: Uri?): Boolean = uri?.host == "appassets.androidplatform.net"

    /** The route path of an app URL (`/radio?x=1` → `/radio`). */
    fun pathOf(uri: Uri?): String = uri?.path.orEmpty().ifEmpty { "/" }

    /**
     * Resolve a request against the asset bundle.
     *
     * @param requestPath e.g. `/radio/`, `/`, `/_next/static/chunks/a.js`
     * @param isNavigation true for a document load (an <a> tap or the first load)
     */
    fun resolve(context: Context, requestPath: String, isNavigation: Boolean): WebResourceResponse {
        val clean = requestPath.substringBefore('?').substringBefore('#').trimStart('/')
        val assets = context.assets

        // 1. exact file (js, css, images, json, api-snapshot/*)
        if (clean.isNotEmpty()) {
            fileResponse(context, clean)?.let { return it }
        }
        // 2. route → <route>/index.html
        if (clean.isNotEmpty() && !clean.contains('.')) {
            val dir = clean.trimEnd('/')
            fileResponse(context, "$dir/index.html")?.let { return it }
        }
        // 3. clean route with a trailing slash
        if (clean.endsWith("/index.html")) {
            fileResponse(context, clean)?.let { return it }
        }
        // 4. unknown route → the shell, so a deep link never blanks out
        //    (the SPA picks the right screen from the page it was served)
        if (isNavigation) {
            fileResponse(context, "index.html")?.let { return it }
        }
        Log.w(TAG, "missing asset: $clean")
        return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
    }

    private fun fileResponse(context: Context, assetPath: String): WebResourceResponse? {
        val stream: InputStream = try {
            context.assets.open("www/$assetPath")
        } catch (_: Exception) {
            return null
        }
        val mime = mimeFor(assetPath)
        return WebResourceResponse(
            mime.first,
            mime.second,
            // 200, immutable hashed files are cached by the WebView itself.
            200,
            "OK",
            mapOf("Cache-Control" to "no-cache", "Access-Control-Allow-Origin" to "*"),
            stream,
        )
    }

    private fun mimeFor(path: String): Pair<String, String> {
        val ext = path.substringAfterLast('.', "").lowercase()
        val known = when (ext) {
            "html", "htm" -> "text/html" to "utf-8"
            "js", "mjs" -> "application/javascript" to "utf-8"
            "css" -> "text/css" to "utf-8"
            "json" -> "application/json" to "utf-8"
            "webmanifest" -> "application/manifest+json" to "utf-8"
            "svg" -> "image/svg+xml" to "utf-8"
            "txt" -> "text/plain" to "utf-8"
            "woff2" -> "font/woff2" to ""
            "woff" -> "font/woff" to ""
            "ttf" -> "font/ttf" to ""
            "png" -> "image/png" to ""
            "jpg", "jpeg" -> "image/jpeg" to ""
            "webp" -> "image/webp" to ""
            "gif" -> "image/gif" to ""
            "ico" -> "image/x-icon" to ""
            "mp3" -> "audio/mpeg" to ""
            "mp4" -> "video/mp4" to ""
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)?.let { it to "" }
                ?: ("application/octet-stream" to "")
        }
        return known
    }
}
