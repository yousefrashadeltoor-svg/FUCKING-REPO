package fm.donmuse.app.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import fm.donmuse.app.MainActivity

/**
 * Real background playback.
 *
 * MediaSessionService gives us, for free and correctly:
 *   • a MediaStyle notification with play/pause, previous, next and a seek bar
 *     that the system recognises as media (Android Auto, Wear, Assistant…)
 *   • lock-screen and Bluetooth/headset controls
 *   • audio focus handling and "becoming noisy" (unplugged headphones) pause
 *   • playback that continues when the WebView is paused or the app is closed
 */
class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val exo = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true, // handle audio focus automatically
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
            .apply { repeatMode = Player.REPEAT_MODE_OFF }

        val sessionActivity = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val session = MediaSession.Builder(this, exo)
            .setSessionActivity(sessionActivity)
            .build()
        mediaSession = session
        NativePlayer.attach(exo, session, this)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Keep playing when the user swipes the app away (standard behaviour for
        // music apps) unless nothing is loaded.
        val player = mediaSession?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        NativePlayer.detach()
        mediaSession?.run { player.release(); release() }
        mediaSession = null
        super.onDestroy()
    }
}
