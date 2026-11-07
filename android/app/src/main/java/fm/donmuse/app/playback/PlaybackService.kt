package fm.donmuse.app.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import fm.donmuse.app.MainActivity

/**
 * Real background playback service (Media3). Provides OS media controls,
 * a MediaStyle notification with actions, lock-screen / Bluetooth controls.
 */
class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    companion object {
        var player: ExoPlayer? = null
            private set
        var session: MediaSession? = null
            private set
    }

    override fun onCreate() {
        super.onCreate()
        val exo = ExoPlayer.Builder(this).setHandleAudioBecomingNoisy(true).build().apply {
            repeatMode = Player.REPEAT_MODE_OFF
        }
        val sessionActivity = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val s = MediaSession.Builder(this, exo).setSessionActivity(sessionActivity).build()
        mediaSession = s
        player = exo
        session = s
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.run { player.release(); release() }
        mediaSession = null
        player = null
        session = null
        super.onDestroy()
    }
}

/** Convenience helpers used by the UI + widgets. */
object Playback {
    fun play(items: List<Pair<String, String>>, startIndex: Int, streamUrls: List<String>) {
        val p = PlaybackService.player ?: return
        p.setMediaItems(items.mapIndexed { i, (title, artist) ->
            MediaItem.Builder()
                .setUri(streamUrls[i])
                .setMediaMetadata(
                    androidx.media3.common.MediaMetadata.Builder()
                        .setTitle(title).setArtist(artist).build()
                ).build()
        }, startIndex, 0L)
        p.prepare()
        p.playWhenReady = true
    }

    fun toggle() {
        val p = PlaybackService.player ?: return
        if (p.isPlaying) p.pause() else p.play()
    }

    fun next() { PlaybackService.player?.seekToNext() }
    fun previous() { PlaybackService.player?.seekToPrevious() }
    fun stop() { PlaybackService.player?.stop() }
}
