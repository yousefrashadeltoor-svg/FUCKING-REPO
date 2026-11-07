package fm.donmuse.app.playback

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import fm.donmuse.app.bridge.NativeEvents
import fm.donmuse.app.widget.WidgetUpdater
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * The single native player facade used by the bridge, the widgets and the
 * sleep timer. It is the authoritative playback state on Android — the WebView
 * mirrors it, never the other way round.
 */
object NativePlayer {
    private var player: ExoPlayer? = null
    private var session: MediaSession? = null
    private var appContext: Context? = null
    private var sleepHandler: Handler? = null
    private var sleepRunnable: Runnable? = null

    fun attach(exo: ExoPlayer, mediaSession: MediaSession, ctx: Context) {
        player = exo
        session = mediaSession
        appContext = ctx.applicationContext
        exo.addListener(object : Player.Listener {
            override fun onEvents(p: Player, events: Player.Events) {
                WidgetUpdater.refresh(appContext ?: return)
                NativeEvents.pushPlayback(stateJson())
            }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                WidgetUpdater.refresh(appContext ?: return)
                NativeEvents.pushPlayback(stateJson())
            }
        })
    }

    fun detach() {
        session = null
        player = null
    }

    /** Replace the queue with the items sent by the UI and start playing. */
    fun setQueue(ctx: Context, json: String) {
        val exo = player ?: return
        appContext = ctx.applicationContext
        val root = JSONObject(json)
        val items = root.optJSONArray("items") ?: JSONArray()
        val index = root.optInt("index", 0)
        val autoplay = root.optBoolean("autoplay", true)
        val startAtMs = root.optLong("startAtMs", 0)

        val mediaItems = ArrayList<MediaItem>(items.length())
        for (i in 0 until items.length()) {
            val o = items.getJSONObject(i)
            val artUri = o.optString("artUri", "")
            val meta = MediaMetadata.Builder()
                .setTitle(o.optString("title"))
                .setArtist(o.optString("artist"))
                .setAlbumTitle(o.optString("album"))
                .setArtworkUri(if (artUri.isNotEmpty() && artUri != "null") android.net.Uri.parse(artUri) else null)
                .setMediaId(o.optString("id"))
                .build()
            mediaItems += MediaItem.Builder()
                .setUri(o.optString("uri"))
                .setMediaId(o.optString("id"))
                .setMediaMetadata(meta)
                .build()
        }
        exo.setMediaItems(mediaItems, index.coerceIn(0, maxOf(0, mediaItems.size - 1)), startAtMs)
        exo.prepare()
        exo.playWhenReady = autoplay
        WidgetUpdater.refresh(ctx)
    }

    fun toggle() {
        val p = player ?: return
        if (p.isPlaying) p.pause() else p.play()
    }

    fun play() { player?.play() }
    fun pause() { player?.pause() }
    fun next() { player?.seekToNextMediaItem() }
    fun previous() {
        val p = player ?: return
        if (p.currentPosition > 3000) p.seekTo(0) else p.seekToPreviousMediaItem()
    }
    fun seek(ms: Long) { player?.seekTo(ms) }
    fun stop() {
        player?.stop()
        player?.clearMediaItems()
    }
    fun setVolume(v: Float) { player?.volume = v.coerceIn(0f, 1f) }
    fun setRate(r: Float) { player?.setPlaybackSpeed(r.coerceIn(0.5f, 3f)) }

    /** Sleep timer that fades out then pauses. */
    fun setSleepTimer(ms: Long) {
        val ctx = appContext ?: return
        val h = sleepHandler ?: Handler(Looper.getMainLooper()).also { sleepHandler = it }
        sleepRunnable?.let { h.removeCallbacks(it) }
        if (ms <= 0) {
            player?.volume = 1f
            return
        }
        val r = Runnable {
            val exo = player ?: return@Runnable
            val steps = 20
            val startVol = exo.volume
            val stepMs = 500L
            for (i in 1..steps) {
                h.postDelayed({ exo.volume = startVol * (1f - i.toFloat() / steps) }, stepMs * i)
            }
            h.postDelayed({
                exo.pause()
                exo.volume = 1f
                WidgetUpdater.refresh(ctx)
            }, stepMs * (steps + 1))
        }
        sleepRunnable = r
        h.postDelayed(r, ms)
    }

    fun isPlaying(): Boolean = player?.isPlaying == true
    fun positionMs(): Long = player?.currentPosition ?: 0L
    fun durationMs(): Long = player?.duration?.takeIf { it > 0 } ?: 0L
    fun queueLength(): Int = player?.mediaItemCount ?: 0

    fun stateJson(): String {
        val p = player
        return JSONObject().apply {
            put("playing", p?.isPlaying == true)
            put("buffering", p?.playbackState == Player.STATE_BUFFERING)
            put("positionMs", p?.currentPosition ?: 0L)
            put("durationMs", p?.duration?.takeIf { it > 0 } ?: 0L)
            put("itemId", p?.currentMediaItem?.mediaId ?: JSONObject.NULL)
            put("index", p?.currentMediaItemIndex ?: -1)
            put("queueLength", p?.mediaItemCount ?: 0)
        }.toString()
    }

    /** Used by the widget: current title / artist / playing state. */
    fun currentTitle(): String = player?.currentMediaItem?.mediaMetadata?.title?.toString() ?: "DON MUSE"
    fun currentArtist(): String = player?.currentMediaItem?.mediaMetadata?.artist?.toString() ?: "Tap to open"
    fun currentArtUri(): String? = player?.currentMediaItem?.mediaMetadata?.artworkUri?.toString()
}
