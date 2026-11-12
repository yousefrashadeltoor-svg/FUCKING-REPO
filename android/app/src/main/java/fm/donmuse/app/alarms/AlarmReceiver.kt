package fm.donmuse.app.alarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AlarmReceiver:BroadcastReceiver(){
    override fun onReceive(ctx:Context,intent:Intent){if(intent.action!="fm.donmuse.ALARM")return;val id=intent.getStringExtra("id") ?: return;AlarmScheduler.fired(ctx,id);ContextCompat.startForegroundService(ctx,Intent(ctx,AlarmService::class.java).setAction(AlarmService.ACTION_RING).putExtra("id",id))}
}
