package fm.donmuse.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import fm.donmuse.app.notify.ReleaseCheckWorker
import java.util.concurrent.TimeUnit

class DonMuseApp : Application() {
    override fun onCreate() {
        super.onCreate()
        createChannels()
        // Real background notification checks (new releases / followed artists).
        val req = PeriodicWorkRequestBuilder<ReleaseCheckWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "donmuse-release-check", ExistingPeriodicWorkPolicy.KEEP, req
        )
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_NEW, "New releases", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "New songs and albums from DON MUSE" }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_FOLLOWED, "Followed artists", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "When an artist you follow releases something new" }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PLAYBACK, "Playback", NotificationManager.IMPORTANCE_LOW)
                .apply { setShowBadge(false) }
        )
    }

    companion object {
        const val CHANNEL_NEW = "new_releases"
        const val CHANNEL_FOLLOWED = "followed_artists"
        const val CHANNEL_PLAYBACK = "playback"
        const val API_BASE = "https://donmuse.app" // point this at your DON MUSE server
    }
}
