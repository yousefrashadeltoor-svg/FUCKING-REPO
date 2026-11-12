package fm.donmuse.app.alarms

import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import fm.donmuse.app.DonMuseApp
import fm.donmuse.app.R

class AlarmService:Service(){
    private var ringtone:Ringtone?=null;private var wake:PowerManager.WakeLock?=null
    private val handler=Handler(Looper.getMainLooper());private val timeout=Runnable{stopRing()}
    override fun onBind(intent:Intent?):IBinder?=null
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        val id=intent?.getStringExtra("id") ?: "alarm"
        when(intent?.action){ACTION_SNOOZE->{AlarmScheduler.snooze(this,id);stopRing();return START_NOT_STICKY}ACTION_DISMISS->{stopRing();return START_NOT_STICKY}}
        val a=AlarmScheduler.get(this,id);val label=a?.optString("label") ?: "المنبّه"
        val full=PendingIntent.getActivity(this,id.hashCode(),Intent(this,AlarmActivity::class.java).putExtra("id",id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val dismiss=PendingIntent.getService(this,id.hashCode()+1,Intent(this,AlarmService::class.java).setAction(ACTION_DISMISS).putExtra("id",id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val snooze=PendingIntent.getService(this,id.hashCode()+2,Intent(this,AlarmService::class.java).setAction(ACTION_SNOOZE).putExtra("id",id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n=NotificationCompat.Builder(this,DonMuseApp.CHANNEL_ALARM).setSmallIcon(R.drawable.ic_notification).setContentTitle("DON MUSE · المنبّه").setContentText(label).setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_MAX).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOngoing(true).setSilent(true).setContentIntent(full).setFullScreenIntent(full,true).addAction(0,"إيقاف",dismiss).addAction(0,"غفوة 5 دقائق",snooze).build()
        ServiceCompat.startForeground(this,3001,n,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        if(ringtone?.isPlaying==true)return START_REDELIVER_INTENT
        wake=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"DonMuse:Alarm").apply{acquire(10*60_000L)}
        val uri=runCatching{android.net.Uri.parse(a?.optString("soundUri")?.takeIf{it.isNotBlank()&&it!="null"})}.getOrNull() ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        ringtone=RingtoneManager.getRingtone(this,uri).apply{audioAttributes=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();play()}
        startActivity(Intent(this,AlarmActivity::class.java).putExtra("id",id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        handler.postDelayed(timeout,10*60_000L);return START_REDELIVER_INTENT
    }
    private fun stopRing(){handler.removeCallbacks(timeout);ringtone?.stop();ringtone=null;if(wake?.isHeld==true)wake?.release();wake=null;ServiceCompat.stopForeground(this,ServiceCompat.STOP_FOREGROUND_REMOVE);stopSelf()}
    override fun onDestroy(){handler.removeCallbacks(timeout);ringtone?.stop();if(wake?.isHeld==true)wake?.release();super.onDestroy()}
    companion object{const val ACTION_RING="fm.donmuse.ALARM_RING";const val ACTION_DISMISS="fm.donmuse.ALARM_DISMISS";const val ACTION_SNOOZE="fm.donmuse.ALARM_SNOOZE"}
}
