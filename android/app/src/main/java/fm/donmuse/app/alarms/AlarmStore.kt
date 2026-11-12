package fm.donmuse.app.alarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import fm.donmuse.app.bridge.AppStorage
import fm.donmuse.app.bridge.NativeEvents
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

object AlarmScheduler {
    private const val KEY="donmuse.alarms.v1"
    fun canSchedule(ctx:Context):Boolean=Build.VERSION.SDK_INT<31||ctx.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
    fun all(ctx:Context):JSONArray=runCatching{JSONArray(AppStorage(ctx).get(KEY) ?: "[]")}.getOrDefault(JSONArray())
    private fun save(ctx:Context,array:JSONArray){AppStorage(ctx).set(KEY,array.toString())}
    fun nextOccurrence(at:Long,days:List<Int>,now:Long=System.currentTimeMillis()):Long {
        if(days.isEmpty())return at
        val cal=Calendar.getInstance();cal.timeInMillis=at
        for(offset in 0..7){val c=cal.clone() as Calendar;c.add(Calendar.DAY_OF_YEAR,offset);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);if(c.timeInMillis>now&&(c.get(Calendar.DAY_OF_WEEK)-1) in days)return c.timeInMillis}
        return at
    }
    fun schedule(ctx:Context,input:JSONObject):JSONObject {
        require(canSchedule(ctx)){"فعّل إذن المنبهات والتذكيرات من إعدادات النظام"}
        val daysJson=input.optJSONArray("repeatDays") ?: JSONArray();val days=(0 until daysJson.length()).map{daysJson.getInt(it)}.filter{it in 0..6}.distinct()
        val original=input.getLong("at");val at=nextOccurrence(original,days);require(at>System.currentTimeMillis()){"اختر وقتًا في المستقبل"}
        val alarm=JSONObject(input.toString()).put("at",at).put("enabled",true).put("repeatDays",JSONArray(days)).put("label",input.optString("label","المنبّه").take(80))
        val id=alarm.getString("id");require(id.matches(Regex("[a-zA-Z0-9_-]{1,100}"))){"معرّف المنبّه غير صالح"}
        val list=all(ctx);val updated=JSONArray();for(i in 0 until list.length())if(list.getJSONObject(i).getString("id")!=id)updated.put(list.getJSONObject(i));updated.put(alarm);save(ctx,updated)
        NativeEvents.emit("alarms",updated.toString())
        arm(ctx,alarm);return alarm
    }
    private fun pending(ctx:Context,id:String):PendingIntent=PendingIntent.getBroadcast(ctx,id.hashCode(),Intent(ctx,AlarmReceiver::class.java).setAction("fm.donmuse.ALARM").putExtra("id",id).setData(android.net.Uri.parse("donmuse://alarm/$id")),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    private fun arm(ctx:Context,a:JSONObject){
        val mgr=ctx.getSystemService(AlarmManager::class.java);val pi=pending(ctx,a.getString("id"));mgr.cancel(pi)
        if(!a.optBoolean("enabled",true))return
        val show=PendingIntent.getActivity(ctx,a.getString("id").hashCode(),Intent(ctx,AlarmActivity::class.java).putExtra("id",a.getString("id")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        mgr.setAlarmClock(AlarmManager.AlarmClockInfo(a.getLong("at"),show),pi)
    }
    fun cancel(ctx:Context,id:String){val list=all(ctx);val out=JSONArray();for(i in 0 until list.length())if(list.getJSONObject(i).getString("id")!=id)out.put(list.getJSONObject(i));save(ctx,out);NativeEvents.emit("alarms",out.toString());ctx.getSystemService(AlarmManager::class.java).cancel(pending(ctx,id))}
    fun get(ctx:Context,id:String):JSONObject?{val a=all(ctx);for(i in 0 until a.length())if(a.getJSONObject(i).getString("id")==id)return a.getJSONObject(i);return null}
    fun fired(ctx:Context,id:String){val a=get(ctx,id) ?: return;val daysJson=a.optJSONArray("repeatDays") ?: JSONArray();val days=(0 until daysJson.length()).map{daysJson.getInt(it)};if(days.isEmpty()){a.put("enabled",false);val list=all(ctx);for(i in 0 until list.length())if(list.getJSONObject(i).getString("id")==id)list.put(i,a);save(ctx,list)}else{a.put("at",nextOccurrence(a.getLong("at"),days,System.currentTimeMillis()+60_000));val list=all(ctx);for(i in 0 until list.length())if(list.getJSONObject(i).getString("id")==id)list.put(i,a);save(ctx,list);runCatching{arm(ctx,a)}}}
    fun snooze(ctx:Context,id:String){val a=get(ctx,id) ?: JSONObject().put("id",id).put("label","غفوة");a.put("at",System.currentTimeMillis()+5*60_000).put("repeatDays",JSONArray());val list=all(ctx);var found=false;for(i in 0 until list.length())if(list.getJSONObject(i).getString("id")==id){list.put(i,a);found=true};if(!found)list.put(a);save(ctx,list);runCatching{arm(ctx,a)}}
    fun rescheduleAll(ctx:Context){if(!canSchedule(ctx))return;val list=all(ctx);for(i in 0 until list.length())runCatching{val a=list.getJSONObject(i);if(a.optBoolean("enabled")){val daysJson=a.optJSONArray("repeatDays") ?: JSONArray();val days=(0 until daysJson.length()).map{daysJson.getInt(it)};if(a.getLong("at")<=System.currentTimeMillis())a.put("at",nextOccurrence(a.getLong("at"),days));arm(ctx,a)}};save(ctx,list)}
}
