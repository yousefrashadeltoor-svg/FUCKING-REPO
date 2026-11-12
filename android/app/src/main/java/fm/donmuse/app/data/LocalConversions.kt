package fm.donmuse.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.ReturnCode
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException

object LocalConversions {
    fun image(ctx:Context,uri:Uri):String {
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
        ctx.contentResolver.openInputStream(uri).use{BitmapFactory.decodeStream(it,null,bounds)}
        var sample=1;while(maxOf(bounds.outWidth,bounds.outHeight)/sample>1800)sample*=2
        val bitmap=ctx.contentResolver.openInputStream(uri).use{BitmapFactory.decodeStream(it,null,BitmapFactory.Options().apply{inSampleSize=sample})} ?: throw IOException("الصورة غير قابلة للقراءة")
        val out=ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,87,out);bitmap.recycle()
        return "data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP)
    }
    fun command(input:String,output:String,extra:List<String>,start:Double=0.0,end:Double=0.0):File {
        require(start>=0 && (end<=0 || end>start)){"نطاق القص غير صحيح"}
        val args=buildList{addAll(listOf("-hide_banner","-loglevel","error","-y"));if(start>0)addAll(listOf("-ss",start.toString()));addAll(listOf("-i",input));if(end>start)addAll(listOf("-t",(end-start).toString()));addAll(extra);add(output)}
        val session=FFmpegKit.executeWithArguments(args.toTypedArray())
        if(!ReturnCode.isSuccess(session.returnCode))throw IOException("فشل التحويل المحلي: ${session.failStackTrace ?: session.output?.takeLast(600) ?: "صيغة غير مدعومة"}")
        val file=File(output);if(!file.isFile||file.length()==0L)throw IOException("لم يُنتج FFmpeg ملفًا صالحًا")
        return file
    }
    private fun execute(args:List<String>) {
        val session=FFmpegKit.executeWithArguments(args.toTypedArray())
        if(!ReturnCode.isSuccess(session.returnCode))throw IOException("فشل التحويل المحلي: ${session.failStackTrace ?: session.output?.takeLast(600) ?: "صيغة غير مدعومة"}")
    }
    fun embedArtwork(input:File,cover:File,output:File,mime:String) {
        val mp3=mime.contains("mpeg")||mime.contains("mp3");val mp4=mime.contains("mp4")||mime.contains("m4a")
        require(mp3||mp4){"تضمين الأغلفة مدعوم لملفات MP3 وM4A فقط؛ لم يُعدّل الملف"}
        val args=buildList{addAll(listOf("-hide_banner","-loglevel","error","-y","-i",input.absolutePath,"-i",cover.absolutePath,"-map","0","-map","1:v","-c","copy","-disposition:v:0","attached_pic"));if(mp3)addAll(listOf("-id3v2_version","3","-write_id3v1","1","-f","mp3"))else addAll(listOf("-f","ipod","-movflags","+faststart"));add(output.absolutePath)}
        execute(args);require(output.length()>0){"لم يُنتج FFmpeg غلافًا صالحًا"}
    }
    private fun clipDir(ctx:Context)=File(ctx.filesDir,"clips").apply{mkdirs()}
    private fun clipFile(ctx:Context,id:String):File {require(id.matches(Regex("[a-zA-Z0-9_-]{1,100}"))){"معرّف المقطع غير صالح"};return File(clipDir(ctx),"$id.audio")}
    fun openClip(ctx:Context,id:String,base64:String,mime:String):JSONObject {
        val file=clipFile(ctx,id)
        if(!file.isFile){val bytes=Base64.decode(base64,Base64.DEFAULT);require(bytes.size in 1..80*1024*1024){"المقطع فارغ أو أكبر من 80 MB"};val tmp=File(file.parentFile,"${file.name}.tmp");tmp.writeBytes(bytes);check(tmp.renameTo(file)){"تعذّر حفظ المقطع محليًا"}}
        return JSONObject().put("uri",Uri.fromFile(file).toString()).put("mime",mime)
    }
    fun deleteClip(ctx:Context,id:String){clipFile(ctx,id).delete()}
    fun clip(ctx:Context,base64:String,mime:String,start:Double,end:Double):JSONObject {
        val bytes=Base64.decode(base64,Base64.DEFAULT);require(bytes.size in 1..80*1024*1024){"التسجيل فارغ أو أكبر من 80 MB"}
        val dir=File(ctx.cacheDir,"clips").apply{mkdirs()};val ext=if(mime.contains("aac"))"aac" else "mp3"
        val input=File(dir,"input-${System.nanoTime()}.$ext");val output=File(dir,"output-${System.nanoTime()}.mp3")
        try {input.writeBytes(bytes);command(input.absolutePath,output.absolutePath,listOf("-vn","-c:a","libmp3lame","-b:a","256k","-id3v2_version","3"),start,end);return JSONObject().put("mime","audio/mpeg").put("base64",Base64.encodeToString(output.readBytes(),Base64.NO_WRAP))} finally {input.delete();output.delete()}
    }
}
