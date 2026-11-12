package fm.donmuse.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import fm.donmuse.app.playback.NativePlayer

class NowPlayingWidget : AppWidgetProvider() {
    override fun onUpdate(ctx:Context,mgr:AppWidgetManager,ids:IntArray)=WidgetUpdater.refresh(ctx)
    override fun onReceive(ctx:Context,intent:Intent){
        when(intent.action){
            ACTION_TOGGLE->if(NativePlayer.queueLength()==0)NativePlayer.restoreAndPlay(ctx)else NativePlayer.toggle()
            ACTION_NEXT->if(NativePlayer.queueLength()>0)NativePlayer.next()
            ACTION_PREV->if(NativePlayer.queueLength()>0)NativePlayer.previous()
            ACTION_STOP->NativePlayer.stop()
        }
        // Never start a foreground service for STOP/NEXT with an empty player:
        // Android requires startForeground() within five seconds of every start.
        super.onReceive(ctx,intent);WidgetUpdater.refresh(ctx)
    }
    companion object{const val ACTION_TOGGLE="fm.donmuse.app.WIDGET_TOGGLE";const val ACTION_NEXT="fm.donmuse.app.WIDGET_NEXT";const val ACTION_PREV="fm.donmuse.app.WIDGET_PREV";const val ACTION_STOP="fm.donmuse.app.WIDGET_STOP"}
}
