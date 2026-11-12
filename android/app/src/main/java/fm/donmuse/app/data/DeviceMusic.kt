package fm.donmuse.app.data

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

object DeviceMusic {
    fun scan(ctx:Context,video:Boolean=false,limit:Int=10000):JSONArray {
        val collection=if(video)MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val columns= arrayOf(MediaStore.MediaColumns._ID,MediaStore.MediaColumns.TITLE,MediaStore.MediaColumns.DISPLAY_NAME,MediaStore.MediaColumns.MIME_TYPE,MediaStore.MediaColumns.SIZE,MediaStore.MediaColumns.DATE_ADDED,MediaStore.MediaColumns.DURATION,MediaStore.Audio.Media.ARTIST,MediaStore.Audio.Media.ALBUM,MediaStore.Audio.Media.ARTIST_ID,MediaStore.Audio.Media.ALBUM_ID,MediaStore.Audio.Media.TRACK,MediaStore.Audio.Media.YEAR)
        val out=JSONArray()
        ctx.contentResolver.query(collection,columns,null,null,"${MediaStore.MediaColumns.TITLE} COLLATE NOCASE ASC")?.use { c->
            fun text(col:String)=c.getColumnIndex(col).takeIf{it>=0}?.let{c.getString(it)}
            fun long(col:String)=c.getColumnIndex(col).takeIf{it>=0}?.let{c.getLong(it)} ?: 0L
            while(c.moveToNext()&&out.length()<limit) {
                val id=c.getLong(c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));val uri=ContentUris.withAppendedId(collection,id)
                val albumId=long(MediaStore.Audio.Media.ALBUM_ID)
                out.put(JSONObject().put("id","media:$id").put("uri",uri.toString()).put("title",text(MediaStore.MediaColumns.TITLE) ?: text(MediaStore.MediaColumns.DISPLAY_NAME) ?: "ملف")
                    .put("artist",text(MediaStore.Audio.Media.ARTIST) ?: "فنان غير معروف").put("artistId",text(MediaStore.Audio.Media.ARTIST_ID)).put("album",text(MediaStore.Audio.Media.ALBUM) ?: "")
                    .put("albumId",if(albumId>0)albumId.toString() else JSONObject.NULL).put("albumArtUri",if(!video&&albumId>0)"content://media/external/audio/albumart/$albumId" else JSONObject.NULL)
                    .put("durationMs",long(MediaStore.MediaColumns.DURATION)).put("mimeType",text(MediaStore.MediaColumns.MIME_TYPE) ?: if(video)"video/*" else "audio/*")
                    .put("sizeBytes",long(MediaStore.MediaColumns.SIZE)).put("dateAdded",long(MediaStore.MediaColumns.DATE_ADDED)*1000).put("trackNumber",long(MediaStore.Audio.Media.TRACK)).put("year",long(MediaStore.Audio.Media.YEAR)).put("isVideo",video))
            }
        }
        return out
    }
    fun fromUri(ctx:Context,uri:Uri):JSONObject? {
        // Persistable SAF grant is taken by MainActivity before this call.
        val doc=DocumentFile.fromSingleUri(ctx,uri)
        var title=doc?.name ?: uri.lastPathSegment ?: "ملف"
        var size=doc?.length() ?: 0L;var mime=ctx.contentResolver.getType(uri) ?: "audio/*"
        var duration=0L;var artist="فنان غير معروف";var album="";var year=0;var track=0
        runCatching { ctx.contentResolver.query(uri,arrayOf(MediaStore.MediaColumns.DISPLAY_NAME,MediaStore.MediaColumns.SIZE,MediaStore.MediaColumns.MIME_TYPE,MediaStore.MediaColumns.DURATION,MediaStore.Audio.Media.ARTIST,MediaStore.Audio.Media.ALBUM,MediaStore.Audio.Media.YEAR,MediaStore.Audio.Media.TRACK),null,null,null)?.use { c->
            if(c.moveToNext()) { fun text(k:String)=c.getColumnIndex(k).takeIf{it>=0}?.let{c.getString(it)};fun long(k:String)=c.getColumnIndex(k).takeIf{it>=0}?.let{c.getLong(it)} ?: 0L
                title=text(MediaStore.MediaColumns.DISPLAY_NAME) ?: title;size=long(MediaStore.MediaColumns.SIZE);mime=text(MediaStore.MediaColumns.MIME_TYPE) ?: mime;duration=long(MediaStore.MediaColumns.DURATION);artist=text(MediaStore.Audio.Media.ARTIST) ?: artist;album=text(MediaStore.Audio.Media.ALBUM) ?: "";year=long(MediaStore.Audio.Media.YEAR).toInt();track=long(MediaStore.Audio.Media.TRACK).toInt()
            }
        } }
        if(duration==0L) { val r=android.media.MediaMetadataRetriever();try { r.setDataSource(ctx,uri);duration=r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L;if(artist=="فنان غير معروف")artist=r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST) ?: artist;album=r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM) ?: album } catch(_:Exception){} finally {r.release()} }
        if(!mime.startsWith("audio/")&&!mime.startsWith("video/"))return null
        return JSONObject().put("id","saf:${uri.toString().hashCode()}").put("uri",uri.toString()).put("title",title).put("artist",artist).put("artistId",JSONObject.NULL).put("album",album).put("albumId",JSONObject.NULL).put("albumArtUri",JSONObject.NULL).put("durationMs",duration).put("mimeType",mime).put("sizeBytes",size).put("dateAdded",System.currentTimeMillis()).put("trackNumber",track).put("year",year).put("isVideo",mime.startsWith("video/"))
    }
}
