package fm.donmuse.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import fm.donmuse.app.playback.NativePlayer

/**
 * 4×2 home-screen widget with the real transport controls.
 * The buttons talk to the SAME ExoPlayer instance as the app + notification, so
 * state never diverges.
 */
class NowPlayingWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = WidgetUpdater.refresh(ctx)

    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TOGGLE -> NativePlayer.toggle()
            ACTION_NEXT -> NativePlayer.next()
            ACTION_PREV -> NativePlayer.previous()
            ACTION_STOP -> NativePlayer.stop()
        }
        WidgetUpdater.refresh(ctx)
        super.onReceive(ctx, intent)
    }

    companion object {
        const val ACTION_TOGGLE = "fm.donmuse.app.WIDGET_TOGGLE"
        const val ACTION_NEXT = "fm.donmuse.app.WIDGET_NEXT"
        const val ACTION_PREV = "fm.donmuse.app.WIDGET_PREV"
        const val ACTION_STOP = "fm.donmuse.app.WIDGET_STOP"
    }
}
