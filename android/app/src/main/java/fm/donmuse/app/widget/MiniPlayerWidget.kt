package fm.donmuse.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import fm.donmuse.app.R
import fm.donmuse.app.playback.PlaybackService

/** Compact 4x1 mini player widget. */
class MiniPlayerWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        val p = PlaybackService.player
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_mini_player)
            v.setTextViewText(R.id.w_title, p?.currentMediaItem?.mediaMetadata?.title ?: "DON MUSE")
            v.setTextViewText(R.id.w_artist, p?.currentMediaItem?.mediaMetadata?.artist ?: "Offline library ready")
            mgr.updateAppWidget(id, v)
        }
    }
}
