package fm.donmuse.app.bridge

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import fm.donmuse.app.DonMuseApp
import fm.donmuse.app.MainActivity
import fm.donmuse.app.R
import fm.donmuse.app.alarms.AlarmScheduler
import fm.donmuse.app.data.DeviceMusic
import fm.donmuse.app.data.Http
import fm.donmuse.app.data.LocalConversions
import fm.donmuse.app.data.MediaExtractor
import fm.donmuse.app.download.DownloadRepository
import fm.donmuse.app.playback.NativePlayer
import fm.donmuse.app.widget.NowPlayingWidget
import fm.donmuse.app.widget.WidgetUpdater
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Capability-protected bridge. Only the locally bundled main document gets the token. */
class NativeBridge(
    private val activity:MainActivity,
    val token:String,
    private val permissionLauncher:ActivityResultLauncher<Array<String>>,
    private val documentLauncher:ActivityResultLauncher<Array<String>>,
    private val imageLauncher:ActivityResultLauncher<Array<String>>,
    private val writeLauncher:ActivityResultLauncher<IntentSenderRequest>,
) {
    private val storage=AppStorage(activity)
    private val io=Executors.newFixedThreadPool(3)
    private var permissionReply:((JSONObject)->Unit)?=null
    private var permissionKinds=emptyList<String>()
    private var documentReply:((JSONArray)->Unit)?=null
    private var imageReply:((String)->Unit)?=null
    private var writeReply:((Boolean)->Unit)?=null
    private fun trusted(t:String):Boolean=activity.trustedDocument&&MessageDigest.isEqual(token.toByteArray(),t.toByteArray())
    private fun guard(t:String){require(trusted(t)){"Native capability denied"}}
    private fun ok(t:String,fn:()->Any?):String=if(!trusted(t))"null" else runCatching{fn()}.getOrNull()?.toString() ?: "null"
    @JavascriptInterface fun nativeReady(t:String)=ok(t){NativeEvents.ready();NativeEvents.emit("playback",NativePlayer.stateJson());"ok"}
    @JavascriptInterface fun uiReady(t:String)=ok(t){activity.runOnUiThread{activity.onUiReady()};"ok"}
    @JavascriptInterface fun platformInfo(t:String)=ok(t){JSONObject().put("platform","android").put("sdk",Build.VERSION.SDK_INT).put("device","${Build.MANUFACTURER} ${Build.MODEL}").put("appVersion",fm.donmuse.app.BuildConfig.VERSION_NAME).put("bundled",true).put("backend",false).put("database",false)}
    @JavascriptInterface fun diagnostics(t:String)=ok(t){JSONObject().put("platform","android").put("sdk",Build.VERSION.SDK_INT).put("cores",Runtime.getRuntime().availableProcessors()).put("freeStorageBytes",activity.filesDir.usableSpace).put("playing",NativePlayer.isPlaying()).put("positionMs",NativePlayer.positionMs()).put("durationMs",NativePlayer.durationMs()).put("queueLength",NativePlayer.queueLength()).put("bundled",true).put("backend",false).put("database",false)}
    private fun permission(kind:String):String?=when(kind){
        "audio"->if(Build.VERSION.SDK_INT>=33)Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
        "video"->if(Build.VERSION.SDK_INT>=33)Manifest.permission.READ_MEDIA_VIDEO else Manifest.permission.READ_EXTERNAL_STORAGE
        "images"->if(Build.VERSION.SDK_INT>=33)Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
        "notifications"->if(Build.VERSION.SDK_INT>=33)Manifest.permission.POST_NOTIFICATIONS else null
        else->null
    }
    private fun granted(kind:String):Boolean=when(kind){
        "exactAlarm"->activity.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
        "notifications"->NotificationManagerCompat.from(activity).areNotificationsEnabled()
        else->permission(kind)?.let{ContextCompat.checkSelfPermission(activity,it)==PackageManager.PERMISSION_GRANTED} ?: true
    }
    @JavascriptInterface fun hasPermission(t:String,kind:String)=ok(t){granted(kind)}
    @JavascriptInterface fun openPermissionSettings(t:String,kind:String)=ok(t){activity.runOnUiThread{val action=when(kind){"exactAlarm"->Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM;"notifications"->Settings.ACTION_APP_NOTIFICATION_SETTINGS;else->Settings.ACTION_APPLICATION_DETAILS_SETTINGS};runCatching{activity.startActivity(Intent(action).setData(Uri.parse("package:${activity.packageName}")).putExtra(Settings.EXTRA_APP_PACKAGE,activity.packageName))}.recoverCatching{activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:${activity.packageName}")))}};"ok"}
    @JavascriptInterface fun openBatterySettings(t:String)=ok(t){activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));"ok"}
    @JavascriptInterface fun storeGet(t:String,key:String):String=if(trusted(t))JSONObject.quote(storage.get(key) ?: "") else "\"\""
    @JavascriptInterface fun storeSet(t:String,key:String,value:String)=ok(t){storage.set(key,value);"ok"}
    @JavascriptInterface fun storeRemove(t:String,key:String)=ok(t){storage.remove(key);"ok"}
    @JavascriptInterface fun storeKeys(t:String)=ok(t){JSONArray(storage.keys())}
    @JavascriptInterface fun playQueue(t:String,json:String)=ok(t){NativePlayer.saveRestoreQueue(json);NativePlayer.setQueue(activity,json);"ok"}
    @JavascriptInterface fun play(t:String)=ok(t){NativePlayer.play();"ok"}
    @JavascriptInterface fun pause(t:String)=ok(t){NativePlayer.pause();"ok"}
    @JavascriptInterface fun next(t:String)=ok(t){NativePlayer.next();"ok"}
    @JavascriptInterface fun previous(t:String)=ok(t){NativePlayer.previous();"ok"}
    @JavascriptInterface fun stopPlayback(t:String)=ok(t){NativePlayer.stop();"ok"}
    @JavascriptInterface fun seekTo(t:String,ms:Long)=ok(t){NativePlayer.seek(ms);"ok"}
    @JavascriptInterface fun setVolume(t:String,v:Double)=ok(t){NativePlayer.setVolume(v.toFloat());"ok"}
    @JavascriptInterface fun setRate(t:String,v:Double)=ok(t){NativePlayer.setRate(v.toFloat());"ok"}
    @JavascriptInterface fun setEq(t:String,json:String)=ok(t){NativePlayer.setEq(json);"ok"}
    @JavascriptInterface fun setRepeat(t:String,mode:String)=ok(t){NativePlayer.setRepeat(mode);"ok"}
    @JavascriptInterface fun setShuffle(t:String,on:String)=ok(t){NativePlayer.setShuffle(on=="1");"ok"}
    @JavascriptInterface fun fadeOut(t:String,seconds:Int)=ok(t){NativePlayer.fadeOut(seconds.coerceIn(1,30));"ok"}
    @JavascriptInterface fun setSleepTimer(t:String,ms:Long)=ok(t){NativePlayer.setSleepTimer(ms);"ok"}
    @JavascriptInterface fun playbackState(t:String):String=if(trusted(t))NativePlayer.stateJson() else "{}"
    @JavascriptInterface fun refreshWidgets(t:String)=ok(t){WidgetUpdater.refresh(activity);"ok"}
    @JavascriptInterface fun vibrate(t:String,ms:Int)=ok(t){val v=activity.getSystemService(Vibrator::class.java);if(v.hasVibrator())v.vibrate(VibrationEffect.createOneShot(ms.coerceIn(1,500).toLong(),VibrationEffect.DEFAULT_AMPLITUDE));"ok"}
    @JavascriptInterface fun openExternal(t:String,url:String)=ok(t){Http.validate(url);activity.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));"ok"}
    @JavascriptInterface fun toast(t:String,message:String)=ok(t){activity.runOnUiThread{Toast.makeText(activity,message.take(500),Toast.LENGTH_LONG).show()};"ok"}
    @JavascriptInterface fun downloadJobs(t:String)=ok(t){DownloadRepository.all()}
    @JavascriptInterface fun alarms(t:String)=ok(t){AlarmScheduler.all(activity)}
    @JavascriptInterface fun requestAsync(t:String,id:String,method:String,argsJson:String):String{
        if(!trusted(t))return JSONObject().put("ok",false).put("error","Native capability denied").toString()
        if(!id.matches(Regex("[a-zA-Z0-9_-]{1,100}")))return JSONObject().put("ok",false).put("error","Invalid request").toString()
        io.execute{try{val args=JSONObject(argsJson);val result=dispatch(method,args);NativeEvents.reply(id,true,result)}catch(e:Exception){NativeEvents.reply(id,false,e.message ?: "تعذّر تنفيذ العملية على الجهاز")}}
        return JSONObject().put("ok",true).toString()
    }
    private fun dispatch(method:String,a:JSONObject):String=when(method){
        "permissions"->{val kinds=a.getJSONArray("kinds");val requested=(0 until kinds.length()).map{kinds.getString(it)};requestPermissions(requested).toString()}
        "scanMedia"->DeviceMusic.scan(activity,a.optString("kind")=="video").toString()
        "pickMedia"->pickDocuments().toString()
        "pickImage"->JSONObject.quote(pickImage())
        "resolveStream"->MediaExtractor.resolve(a.getString("url")).toString()
        "resolveFormats"->MediaExtractor.formats(a.getString("url"),a.optString("title").takeIf{it.isNotBlank()},a.optString("cover").takeIf{it.isNotBlank()&&it!="null"}).toString()
        "searchMedia"->MediaExtractor.search(a.getString("query"),a.optString("source","all")).toString()
        "httpJson"->Http.json(a.getString("url"))
        "enqueueDownload"->DownloadRepository.enqueue(a.getJSONObject("job")).toString()
        "downloadAction"->DownloadRepository.action(a.getString("id"),a.getString("action"))?.toString() ?: "null"
        "transcodeClip"->LocalConversions.clip(activity,a.getString("base64"),a.optString("mime","audio/mpeg"),a.getDouble("startSec"),a.getDouble("endSec")).toString()
        "openLocalClip"->LocalConversions.openClip(activity,a.getString("id"),a.getString("base64"),a.optString("mime","audio/mpeg")).toString()
        "deleteLocalClip"->{LocalConversions.deleteClip(activity,a.getString("id")); "true"}
        "updateQueue"->{NativePlayer.updateQueue(a.getJSONObject("queue").toString()); "true"}
        "scheduleAlarm"->AlarmScheduler.schedule(activity,a.getJSONObject("alarm")).toString()
        "cancelAlarm"->{AlarmScheduler.cancel(activity,a.getString("id"));NativeEvents.emit("alarms",AlarmScheduler.all(activity).toString());"true"}
        "notify"->{require(granted("notifications")){"امنح صلاحية الإشعارات أولًا"};val n=NotificationCompat.Builder(activity,DonMuseApp.CHANNEL_GENERAL).setSmallIcon(R.drawable.ic_notification).setContentTitle(a.getString("title").take(100)).setContentText(a.getString("body").take(500)).setAutoCancel(true).setContentIntent(android.app.PendingIntent.getActivity(activity,0,Intent(activity,MainActivity::class.java),android.app.PendingIntent.FLAG_IMMUTABLE)).build();NotificationManagerCompat.from(activity).notify(4001,n);"true"}
        "pinWidget"->{val mgr=AppWidgetManager.getInstance(activity);require(mgr.isRequestPinAppWidgetSupported){"الشاشة الرئيسية لا تدعم التثبيت المباشر؛ أضف DON MUSE من قائمة الويدجت"};mgr.requestPinAppWidget(ComponentName(activity,NowPlayingWidget::class.java),null,null).toString()}
        "updateMediaMetadata"->updateMetadata(a.getString("uri"),a.getJSONObject("meta")).toString()
        "saveArtwork"->saveArtwork(a.getString("uri"),a.getString("base64")).toString()
        else->throw IllegalArgumentException("عملية غير مدعومة: $method")
    }
    private fun <T> await(timeoutMs:Long=180_000,setup:((T)->Unit)->Unit):T{
        val latch=java.util.concurrent.CountDownLatch(1);var result:T?=null
        setup{value->result=value;latch.countDown()}
        if(!latch.await(timeoutMs,java.util.concurrent.TimeUnit.MILLISECONDS))throw java.io.IOException("انتهت مهلة انتظار اختيار النظام")
        @Suppress("UNCHECKED_CAST") return result ?: throw java.io.IOException("أُلغي الاختيار")
    }
    private fun requestPermissions(kinds:List<String>):JSONObject=await{done->
        val needed=kinds.filter{!granted(it)}.flatMap{kind->
            if(Build.VERSION.SDK_INT<28&&kind in setOf("audio","video","images"))listOfNotNull(permission(kind),Manifest.permission.WRITE_EXTERNAL_STORAGE) else listOfNotNull(permission(kind))
        }.distinct()
        if(needed.isEmpty()){done(JSONObject().put("denied",JSONArray(kinds.filter{!granted(it)})));return@await}
        activity.runOnUiThread{permissionKinds=kinds;permissionReply={r->done(r)};permissionLauncher.launch(needed.toTypedArray())}
    }
    fun onPermissionsResult(){val denied=permissionKinds.filter{!granted(it)};val reply=permissionReply;permissionReply=null;permissionKinds=emptyList();reply?.invoke(JSONObject().put("denied",JSONArray(denied)))}
    private fun pickDocuments():JSONArray=await{done->activity.runOnUiThread{documentReply={done(it)};documentLauncher.launch(arrayOf("audio/*","video/*"))}}
    fun onDocuments(uris:List<Uri>){val result=JSONArray();uris.forEach{uri->runCatching{runCatching{activity.contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION)};DeviceMusic.fromUri(activity,uri)?.let{result.put(it)}}};val reply=documentReply;documentReply=null;reply?.invoke(result)}
    private fun pickImage():String=await{done->activity.runOnUiThread{imageReply={done(it)};imageLauncher.launch(arrayOf("image/*"))}}
    fun onImage(uri:Uri?){val reply=imageReply;imageReply=null;if(uri==null){reply?.invoke("");return};io.execute{val result=runCatching{runCatching{activity.contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION)};LocalConversions.image(activity,uri)}.getOrDefault("");activity.runOnUiThread{reply?.invoke(result)}}}
    fun onWriteResult(ok:Boolean){val reply=writeReply;writeReply=null;reply?.invoke(ok)}
    private fun write(uri:Uri,block:()->Unit){
        try{block()}catch(securityException:SecurityException){
            val sender=if(Build.VERSION.SDK_INT>=30&&securityException is android.app.RecoverableSecurityException)securityException.userAction.actionIntent.intentSender else null
            if(sender==null)throw java.io.IOException("النظام لم يمنح إذن تعديل هذا الملف. اختره من منتقي الملفات وحاول مجددًا.")
            val granted=await<Boolean>{done->activity.runOnUiThread{writeReply={done(it)};writeLauncher.launch(IntentSenderRequest.Builder(sender).build())}}
            if(!granted)throw java.io.IOException("رُفض إذن تعديل الملف")
            block()
        }
    }
    private fun updateMetadata(raw:String,m:JSONObject):JSONObject{
        val uri=Uri.parse(raw);require(uri.scheme=="content"||uri.scheme=="file"){"ملف غير محلي"}
        write(uri){val values=ContentValues();listOf("title" to MediaStore.MediaColumns.TITLE,"artist" to MediaStore.Audio.Media.ARTIST,"album" to MediaStore.Audio.Media.ALBUM,"year" to MediaStore.Audio.Media.YEAR).forEach{(from,to)->if(m.has(from))values.put(to,m.getString(from))};activity.contentResolver.update(uri,values,null,null)}
        return JSONObject().put("ok",true).put("message","حُدّثت بيانات الملف في مكتبة النظام. الوسوم داخل بعض الصيغ قد تحتاج محرر وسوم متخصص.")
    }
    private fun saveArtwork(raw:String,base64:String):JSONObject{
        val uri=Uri.parse(raw);require(uri.scheme=="content"||uri.scheme=="file"){"ملف غير محلي"}
        val dir=File(activity.cacheDir,"artwork").apply{mkdirs()};val input=File(dir,"input-${System.nanoTime()}");val cover=File(dir,"cover-${System.nanoTime()}.jpg");val output=File(dir,"output-${System.nanoTime()}")
        try{
            activity.contentResolver.openInputStream(uri).use{src->requireNotNull(src);input.outputStream().use{src.copyTo(it)}}
            val bytes=Base64.decode(base64.substringAfter(','),Base64.DEFAULT);require(bytes.size in 1..8*1024*1024){"الغلاف فارغ أو أكبر من 8 MB"};cover.writeBytes(bytes)
            val mime=activity.contentResolver.getType(uri) ?: "audio/mpeg"
            LocalConversions.embedArtwork(input,cover,output,mime)
            write(uri){activity.contentResolver.openOutputStream(uri,"wt").use{out->requireNotNull(out);output.inputStream().use{it.copyTo(out)}}}
            return JSONObject().put("ok",true).put("message","تم تضمين الغلاف في الملف الأصلي")
        }finally{input.delete();cover.delete();output.delete()}
    }
}
