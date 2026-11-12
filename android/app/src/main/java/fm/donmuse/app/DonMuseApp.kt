package fm.donmuse.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import fm.donmuse.app.alarms.AlarmScheduler
import fm.donmuse.app.data.MediaExtractor
import fm.donmuse.app.download.DownloadRepository

class DonMuseApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        listOf(
            Triple(CHANNEL_PLAYBACK, "تشغيل الموسيقى", NotificationManager.IMPORTANCE_LOW),
            Triple(CHANNEL_DOWNLOAD, "التنزيلات", NotificationManager.IMPORTANCE_LOW),
            Triple(CHANNEL_GENERAL, "إشعارات DON MUSE", NotificationManager.IMPORTANCE_DEFAULT),
            Triple(CHANNEL_ALARM, "المنبّه", NotificationManager.IMPORTANCE_HIGH),
        ).forEach { (id, title, importance) ->
            nm.createNotificationChannel(NotificationChannel(id, title, importance).apply {
                if (id == CHANNEL_ALARM) {
                    setSound(null, null)
                    enableVibration(true)
                    lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                    setBypassDnd(false)
                }
                if (id == CHANNEL_PLAYBACK) setShowBadge(false)
            })
        }
        MediaExtractor.init()
        DownloadRepository.initialize(this)
        AlarmScheduler.rescheduleAll(this)
    }

    companion object {
        const val CHANNEL_PLAYBACK = "playback"
        const val CHANNEL_DOWNLOAD = "downloads"
        const val CHANNEL_GENERAL = "general"
        const val CHANNEL_ALARM = "alarms-v2"
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val START_URL = "$ORIGIN/assets/www/index.html"
        fun routeUrl(path: String): String {
            val clean = path.trim('/').replace(Regex("[^a-zA-Z0-9_/:?=&.%-]"), "")
            return "$ORIGIN/assets/www/${clean.ifEmpty { "index.html" }}"
        }
        fun isLocal(url: android.net.Uri): Boolean = url.scheme == "https" && url.host == "appassets.androidplatform.net" && url.path.orEmpty().startsWith("/assets/www/")
    }
}
