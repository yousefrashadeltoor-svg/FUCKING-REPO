package fm.donmuse.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.RemoteViews
import fm.donmuse.app.MainActivity
import fm.donmuse.app.R
import fm.donmuse.app.data.Http
import fm.donmuse.app.playback.NativePlayer
import fm.donmuse.app.playback.PlaybackService
import java.util.concurrent.Executors

object WidgetUpdater {
    private val io=Executors.newSingleThreadExecutor()
    @Volatile private var generation=0
    private var lastArt:String?=null;private var art:android.graphics.Bitmap?=null
    fun refresh(ctx:Context){
        val c=ctx.applicationContext;val g=++generation
        val mgr=AppWidgetManager.getInstance(c);val title=NativePlayer.currentTitle();val artist=NativePlayer.currentArtist();val playing=NativePlayer.isPlaying();val uri=NativePlayer.currentArtUri()
        val sets=listOf(NowPlayingWidget::class.java to R.layout.widget_now_playing,MiniPlayerWidget::class.java to R.layout.widget_mini_player).map{(cls,layout)->Triple(cls,layout,mgr.getAppWidgetIds(ComponentName(c,cls)))}.filter{it.third.isNotEmpty()}
        if(sets.isEmpty())return
        fun render(bitmap:android.graphics.Bitmap?){if(g!=generation)return;for((cls,layout,ids)in sets){val v=RemoteViews(c.packageName,layout);v.setTextViewText(R.id.w_title,title);v.setTextViewText(R.id.w_artist,artist);v.setTextViewText(R.id.w_status,if(playing)"قيد التشغيل" else "متوقف");v.setImageViewResource(R.id.w_play,if(playing)android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play);v.setContentDescription(R.id.w_play,if(playing)"إيقاف مؤقت" else "تشغيل");if(bitmap!=null)v.setImageViewBitmap(R.id.w_cover,bitmap)else v.setImageViewResource(R.id.w_cover,R.drawable.ic_launcher_foreground)
            val open=PendingIntent.getActivity(c,0,Intent(c,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT);v.setOnClickPendingIntent(R.id.w_root,open);v.setOnClickPendingIntent(R.id.w_title,open);v.setOnClickPendingIntent(R.id.w_artist,open)
            listOf(R.id.w_play to NowPlayingWidget.ACTION_TOGGLE,R.id.w_next to NowPlayingWidget.ACTION_NEXT,R.id.w_prev to NowPlayingWidget.ACTION_PREV,R.id.w_stop to NowPlayingWidget.ACTION_STOP).forEachIndexed{i,(id,action)->v.setOnClickPendingIntent(id,PendingIntent.getBroadcast(c,10+i,Intent(c,NowPlayingWidget::class.java).setAction(action),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))};mgr.updateAppWidget(ids,v)}}
        if(uri==lastArt){render(art);return}
        lastArt=uri;art=null;render(null)
        if(uri.isNullOrBlank())return
        io.execute{val bitmap=runCatching{if(uri.startsWith("content:"))c.contentResolver.openInputStream(Uri.parse(uri)).use{BitmapFactory.decodeStream(it)}else Http.client.newCall(Http.request(uri).build()).execute().use{r->if(r.isSuccessful)r.body?.byteStream()?.let(BitmapFactory::decodeStream)else null}}.getOrNull();android.os.Handler(android.os.Looper.getMainLooper()).post{if(g==generation){art=bitmap;render(bitmap)}}}
    }
}
