package fm.donmuse.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import fm.donmuse.app.MainActivity
import fm.donmuse.app.R
import fm.donmuse.app.playback.NativePlayer

/** Pushes the current playback state into every home-screen widget. */
object WidgetUpdater {
    fun refresh(ctx: Context) {
        runCatching {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, NowPlayingWidget::class.java))
            if (ids.isNotEmpty()) build(ctx, mgr, ids, R.layout.widget_now_playing)
            val miniIds = mgr.getAppWidgetIds(ComponentName(ctx, MiniPlayerWidget::class.java))
            if (miniIds.isNotEmpty()) build(ctx, mgr, miniIds, R.layout.widget_mini_player)
        }
    }

    private fun build(ctx: Context, mgr: AppWidgetManager, ids: IntArray, layout: Int) {
        val title = NativePlayer.currentTitle()
        val artist = NativePlayer.currentArtist()
        val playing = NativePlayer.isPlaying()
        val art = NativePlayer.currentArtUri()
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, layout)
            v.setTextViewText(R.id.w_title, title)
            v.setTextViewText(R.id.w_artist, artist)
            v.setTextViewText(R.id.w_status, if (playing) "قيد التشغيل" else "متوقف")
            v.setOnClickPendingIntent(R.id.w_play, action(ctx, NowPlayingWidget.ACTION_TOGGLE, 1))
            v.setOnClickPendingIntent(R.id.w_next, action(ctx, NowPlayingWidget.ACTION_NEXT, 2))
            v.setOnClickPendingIntent(R.id.w_prev, action(ctx, NowPlayingWidget.ACTION_PREV, 3))
            v.setOnClickPendingIntent(R.id.w_stop, action(ctx, NowPlayingWidget.ACTION_STOP, 4))
            runCatching {
                v.setImageViewResource(R.id.w_play, if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play)
            }
            val open = PendingIntent.getActivity(
                ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            v.setOnClickPendingIntent(R.id.w_title, open)
            v.setOnClickPendingIntent(R.id.w_artist, open)
            v.setOnClickPendingIntent(R.id.w_root, open)
            // Cover art (falls back to the DON MUSE mark when absent)
            if (!art.isNullOrEmpty()) {
                runCatching { v.setImageViewUri(R.id.w_cover, android.net.Uri.parse(art)) }
            } else {
                runCatching { v.setImageViewResource(R.id.w_cover, R.drawable.ic_launcher_foreground) }
            }
            mgr.updateAppWidget(id, v)
        }
    }

    private fun action(ctx: Context, action: String, code: Int): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, code,
            Intent(ctx, NowPlayingWidget::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
}
