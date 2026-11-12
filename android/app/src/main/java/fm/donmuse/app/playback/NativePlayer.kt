package fm.donmuse.app.playback

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import fm.donmuse.app.bridge.AppStorage
import fm.donmuse.app.bridge.NativeEvents
import fm.donmuse.app.widget.WidgetUpdater
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

import androidx.media3.common.util.UnstableApi

/** ExoPlayer is authoritative; every player call and read uses the main looper. */
@androidx.annotation.OptIn(UnstableApi::class)
object NativePlayer {
    private val main=Handler(Looper.getMainLooper())
    private var player:ExoPlayer?=null
    private var context:Context?=null
    private var pending:String?=null
    private var error:String?=null
    private var volume=1f;private var rate=1f;private var repeat=Player.REPEAT_MODE_OFF;private var shuffle=false
    private var sleepRunnable:Runnable?=null
    private val fadeRunnables=mutableListOf<Runnable>()
    private val tracks=ConcurrentHashMap<String,JSONObject>()
    @Volatile private var snapshot=JSONObject()
    @Volatile private var lastPersist=0L
    private val ticker=object:Runnable{override fun run(){emit();main.postDelayed(this,500)}}
    val equalizer=EqualizerProcessor()

    fun attach(exo:ExoPlayer,ctx:Context){main.post{
        player=exo;context=ctx.applicationContext
        exo.volume=volume;exo.setPlaybackSpeed(rate);exo.repeatMode=repeat;exo.shuffleModeEnabled=shuffle
        exo.addListener(object:Player.Listener{
            override fun onEvents(player:Player,events:Player.Events){emit();if(System.currentTimeMillis()-lastPersist>5000)persist()}
            override fun onPlayerError(e:PlaybackException){error="تعذّر تشغيل المصدر: ${e.errorCodeName}";emit()}
            override fun onMediaItemTransition(item:MediaItem?,reason:Int){error=null;emit();persist()}
        })
        val queue=pending;pending=null;if(queue!=null)applyQueue(queue,false)
        main.removeCallbacks(ticker);main.post(ticker)
    }}
    fun detach(){main.post{main.removeCallbacks(ticker);cancelSleep();player=null;snapshot=JSONObject(snapshot.toString()).put("playing",false).put("buffering",false);NativeEvents.emit("playback",snapshot.toString())}}
    private fun onPlayer(fn:(ExoPlayer)->Unit){main.post{val p=player;if(p!=null)fn(p)else context?.let{start(it)}}}
    fun start(ctx:Context){context=ctx.applicationContext;ContextCompat.startForegroundService(ctx,Intent(ctx,PlaybackService::class.java).setAction(PlaybackService.ACTION_PREPARE))}
    fun setQueue(ctx:Context,json:String){context=ctx.applicationContext;main.post{val p=player;if(p==null){pending=json;start(ctx)}else applyQueue(json,false)}}
    fun updateQueue(ctx:Context,json:String){context=ctx.applicationContext;main.post{val p=player;if(p==null){pending=json;start(ctx)}else applyQueue(json,true)}}
    private fun applyQueue(json:String,preservePosition:Boolean){
        val p=player
        if(p==null){pending=json;return}
        try{
            val root=JSONObject(json);val items=root.optJSONArray("items") ?: JSONArray();require(items.length()>0){"قائمة التشغيل فارغة"}
            val media=ArrayList<MediaItem>();tracks.clear()
            root.optJSONArray("tracks")?.let{for(i in 0 until it.length()){val t=it.optJSONObject(i)?:continue;tracks[t.optInt("id").toString()]=t}}
            for(i in 0 until items.length()){
                val o=items.getJSONObject(i);val id=o.getString("id");o.optJSONObject("track")?.let{tracks[id]=it}
                val art=o.optString("artUri").takeIf{it.isNotBlank()&&it!="null"}
                val meta=MediaMetadata.Builder().setTitle(o.optString("title","DON MUSE")).setArtist(o.optString("artist")).setAlbumTitle(o.optString("album")).setArtworkUri(art?.let(Uri::parse)).build()
                media+=MediaItem.Builder().setMediaId(id).setUri(o.getString("uri")).setMimeType(o.optString("mime").takeIf{it.isNotBlank()&&it!="null"}).setMediaMetadata(meta).build()
            }
            val oldId=p.currentMediaItem?.mediaId;val oldPosition=p.currentPosition
            val requested=root.optInt("index",0).coerceIn(0,media.size-1)
            val index=if(preservePosition)media.indexOfFirst{it.mediaId==oldId}.takeIf{it>=0} ?: requested else requested
            val position=if(preservePosition&&media[index].mediaId==oldId)oldPosition else root.optLong("startAtMs",0)
            error=null;cancelSleep();p.volume=volume;p.setPlaybackSpeed(rate);p.repeatMode=repeat;p.shuffleModeEnabled=shuffle
            p.setMediaItems(media,index,position);p.prepare();if(!preservePosition)p.playWhenReady=root.optBoolean("autoplay",true)
            context?.let{AppStorage(it).set("donmuse.lastQueue",root.toString())};persist();emit()
        }catch(e:Exception){error=e.message ?: "قائمة غير صالحة";emit()}
    }
    fun play(){onPlayer{it.play()}}
    fun pause(){onPlayer{it.pause()}}
    fun toggle(){onPlayer{if(it.isPlaying||it.playWhenReady)it.pause()else it.play()}}
    fun next(){onPlayer{if(it.hasNextMediaItem())it.seekToNextMediaItem()else if(it.repeatMode==Player.REPEAT_MODE_ALL&&it.mediaItemCount>0)it.seekTo(0,0)}}
    fun previous(){onPlayer{if(it.currentPosition>3000||!it.hasPreviousMediaItem())it.seekTo(0)else it.seekToPreviousMediaItem()}}
    fun seek(ms:Long){onPlayer{it.seekTo(ms.coerceAtLeast(0))}}
    fun stop(){main.post{cancelSleep();player?.run{stop();clearMediaItems()};error=null;emit();persist()}}
    fun setVolume(v:Float){volume=v.coerceIn(0f,1f);onPlayer{it.volume=volume}}
    fun setRate(v:Float){rate=v.coerceIn(.25f,3f);onPlayer{it.setPlaybackSpeed(rate)}}
    fun setRepeat(mode:String){repeat=when(mode){"one"->Player.REPEAT_MODE_ONE;"all"->Player.REPEAT_MODE_ALL;else->Player.REPEAT_MODE_OFF};onPlayer{it.repeatMode=repeat}}
    fun setShuffle(on:Boolean){shuffle=on;onPlayer{it.shuffleModeEnabled=on}}
    fun setEq(json:String){val a=JSONArray(json);equalizer.setBands(DoubleArray(10){a.optDouble(it,0.0)})}
    private fun cancelSleep(){sleepRunnable?.let(main::removeCallbacks);fadeRunnables.forEach(main::removeCallbacks);fadeRunnables.clear();sleepRunnable=null;player?.volume=volume}
    fun setSleepTimer(ms:Long){main.post{cancelSleep();if(ms<=0)return@post;val r=Runnable{fadeOut(8)};sleepRunnable=r;main.postDelayed(r,ms.coerceAtLeast(1))}}
    fun fadeOut(seconds:Int){main.post{
        cancelSleep()
        val p=player ?: return@post
        val start=p.volume
        for(i in 1..20){
            val step=Runnable{player?.volume=start*(1-i/20f)}
            fadeRunnables.add(step);main.postDelayed(step,i*seconds*50L)
        }
        val end=Runnable{player?.pause();player?.volume=volume;emit()}
        fadeRunnables.add(end);main.postDelayed(end,seconds*1000L+80)
    }}
    // These accessors read a main-thread snapshot, never ExoPlayer from the JS thread.
    fun isPlaying()=snapshot.optBoolean("playing")
    fun positionMs()=snapshot.optLong("positionMs")
    fun durationMs()=snapshot.optLong("durationMs")
    fun queueLength()=snapshot.optInt("queueLength")
    fun currentTitle()=snapshot.optString("title","DON MUSE")
    fun currentArtist()=snapshot.optString("artist","اضغط لفتح المشغّل")
    fun currentArtUri()=snapshot.optString("artUri").takeIf{it.isNotBlank()&&it!="null"}
    fun stateJson():String=snapshot.toString()
    private fun emit(){
        val p=player;val id=p?.currentMediaItem?.mediaId
        snapshot=JSONObject().apply{
            put("playing",p?.isPlaying==true);put("buffering",p?.playbackState==Player.STATE_BUFFERING);put("positionMs",p?.currentPosition ?: 0L);put("durationMs",p?.duration?.takeIf{it>0} ?: 0L)
            put("itemId",id ?: JSONObject.NULL);put("index",p?.currentMediaItemIndex ?: -1);put("queueLength",p?.mediaItemCount ?: 0);put("ended",p?.playbackState==Player.STATE_ENDED);put("error",error ?: JSONObject.NULL);put("track",id?.let{tracks[it]} ?: JSONObject.NULL);put("audioSessionId",p?.audioSessionId ?: 0)
            put("title",p?.currentMediaItem?.mediaMetadata?.title?.toString() ?: "DON MUSE");put("artist",p?.currentMediaItem?.mediaMetadata?.artist?.toString() ?: "اضغط لفتح المشغّل");put("artUri",p?.currentMediaItem?.mediaMetadata?.artworkUri?.toString() ?: JSONObject.NULL)
        }
        NativeEvents.emit("playback",snapshot.toString());context?.let{WidgetUpdater.refresh(it)}
    }
    private fun persist(){lastPersist=System.currentTimeMillis();val ctx=context ?: return;val p=player ?: return;runCatching{AppStorage(ctx).set("donmuse.native.queue",JSONObject().put("positionMs",p.currentPosition).put("index",p.currentMediaItemIndex).put("title",currentTitle()).put("artist",currentArtist()).toString())}}
    /** An explicit widget play can restore a queue after process death. */
    fun restoreAndPlay(ctx:Context){val stored=AppStorage(ctx).get("donmuse.lastQueue") ?: return;setQueue(ctx,JSONObject(stored).put("autoplay",true).toString())}
    fun saveRestoreQueue(json:String){context?.let{AppStorage(it).set("donmuse.lastQueue",json)}}
}
