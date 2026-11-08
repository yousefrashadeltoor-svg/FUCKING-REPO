package fm.donmuse.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
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

        val req = PeriodicWorkRequestBuilder<ReleaseCheckWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "donmuse-release-check", ExistingPeriodicWorkPolicy.KEEP, req,
        )
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        // The playback channel is LOW so the notification is silent + ongoing,
        // exactly like every serious music player.
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PLAYBACK, getString(R.string.channel_playback), NotificationManager.IMPORTANCE_LOW)
                .apply {
                    description = "شريط تشغيل دائم مع أزرار التحكم"
                    setShowBadge(false)
                    lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_NEW, getString(R.string.channel_new_releases), NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "New songs and albums from DON MUSE" },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_FOLLOWED, getString(R.string.channel_followed), NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "When an artist you follow releases something new" },
        )
    }

    companion object {
        const val CHANNEL_NEW = "new_releases"
        const val CHANNEL_FOLLOWED = "followed_artists"
        const val CHANNEL_PLAYBACK = "playback"

        /**
         * The web app that provides the UI (same project, built by CI).
         * Overridden at build time: ./gradlew -PwebHost=my.site
         * (see app/build.gradle.kts → BuildConfig.WEB_HOST).
         */
        val WEB_HOST: String = BuildConfig.WEB_HOST

        /**
         * Origin of the server that serves the /api routes. When the UI is bundled the
         * page itself is a `file://` asset, so background work (release checks)
         * must still talk to the hosted origin — never to the asset path.
         */
        val API_BASE: String = "https://$WEB_HOST"

        /**
         * The UI is loaded from the bundled asset build when present
         * (`app/src/main/assets/www/index.html`), otherwise from the hosted
         * build — so the APK always opens something real.
         */
        fun hasBundledUi(ctx: Context): Boolean = runCatching {
            ctx.assets.open("www/index.html").close()
            true
        }.getOrDefault(false)

        fun startUrl(ctx: Context): String =
            if (hasBundledUi(ctx)) "file:///android_asset/www/index.html"
            else "https://$WEB_HOST"

        /**
         * Deep link → concrete URL for either host.
         * Bundled UI ships one index.html per route, so a path maps to
         * `www/<route>/index.html`; the hosted build takes the normal path.
         */
        fun routeUrl(ctx: Context, path: String): String {
            val clean = path.trim('/').split('?').first().split('#').first()
            if (hasBundledUi(ctx)) {
                return if (clean.isEmpty()) startUrl(ctx)
                else "file:///android_asset/www/$clean/index.html"
            }
            return if (clean.isEmpty()) startUrl(ctx) else "https://$WEB_HOST/$clean"
        }
    }
}
