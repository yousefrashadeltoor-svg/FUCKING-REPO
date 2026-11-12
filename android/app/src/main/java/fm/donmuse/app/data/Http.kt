package fm.donmuse.app.data

import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException
import java.net.InetAddress
import java.net.URI
import java.util.concurrent.TimeUnit

object Http {
    const val UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
    private fun publicAddresses(host:String):List<InetAddress>{
        val addresses=Dns.SYSTEM.lookup(host)
        require(addresses.isNotEmpty()){"تعذّر العثور على عنوان المصدر"}
        for(address in addresses){
            val b=address.address.map{it.toInt() and 255}
            val privateV4=b.size==4&&((b[0]==100&&b[1] in 64..127)||(b[0]==192&&b[1]==0&&b[2]==0)||(b[0]==198&&b[1] in 18..19)||b[0]>=240)
            val uniqueV6=b.size==16&&(b[0] and 0xfe)==0xfc
            require(!address.isAnyLocalAddress&&!address.isLoopbackAddress&&!address.isLinkLocalAddress&&!address.isSiteLocalAddress&&!address.isMulticastAddress&&!privateV4&&!uniqueV6){"لا يُسمح بالاتصال بعناوين الجهاز الداخلية"}
        }
        return addresses
    }
    // Validate the actual connection DNS result as well as the input URL, so a
    // second DNS answer cannot redirect OkHttp to a private address (rebinding).
    val client:OkHttpClient=OkHttpClient.Builder().connectTimeout(20,TimeUnit.SECONDS).readTimeout(60,TimeUnit.SECONDS)
        .followRedirects(true).followSslRedirects(true).retryOnConnectionFailure(true)
        .dns(Dns{publicAddresses(it)}).build()
    fun validate(url:String):String{
        val u=URI(url);require(u.scheme=="https"||u.scheme=="http"){"الرابط يجب أن يكون HTTP أو HTTPS"}
        require(!u.host.isNullOrBlank()&&u.userInfo==null){"رابط غير صالح"}
        publicAddresses(u.host.removeSuffix(".").lowercase());return url
    }
    fun request(url:String,headers:Map<String,String> = emptyMap()):Request.Builder{
        validate(url)
        return Request.Builder().url(url).header("User-Agent",UA).apply{headers.forEach{(k,v)->if(k.lowercase() !in setOf("cookie","authorization","proxy-authorization","host","content-length"))header(k,v)}}
    }
    fun json(url:String):String{
        client.newCall(request(url).build()).execute().use{r->
            if(!r.isSuccessful)throw IOException("المصدر رفض الطلب (HTTP ${r.code})")
            val body=r.body ?: throw IOException("رد فارغ من المصدر");val limit=8L*1024*1024
            if(body.contentLength()>limit)throw IOException("رد المصدر أكبر من الحد المسموح")
            val source=body.source();source.request(limit+1)
            if(source.buffer.size>limit)throw IOException("رد المصدر أكبر من الحد المسموح")
            return source.readString(Charsets.UTF_8)
        }
    }
}
