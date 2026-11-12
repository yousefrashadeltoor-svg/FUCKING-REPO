package fm.donmuse.app.download

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import fm.donmuse.app.DonMuseApp
import fm.donmuse.app.MainActivity
import fm.donmuse.app.R

/** dataSync foreground service keeps large network downloads alive off-screen. */
class DownloadService:Service(){
    private val handler=Handler(Looper.getMainLooper())
    private val tick=object:Runnable{override fun run(){if(!DownloadRepository.hasActive()){stopForeground(ServiceCompat.STOP_FOREGROUND_REMOVE);stopSelf();return};update();handler.postDelayed(this,1000)}}
    override fun onBind(intent:Intent?):IBinder?=null
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{ServiceCompat.startForeground(this,2001,notification(),android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);handler.removeCallbacks(tick);handler.post(tick);return START_NOT_STICKY}
    private fun notification():android.app.Notification{
        val jobs=DownloadRepository.all();var title="جارٍ تنزيل ملفاتك";var progress=0;var count=0
        for(i in 0 until jobs.length()){val j=jobs.getJSONObject(i);if(j.optString("status")=="working"){title=j.optString("title");progress=j.optInt("progress");count++}}
        val pi=android.app.PendingIntent.getActivity(this,20,Intent(this,MainActivity::class.java).setData(android.net.Uri.parse("donmuse://downloads")),android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(this,DonMuseApp.CHANNEL_DOWNLOAD).setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(if(count>1)"$count تنزيلات نشطة" else "اضغط لمتابعة التقدم").setProgress(100,progress,progress==0).setOngoing(true).setOnlyAlertOnce(true).setContentIntent(pi).build()
    }
    private fun update(){if(Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(this,android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED)getSystemService(android.app.NotificationManager::class.java).notify(2001,notification())}
    override fun onDestroy(){handler.removeCallbacks(tick);super.onDestroy()}
    companion object{
        fun ensure(ctx:Context){runCatching{ContextCompat.startForegroundService(ctx.applicationContext,Intent(ctx,DownloadService::class.java))}}
        fun refresh(ctx:Context){if(DownloadRepository.hasActive())ensure(ctx)}
    }
}
