package fm.donmuse.app.download

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.ContextCompat
import fm.donmuse.app.bridge.AppStorage
import fm.donmuse.app.bridge.NativeEvents
import fm.donmuse.app.data.Http
import fm.donmuse.app.data.LocalConversions
import fm.donmuse.app.data.MediaExtractor
import okhttp3.Call
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Bounded worker pool, streaming network IO, FFmpeg, then public MediaStore. */
object DownloadRepository {
    private const val KEY="donmuse.native.downloads.v1"
    private lateinit var app:Context
    private lateinit var storage:AppStorage
    private val pool=Executors.newFixedThreadPool(2)
    private val jobs=LinkedHashMap<String,JSONObject>()
    private val calls=ConcurrentHashMap<String,Call>()
    private val cancelled=ConcurrentHashMap.newKeySet<String>()
    private val paused=ConcurrentHashMap.newKeySet<String>()
    private val active=ConcurrentHashMap.newKeySet<String>()
    private var initialized=false
    @Synchronized fun initialize(ctx:Context){
        if(initialized)return;app=ctx.applicationContext;storage=AppStorage(app)
        val resume= mutableListOf<String>()
        runCatching{val a=JSONArray(storage.get(KEY) ?: "[]");for(i in 0 until a.length()){val j=a.getJSONObject(i);if(j.getString("status")=="working"){j.put("status","queued");resume+=j.getString("id")};jobs[j.getString("id")]=j}}
        initialized=true;resume.forEach(::submit)
    }
    @Synchronized private fun persist(){val a=JSONArray();jobs.values.forEach{a.put(JSONObject(it.toString()))};storage.set(KEY,a.toString());NativeEvents.emit("downloads",a.toString())}
    @Synchronized private fun patch(id:String,fn:(JSONObject)->Unit){val j=jobs[id] ?: return;fn(j);persist()}
    @Synchronized fun all():JSONArray{val a=JSONArray();jobs.values.sortedByDescending{it.optLong("addedAt")}.forEach{a.put(JSONObject(it.toString()))};return a}
    @Synchronized fun get(id:String):JSONObject?=jobs[id]?.let{JSONObject(it.toString())}
    @Synchronized fun enqueue(input:JSONObject):JSONObject{
        initialize(app)
        val id=input.optString("id").ifBlank{"dl-${System.currentTimeMillis()}-${System.nanoTime()}"};require(id.matches(Regex("[a-zA-Z0-9_-]{1,160}"))){"معرّف تنزيل غير صالح"}
        val old=jobs[id];if(old!=null&&old.getString("status") in setOf("working","done","queued"))return JSONObject(old.toString())
        val source=input.optString("sourceUrl").ifBlank{input.optString("url")};require(source.isNotBlank()){"رابط التنزيل مفقود"}
        val name=input.optString("filename","DON-MUSE-${System.currentTimeMillis()}").replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1f]"),"_").take(180)
        var url=input.optString("url").ifBlank{source};var mime=input.optString("mime","audio/mpeg");val format=input.optString("formatId","original")
        if(url.startsWith("data:")){
            // Never persist or broadcast an 80 MB base64 URL on every progress tick.
            val comma=url.indexOf(',');require(comma>0&&url.length<112*1024*1024){"ملف محلي غير صالح أو أكبر من 80 MB"}
            val bytes=Base64.decode(url.substring(comma+1),Base64.DEFAULT);require(bytes.size in 1..80*1024*1024){"الملف المحلي فارغ أو كبير جدًا"}
            val dir=File(app.cacheDir,"downloads").apply{mkdirs()};val local=File(dir,"$id.local");local.writeBytes(bytes);url=Uri.fromFile(local).toString();mime=urlMime(input.optString("mime"),name)
        }
        val j=JSONObject(input.toString()).put("id",id).put("sourceUrl",source).put("url",url).put("filename",name).put("title",input.optString("title",name)).put("artist",input.optString("artist","")).put("cover",input.optString("cover").takeIf{it.isNotBlank()&&it!="null"} ?: JSONObject.NULL).put("mime",mime).put("formatId",format).put("preset",if(format=="local-clip")"original" else input.optString("preset","original")).put("kind",input.optString("kind","full")).put("status","queued").put("progress",0).put("received",0).put("total",0).put("error",JSONObject.NULL).put("addedAt",System.currentTimeMillis())
        jobs[id]=j;cancelled.remove(id);paused.remove(id);persist();submit(id);return JSONObject(j.toString())
    }
    private fun urlMime(mime:String,name:String)=mime.takeIf{it.contains('/')&&!it.contains('*')} ?: when(name.substringAfterLast('.').lowercase()){"aac"->"audio/aac";"mp4"->"video/mp4";"m4a"->"audio/mp4";"flac"->"audio/flac";"wav"->"audio/wav";else->"audio/mpeg"}
    private fun submit(id:String){if(!active.add(id))return;pool.execute{try{process(id)}catch(e:Exception){patch(id){it.put("status",if(paused.contains(id))"paused" else if(cancelled.contains(id))"cancelled" else "error").put("error",if(paused.contains(id)||cancelled.contains(id))JSONObject.NULL else e.message ?: "فشل التنزيل")}}finally{active.remove(id);calls.remove(id);paused.remove(id);DownloadService.refresh(app)}}}
    fun action(id:String,action:String):JSONObject?{
        when(action){
            "cancel"->{cancelled.add(id);calls[id]?.cancel();synchronized(this){jobs.remove(id);persist()}}
            "pause"->{paused.add(id);calls[id]?.cancel();patch(id){it.put("status","paused")}}
            "resume","retry"->{val j=get(id) ?: return null;if(j.getString("status")=="working")return j;enqueue(j)}
        }
        return get(id)
    }
    @Synchronized fun hasActive():Boolean=jobs.values.any{it.getString("status")=="working"}
    private fun headers(j:JSONObject):Map<String,String>{val h=j.optJSONObject("headers") ?: return emptyMap();return h.keys().asSequence().associateWith{h.getString(it)}}
    private fun checkInterrupt(id:String){if(cancelled.contains(id)||paused.contains(id))throw InterruptedException("توقف التنزيل")}
    private fun copy(id:String,input:InputStream,out:OutputStream,total:Long){val buffer=ByteArray(128*1024);var received=0L;var last=0L;while(true){checkInterrupt(id);val n=input.read(buffer);if(n<0)break;out.write(buffer,0,n);received+=n;if(System.currentTimeMillis()-last>300){last=System.currentTimeMillis();patch(id){it.put("received",received).put("total",total).put("progress",if(total>0)(received*100/total).toInt().coerceAtMost(99) else 0)};DownloadService.refresh(app)}}}
    private fun process(id:String){
        if(cancelled.contains(id)||paused.contains(id))return
        patch(id){it.put("status","working").put("error",JSONObject.NULL)};DownloadService.ensure(app)
        val j=get(id) ?: return;val dir=File(app.cacheDir,"downloads").apply{mkdirs()};val raw=File(dir,"$id.source");val converted=File(dir,"$id.output");val local=File(dir,"$id.local")
        try{
            var url=j.optString("url").ifBlank{j.getString("sourceUrl")};val format=j.getString("formatId");var mime=j.getString("mime")
            if(local.isFile){checkInterrupt(id);local.inputStream().use{input->raw.outputStream().use{copy(id,input,it,local.length())}}}
            else{
                if(format!="local-clip"){val resolved=MediaExtractor.downloadUrl(j.getString("sourceUrl"),format);url=resolved.first;mime=resolved.second}
                val call=Http.client.newBuilder().readTimeout(120,TimeUnit.SECONDS).build().newCall(Http.request(url,headers(j)).build());calls[id]=call
                call.execute().use{r->if(!r.isSuccessful)throw IOException("المصدر رفض التنزيل (HTTP ${r.code})");val body=r.body ?: throw IOException("ملف فارغ");val finalMime=r.header("Content-Type")?.substringBefore(';') ?: mime;if(finalMime.contains("text/html"))throw IOException("الرابط صفحة وليس ملف وسائط");mime=finalMime;raw.outputStream().use{copy(id,body.byteStream(),it,body.contentLength().coerceAtLeast(0))}}
            }
            checkInterrupt(id);if(raw.length()==0L)throw IOException("المصدر أرسل ملفًا فارغًا")
            val preset=j.getString("preset");val start=j.optDouble("startSec",0.0);val end=j.optDouble("endSec",0.0)
            val needsFfmpeg=format!="local-clip"&&(preset!="original"||start>0||end>start)
            val output=if(needsFfmpeg){patch(id){it.put("progress",99)};LocalConversions.command(raw.absolutePath,converted.absolutePath,MediaExtractor.ffmpegPreset(preset),start,end)}else raw
            val finalMime=if(needsFfmpeg)MediaExtractor.preset(preset)?.mime ?: mime else mime
            val filename=if(needsFfmpeg)j.getString("filename").substringBeforeLast('.')+"."+(MediaExtractor.preset(preset)?.ext ?: "mp3")else j.getString("filename")
            val uri=publish(output,filename,finalMime,j.optString("title"),j.optString("artist"))
            patch(id){it.put("status","done").put("progress",100).put("received",output.length()).put("total",output.length()).put("size",output.length()).put("uri",uri.toString()).put("filename",filename).put("mime",finalMime).put("url",uri.toString())}
        }finally{raw.delete();converted.delete();local.delete()}
    }
    private fun publish(file:File,name:String,mime:String,title:String,artist:String):Uri{
        val video=mime.startsWith("video/")
        if(Build.VERSION.SDK_INT>=29){
            val collection=if(video)MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val values=ContentValues().apply{put(MediaStore.MediaColumns.DISPLAY_NAME,name);put(MediaStore.MediaColumns.MIME_TYPE,mime);put(MediaStore.MediaColumns.RELATIVE_PATH,(if(video)Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC)+"/DON MUSE");put(MediaStore.MediaColumns.IS_PENDING,1);put(MediaStore.MediaColumns.TITLE,title);if(!video)put(MediaStore.Audio.Media.ARTIST,artist)}
            val uri=app.contentResolver.insert(collection,values) ?: throw IOException("لم يسمح النظام بإنشاء الملف")
            try{app.contentResolver.openOutputStream(uri,"w").use{out->requireNotNull(out);file.inputStream().use{it.copyTo(out)}};values.clear();values.put(MediaStore.MediaColumns.IS_PENDING,0);app.contentResolver.update(uri,values,null,null);return uri}catch(e:Exception){app.contentResolver.delete(uri,null,null);throw e}
        }
        if(ContextCompat.checkSelfPermission(app,Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED)throw IOException("امنح إذن الملفات من إعدادات موسيقاي لإتمام الحفظ على Android 8/9")
        @Suppress("DEPRECATION") val dir=File(Environment.getExternalStoragePublicDirectory(if(video)Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC),"DON MUSE").apply{mkdirs()}
        val target=File(dir,name);file.copyTo(target,true);MediaScannerConnection.scanFile(app,arrayOf(target.absolutePath),arrayOf(mime),null);return Uri.fromFile(target)
    }
}
