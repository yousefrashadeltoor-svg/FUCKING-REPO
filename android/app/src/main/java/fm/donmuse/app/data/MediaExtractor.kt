package fm.donmuse.app.data

import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.VideoStream
import java.io.IOException

/** Real source formats. No yt-dlp server, invented itags, or DRM circumvention. */
object MediaExtractor {
    @Volatile private var initialized=false
    @Synchronized fun init() {
        if(initialized)return
        NewPipe.init(object:Downloader(){
            override fun execute(request:Request):Response {
                val builder=Http.request(request.url()).header("Accept-Language",request.localization?.localizationCode ?: "ar,en")
                request.headers().forEach { (k,values)->if(values.isNotEmpty()&&k.lowercase() !in setOf("cookie","authorization","host","content-length")) builder.header(k,values.joinToString(";")) }
                val data=request.dataToSend()
                builder.method(request.httpMethod(),data?.toRequestBody())
                Http.client.newCall(builder.build()).execute().use { r->
                    if(r.code==429)throw ReCaptchaException("المصدر يطلب تحققًا أو يفرض حدًا للطلبات",request.url())
                    val body=r.body?.string() ?: ""
                    return Response(r.code,r.message,r.headers.toMultimap(),body,r.request.url.toString())
                }
            }
        },Localization("ar","EG"))
        initialized=true
    }
    private fun service(source:String)=when(source.lowercase()){
        "youtube"->ServiceList.YouTube
        "soundcloud"->ServiceList.SoundCloud
        "bandcamp"->ServiceList.Bandcamp
        "media.ccc.de","mediacc"->ServiceList.MediaCCC
        "peertube"->ServiceList.PeerTube
        else->NewPipe.getServiceByUrl(source)
    }
    fun sourceName(url:String):String=runCatching { NewPipe.getServiceByUrl(url).serviceInfo.name.lowercase() }.getOrDefault("direct")
    fun supported(url:String):Boolean=runCatching { NewPipe.getServiceByUrl(url);true }.getOrDefault(false)
    private fun hash(value:String):Int { var h=2166136261L; for(c in value)h=((h xor c.code.toLong())*16777619L) and 0xffffffffL;return (h and 0x7fffffffL).toInt().coerceAtLeast(1) }
    private fun track(item:StreamInfoItem,serviceName:String):JSONObject=JSONObject().apply {
        val source=serviceName.lowercase();put("id",hash("$source:${item.url}"));put("title",item.name);put("artistName",item.uploaderName ?: source)
        put("artistId",hash("artist:${item.uploaderName ?: source}"));put("source",source);put("sourceId",item.url);put("streamUrl",item.url)
        put("coverUrl",item.thumbnails.maxByOrNull { it.width*it.height }?.url ?: JSONObject.NULL);put("durationSec",item.duration.coerceAtLeast(0))
        put("codec",if(source=="youtube")"native" else "audio");put("mimeType",JSONObject.NULL)
    }
    fun search(query:String,source:String):JSONArray {
        init();require(query.isNotBlank()){"اكتب كلمة بحث"};require(query.length<=300){"البحث طويل جدًا"}
        val svc=if(source=="all")ServiceList.YouTube else service(source)
        val info=SearchInfo.getInfo(svc,query)
        return JSONArray().apply { info.relatedItems.filterIsInstance<StreamInfoItem>().take(40).forEach { put(track(it,svc.serviceInfo.name)) } }
    }
    fun info(url:String):StreamInfo { init();Http.validate(url);return StreamInfo.getInfo(url) }
    private fun streamJson(s:Stream,kind:String,info:StreamInfo):JSONObject {
        val format=s.format ?: throw IOException("صيغة غير معروفة")
        val bitrate=when(s){is AudioStream->s.averageBitrate.takeIf { it>0 } ?: s.bitrate;is VideoStream->s.bitrate;else->0}.coerceAtLeast(0)
        val resolution=if(s is VideoStream)s.resolution else ""
        return JSONObject().apply {
            put("id","native:${info.serviceId}:${kind}:${s.id}");put("kind",kind);put("label","${format.name} · ${resolution.ifBlank { if(bitrate>0)"$bitrate kbps" else "المصدر الأصلي" }}")
            put("ext",format.suffix);put("mime",format.mimeType);put("quality",resolution.ifBlank { format.name });put("bitrateKbps",bitrate)
            put("sizeBytes",if(bitrate>0&&info.duration>0)bitrate*1000*info.duration/8 else 0);put("estimated",true);put("lossless",false);put("cover",false)
            put("codec",format.name);put("url",s.url)
        }
    }
    private data class Preset(val id:String,val label:String,val ext:String,val mime:String,val codec:String,val bitrate:Int,val lossless:Boolean)
    private val presets=listOf(
        Preset("flac","FLAC · بدون فقدان","flac","audio/flac","flac",0,true),
        Preset("alac","ALAC · Apple Lossless","m4a","audio/mp4","alac",0,true),
        Preset("wav","WAV · PCM 16-bit","wav","audio/wav","pcm_s16le",1411,true),
        Preset("mp3-320","MP3 · 320 kbps","mp3","audio/mpeg","libmp3lame",320,false),
        Preset("mp3-256","MP3 · 256 kbps","mp3","audio/mpeg","libmp3lame",256,false),
        Preset("mp3-192","MP3 · 192 kbps","mp3","audio/mpeg","libmp3lame",192,false),
        Preset("mp3-128","MP3 · 128 kbps","mp3","audio/mpeg","libmp3lame",128,false),
        Preset("m4a-256","M4A · AAC 256 kbps","m4a","audio/mp4","aac",256,false),
        Preset("m4a-128","M4A · AAC 128 kbps","m4a","audio/mp4","aac",128,false),
        Preset("opus-160","Opus · 160 kbps","opus","audio/ogg","libopus",160,false),
        Preset("ogg-192","OGG · Vorbis 192 kbps","ogg","audio/ogg","libvorbis",192,false),
    )
    fun preset(id:String)=presets.find{it.id==id}
    fun ffmpegPreset(id:String):List<String> {
        val p=preset(id) ?: return listOf("-c","copy")
        return buildList { addAll(listOf("-vn","-c:a",p.codec));if(!p.lossless)addAll(listOf("-b:a","${p.bitrate}k"));if(p.codec=="libmp3lame")addAll(listOf("-id3v2_version","3"));if(p.ext=="m4a")addAll(listOf("-movflags","+faststart")) }
    }
    fun formats(url:String,title:String?,cover:String?):JSONObject {
        val audio=JSONArray();val video=JSONArray();var name=title ?: url;var duration=0L;var artwork=cover;var extractor="direct"
        if(supported(url)) {
            val info=info(url);name=info.name;duration=info.duration;artwork=info.thumbnails.maxByOrNull{it.width*it.height}?.url ?: cover;extractor=NewPipe.getService(info.serviceId).serviceInfo.name
            info.audioStreams.filter{it.url.isNotBlank()}.sortedByDescending{it.averageBitrate}.forEach{audio.put(streamJson(it,"audio",info))}
            info.videoStreams.filter{it.url.isNotBlank()}.sortedByDescending{it.height}.forEach{video.put(streamJson(it,"video",info))}
        } else {
            Http.validate(url)
            val path=java.net.URI(url).path.lowercase();val ext=path.substringAfterLast('.',"mp3")
            val mime=when(ext){"mp4","m4v"->"video/mp4";"webm"->"video/webm";"m4a"->"audio/mp4";"aac"->"audio/aac";"ogg","opus"->"audio/ogg";"flac"->"audio/flac";"wav"->"audio/wav";else->"audio/mpeg"}
            val original=JSONObject().put("id","original").put("kind",if(mime.startsWith("video"))"video" else "audio").put("label","الملف الأصلي").put("ext",ext).put("mime",mime).put("quality","original").put("bitrateKbps",0).put("sizeBytes",0).put("estimated",true).put("lossless",ext=="flac"||ext=="wav").put("cover",false).put("codec",ext).put("url",url)
            if(mime.startsWith("video"))video.put(original) else audio.put(original)
        }
        val directFile=!supported(url)&&java.net.URI(url).path.substringAfterLast('.', "").lowercase() in setOf("mp3","m4a","mp4","aac","ogg","opus","flac","wav","webm","m4v")
        if(duration<=0&&directFile) {
            val retriever=android.media.MediaMetadataRetriever()
            try { retriever.setDataSource(url,emptyMap<String,String>();duration=(retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L)/1000 } finally { retriever.release() }
        }
        // Transcoding is offered only when there is actual decodable source audio.
        if(audio.length()>0 || video.length()>0) presets.forEach { p->
            audio.put(JSONObject().put("id",p.id).put("kind","audio").put("label",p.label).put("ext",p.ext).put("mime",p.mime).put("quality",p.label).put("bitrateKbps",p.bitrate).put("sizeBytes",if(duration>0&&p.bitrate>0)p.bitrate*1000*duration/8 else 0).put("estimated",true).put("lossless",p.lossless).put("cover",false).put("codec",p.codec))
        }
        return JSONObject().put("source",sourceName(url)).put("sourceUrl",url).put("title",name).put("durationSec",duration).put("coverUrl",artwork ?: JSONObject.NULL).put("extractor",extractor).put("note","الصيغ الأصلية كما يعلنها المصدر. التحويل محلي بجودة لا تخترع تفاصيل غير موجودة في الأصل. DRM وتسجيل الدخول غير مدعومين.").put("audio",audio).put("video",video)
    }
    fun resolve(url:String):JSONObject {
        if(!supported(url))return JSONObject().put("url",url).put("direct",true).put("mime",JSONObject.NULL).put("embed",JSONObject.NULL)
        val i=info(url)
        val audio=i.audioStreams.filter{it.url.isNotBlank()}.maxByOrNull{it.averageBitrate}
        val video=i.videoStreams.filter{it.url.isNotBlank()}.maxByOrNull{it.height}
        val s=audio ?: video
        val urlToPlay=s?.url ?: i.hlsUrl.takeIf{it.isNotBlank()} ?: throw IOException("المصدر لا يتيح تيارًا قابلًا للتشغيل؛ قد يكون محميًا أو يحتاج تسجيل دخول")
        val mime=s?.format?.mimeType ?: "application/x-mpegURL"
        return JSONObject().put("url",urlToPlay).put("direct",true).put("mime",mime).put("embed",JSONObject.NULL).put("expiry",System.currentTimeMillis()+300_000)
    }
    private fun mimeForUrl(url:String):String=when(java.net.URI(url).path.substringAfterLast('.', "").lowercase()){"mp4","m4v"->"video/mp4";"webm"->"video/webm";"m4a"->"audio/mp4";"aac"->"audio/aac";"ogg","opus"->"audio/ogg";"flac"->"audio/flac";"wav"->"audio/wav";else->"audio/mpeg"}
    fun downloadUrl(url:String,formatId:String):Pair<String,String> {
        if(formatId=="original"&&!supported(url))return url to mimeForUrl(url)
        require(formatId=="original"||formatId.startsWith("native:")||preset(formatId)!=null){"صيغة غير معروفة"}
        val i=info(url)
        if(i.audioStreams.isEmpty()&&i.videoStreams.isEmpty()&&i.hlsUrl.isNotBlank())throw IOException("هذا بث مباشر؛ تنزيله كملف مكتمل غير مدعوم")
        if(formatId=="original") {
            val s=i.audioStreams.maxByOrNull{it.averageBitrate} ?: i.videoStreams.maxByOrNull{it.height} ?: throw IOException("لا يوجد ملف أصلي متاح")
            return s.url to (s.format?.mimeType ?: "application/octet-stream")
        }
        if(formatId.startsWith("native:")) {
            val all:List<Stream>=i.audioStreams+i.videoStreams+i.videoOnlyStreams
            val s=all.find{"native:${i.serviceId}:audio:${it.id}"==formatId || "native:${i.serviceId}:video:${it.id}"==formatId} ?: throw IOException("انتهت صلاحية الصيغة؛ افحص الرابط مجددًا")
            return s.url to (s.format?.mimeType ?: "application/octet-stream")
        }
        val s=i.audioStreams.maxByOrNull{it.averageBitrate} ?: i.videoStreams.maxByOrNull{it.height} ?: throw IOException("لا يوجد صوت قابل للتحويل")
        return s.url to (s.format?.mimeType ?: "audio/mp4")
    }
}
