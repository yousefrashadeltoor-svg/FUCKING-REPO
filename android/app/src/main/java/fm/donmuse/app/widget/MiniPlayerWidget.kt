package fm.donmuse.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import fm.donmuse.app.playback.NativePlayer

class MiniPlayerWidget : AppWidgetProvider() {
    override fun onUpdate(ctx:Context,mgr:AppWidgetManager,ids:IntArray)=WidgetUpdater.refresh(ctx)
    override fun onReceive(ctx:Context,intent:Intent){
        when(intent.action){
            NowPlayingWidget.ACTION_TOGGLE->if(NativePlayer.queueLength()==0)NativePlayer.restoreAndPlay(ctx)else NativePlayer.toggle()
            NowPlayingWidget.ACTION_NEXT->if(NativePlayer.queueLength()>0)NativePlayer.next()
            NowPlayingWidget.ACTION_PREV->if(NativePlayer.queueLength()>0)NativePlayer.previous()
            NowPlayingWidget.ACTION_STOP->NativePlayer.stop()
        }
        super.onReceive(ctx,intent);WidgetUpdater.refresh(ctx)
    }
}
