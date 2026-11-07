package fm.donmuse.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import fm.donmuse.app.MainActivity
import fm.donmuse.app.R
import fm.donmuse.app.playback.Playback
import fm.donmuse.app.playback.PlaybackService

/** Home-screen widget with full transport controls (prev / play-pause / next / stop). */
class NowPlayingWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_now_playing)
            val p = PlaybackService.player
            v.setTextViewText(R.id.w_title, p?.currentMediaItem?.mediaMetadata?.title ?: "DON MUSE")
            v.setTextViewText(R.id.w_artist, p?.currentMediaItem?.mediaMetadata?.artist ?: "Tap to open")
            v.setOnClickPendingIntent(R.id.w_play, action(ctx, ACTION_TOGGLE, 1))
            v.setOnClickPendingIntent(R.id.w_next, action(ctx, ACTION_NEXT, 2))
            v.setOnClickPendingIntent(R.id.w_prev, action(ctx, ACTION_PREV, 3))
            v.setOnClickPendingIntent(R.id.w_stop, action(ctx, ACTION_STOP, 4))
            val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.w_title, open)
            v.setOnClickPendingIntent(R.id.w_artist, open)
            mgr.updateAppWidget(id, v)
        }
    }

    private fun action(ctx: Context, a: String, code: Int): PendingIntent =
        PendingIntent.getBroadcast(ctx, code, Intent(ctx, NowPlayingWidget::class.java).setAction(a), PendingIntent.FLAG_IMMUTABLE)

    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TOGGLE -> Playback.toggle()
            ACTION_NEXT -> Playback.next()
            ACTION_PREV -> Playback.previous()
            ACTION_STOP -> Playback.stop()
        }
        val mgr = AppWidgetManager.getInstance(ctx)
        onUpdate(ctx, mgr, mgr.getAppWidgetIds(ComponentName(ctx, NowPlayingWidget::class.java)))
    }

    companion object {
        const val ACTION_TOGGLE = "fm.donmuse.app.WIDGET_TOGGLE"
        const val ACTION_NEXT = "fm.donmuse.app.WIDGET_NEXT"
        const val ACTION_PREV = "fm.donmuse.app.WIDGET_PREV"
        const val ACTION_STOP = "fm.donmuse.app.WIDGET_STOP"
    }
}
