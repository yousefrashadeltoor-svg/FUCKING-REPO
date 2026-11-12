package fm.donmuse.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import fm.donmuse.app.alarms.AlarmScheduler

/** Android delivers these protected broadcasts only to the registered app. */
class BootReceiver:BroadcastReceiver(){
    override fun onReceive(ctx:Context,intent:Intent){if(intent.action in setOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED,Intent.ACTION_TIME_CHANGED,Intent.ACTION_TIMEZONE_CHANGED))AlarmScheduler.rescheduleAll(ctx)}
}
