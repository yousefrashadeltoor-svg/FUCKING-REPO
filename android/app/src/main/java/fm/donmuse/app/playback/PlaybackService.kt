package fm.donmuse.app.playback

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.DefaultMediaNotificationProvider
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import fm.donmuse.app.DonMuseApp
import fm.donmuse.app.MainActivity
import fm.donmuse.app.R
import fm.donmuse.app.data.Http
import fm.donmuse.app.data.MediaExtractor
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

import androidx.media3.common.util.UnstableApi

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private var session:MediaSession?=null
    private val resolved=ConcurrentHashMap<String,String>()
    override fun onCreate(){
        super.onCreate()
        val httpFactory=OkHttpDataSource.Factory(Http.client).setUserAgent(Http.UA)
        val upstream=DefaultDataSource.Factory(this,httpFactory)
        val resolver=ResolvingDataSource.Factory(upstream){spec->
            val raw=spec.uri.toString()
            if(!raw.startsWith("donmuse-resolve:"))spec else {
                val source=raw.removePrefix("donmuse-resolve:")
                val url=resolved[source] ?: try{MediaExtractor.resolve(source).getString("url").also{resolved[source]=it}}catch(e:Exception){throw IOException("تعذّر حل رابط التشغيل: ${e.message}",e)}
                spec.buildUpon().setUri(Uri.parse(url)).build()
            }
        }
        val renderers=object:DefaultRenderersFactory(this){
            override fun buildAudioSink(context:android.content.Context,enableFloatOutput:Boolean,enableAudioTrackPlaybackParams:Boolean):AudioSink=
                DefaultAudioSink.Builder(context).setAudioProcessors(arrayOf(NativePlayer.equalizer)).setEnableFloatOutput(false).setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams).build()
        }.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
        val exo=ExoPlayer.Builder(this,renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(resolver))
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
            .setHandleAudioBecomingNoisy(true).setWakeMode(C.WAKE_MODE_NETWORK)
            .setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(15_000,90_000,1_000,3_000).build())
            .setSeekBackIncrementMs(10_000).setSeekForwardIncrementMs(10_000).build()
        val stop=SessionCommand("fm.donmuse.STOP",Bundle.EMPTY)
        val pending=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val s=MediaSession.Builder(this,exo).setSessionActivity(pending).setCallback(object:MediaSession.Callback{
            override fun onConnect(s:MediaSession,controller:MediaSession.ControllerInfo):MediaSession.ConnectionResult=
                MediaSession.ConnectionResult.AcceptedResultBuilder(s).setAvailableSessionCommands(MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(stop).build()).setCustomLayout(listOf(CommandButton.Builder(CommandButton.ICON_STOP).setDisplayName("إيقاف").setSessionCommand(stop).build())).build()
            override fun onCustomCommand(s:MediaSession,c:MediaSession.ControllerInfo,custom:SessionCommand,args:Bundle):ListenableFuture<SessionResult>{if(custom.customAction==stop.customAction)NativePlayer.stop();return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))}
        }).build()
        session=s
        setMediaNotificationProvider(DefaultMediaNotificationProvider.Builder(this).setChannelId(DonMuseApp.CHANNEL_PLAYBACK).setChannelName(R.string.channel_playback).setNotificationId(1001).build().apply{setSmallIcon(R.drawable.ic_notification)})
        NativePlayer.attach(exo,this)
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        super.onStartCommand(intent,flags,startId)
        when(intent?.action){ACTION_TOGGLE->NativePlayer.toggle();ACTION_NEXT->NativePlayer.next();ACTION_PREV->NativePlayer.previous();ACTION_STOP->NativePlayer.stop();ACTION_RESTORE_PLAY->NativePlayer.restoreAndPlay(this)}
        return START_NOT_STICKY
    }
    override fun onGetSession(controllerInfo:MediaSession.ControllerInfo):MediaSession?=session
    override fun onTaskRemoved(rootIntent:Intent?){val p=session?.player;if(p==null||!p.playWhenReady||p.mediaItemCount==0)stopSelf();super.onTaskRemoved(rootIntent)}
    override fun onDestroy(){NativePlayer.detach();session?.run{player.release();release()};session=null;super.onDestroy()}
    companion object{const val ACTION_PREPARE="fm.donmuse.PREPARE";const val ACTION_TOGGLE="fm.donmuse.TOGGLE";const val ACTION_NEXT="fm.donmuse.NEXT";const val ACTION_PREV="fm.donmuse.PREV";const val ACTION_STOP="fm.donmuse.STOP";const val ACTION_RESTORE_PLAY="fm.donmuse.RESTORE_PLAY"}
}
