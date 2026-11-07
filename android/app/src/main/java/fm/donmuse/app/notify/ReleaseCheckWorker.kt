package fm.donmuse.app.notify

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import fm.donmuse.app.DonMuseApp
import fm.donmuse.app.MainActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Polls the DON MUSE server for the newest track and posts a real notification
 * when something new appears (new releases + followed artists).
 */
class ReleaseCheckWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("donmuse", Context.MODE_PRIVATE)
        val last = prefs.getLong("last_track_id", 0L)
        val json = runCatching { http("${DonMuseApp.API_BASE}/api/home") }.getOrNull() ?: return Result.retry()
        val sections = JSONObject(json).optJSONArray("sections") ?: return Result.success()
        var newestId = 0L
        var title = ""
        var artist = ""
        for (i in 0 until sections.length()) {
            val s = sections.getJSONObject(i)
            if (s.optString("id") != "trending") continue
            val items = s.optJSONArray("items") ?: continue
            for (j in 0 until items.length()) {
                val t = items.getJSONObject(j)
                val id = t.optLong("id")
                if (id > newestId) {
                    newestId = id; title = t.optString("title"); artist = t.optString("artistName")
                }
            }
        }
        if (newestId > last && last != 0L && title.isNotEmpty()) {
            post(applicationContext, title, artist)
        }
        if (newestId > 0) prefs.edit().putLong("last_track_id", newestId).apply()
        return Result.success()
    }

    private fun post(ctx: Context, title: String, artist: String) {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val intent = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, DonMuseApp.CHANNEL_FOLLOWED)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("New from $artist")
            .setContentText(title)
            .setStyle(NotificationCompat.BigTextStyle().bigText("$title — $artist is now on DON MUSE"))
            .setAutoCancel(true)
            .setContentIntent(intent)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(2001, n)
    }

    private fun http(url: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 30000
        return c.inputStream.bufferedReader().use { it.readText() }
    }
}
