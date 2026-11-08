package fm.donmuse.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import fm.donmuse.app.MainActivity
import fm.donmuse.app.R

/** Compact 2×2 launcher for the four everyday sections of DON MUSE. */
class QuickAccessWidget : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_quick_access)
            views.setOnClickPendingIntent(R.id.qa_music, openSection(context, "my-music", 11))
            views.setOnClickPendingIntent(R.id.qa_quran, openSection(context, "quran", 12))
            views.setOnClickPendingIntent(R.id.qa_radio, openSection(context, "radio", 13))
            views.setOnClickPendingIntent(R.id.qa_tv, openSection(context, "tv", 14))
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    private fun openSection(context: Context, route: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("donmuse:///$route")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }
}