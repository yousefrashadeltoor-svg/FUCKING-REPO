package fm.donmuse.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import fm.donmuse.app.playback.NativePlayer

/** 4×1 compact player: cover, title, prev / play-pause / next. */
class MiniPlayerWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = WidgetUpdater.refresh(ctx)

    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            NowPlayingWidget.ACTION_TOGGLE -> NativePlayer.toggle()
            NowPlayingWidget.ACTION_NEXT -> NativePlayer.next()
            NowPlayingWidget.ACTION_PREV -> NativePlayer.previous()
            NowPlayingWidget.ACTION_STOP -> NativePlayer.stop()
        }
        WidgetUpdater.refresh(ctx)
        super.onReceive(ctx, intent)
    }
}
