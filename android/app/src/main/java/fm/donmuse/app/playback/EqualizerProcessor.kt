package fm.donmuse.app.playback

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

import androidx.media3.common.util.UnstableApi

/** Ten cascaded peaking biquads, matching the UI's Hz bands and ±12 dB range. */
@androidx.annotation.OptIn(UnstableApi::class)
class EqualizerProcessor : AudioProcessor {
    private companion object { val frequencies=doubleArrayOf(60.0,170.0,310.0,600.0,1000.0,3000.0,6000.0,12000.0,14000.0,16000.0) }
    private class Settings(val gains:DoubleArray,val sampleRate:Int) {
        val coefficients=Array(10){i->
            if(gains[i]==0.0||frequencies[i]>=sampleRate/2.0)doubleArrayOf(1.0,0.0,0.0,0.0,0.0)else{
                val w=2*Math.PI*frequencies[i]/sampleRate;val a=10.0.pow(gains[i]/40.0);val q=if(frequencies[i]<200)0.8 else 1.2;val alpha=sin(w)/(2*q)
                val a0=1+alpha/a
                doubleArrayOf((1+alpha*a)/a0,-2*cos(w)/a0,(1-alpha*a)/a0,-2*cos(w)/a0,(1-alpha/a)/a0)
            }
        }
        val flat=gains.all{it==0.0}
    }
    @Volatile private var settings=Settings(DoubleArray(10),48000)
    @Volatile private var desiredGains=DoubleArray(10)
    private var format=AudioFormat.NOT_SET
    private var output:ByteBuffer=AudioProcessor.EMPTY_BUFFER
    private var ended=false;private var channels=2
    private var activeSettings=settings
    private var states=Array(10){DoubleArray(8)}
    override fun configure(inputAudioFormat:AudioFormat):AudioFormat {
        if(inputAudioFormat.encoding!=C.ENCODING_PCM_16BIT&&inputAudioFormat.encoding!=C.ENCODING_PCM_FLOAT){format=AudioFormat.NOT_SET;return AudioFormat.NOT_SET}
        format=inputAudioFormat;channels=inputAudioFormat.channelCount;settings=Settings(desiredGains,inputAudioFormat.sampleRate);return inputAudioFormat
    }
    fun setBands(values:DoubleArray){desiredGains=DoubleArray(10){values.getOrElse(it){0.0}.coerceIn(-12.0,12.0)};if(format!=AudioFormat.NOT_SET)settings=Settings(desiredGains,format.sampleRate)}
    override fun isActive()=format!=AudioFormat.NOT_SET
    override fun queueInput(inputBuffer:ByteBuffer){
        val current=settings;if(current!==activeSettings){activeSettings=current;states=Array(10){DoubleArray(channels*4)}}
        val size=inputBuffer.remaining();if(output.capacity()<size)output=ByteBuffer.allocateDirect(size).order(ByteOrder.nativeOrder());output.clear()
        val float=format.encoding==C.ENCODING_PCM_FLOAT
        while(inputBuffer.hasRemaining()){
            for(ch in 0 until channels){
                var x=if(float)inputBuffer.float.toDouble() else inputBuffer.short.toDouble()/32768.0
                if(!current.flat)for(i in 0 until 10){
                    if(current.gains[i]==0.0||frequencies[i]>=current.sampleRate/2.0)continue
                    val c=current.coefficients[i];val s=states[i];val k=ch*4;val y=c[0]*x+c[1]*s[k]+c[2]*s[k+1]-c[3]*s[k+2]-c[4]*s[k+3]
                    s[k+1]=s[k];s[k]=x;s[k+3]=s[k+2];s[k+2]=y;x=y
                }
                x=x.coerceIn(-1.0,1.0);if(float)output.putFloat(x.toFloat())else output.putShort((x*32767).toInt().toShort())
            }
        }
        output.flip()
    }
    override fun queueEndOfStream(){ended=true}
    override fun getOutput():ByteBuffer{val b=output;output=AudioProcessor.EMPTY_BUFFER;return b}
    override fun isEnded()=ended&&output===AudioProcessor.EMPTY_BUFFER
    override fun flush(){states=Array(10){DoubleArray(channels*4)};output=AudioProcessor.EMPTY_BUFFER;ended=false}
    override fun reset(){format=AudioFormat.NOT_SET;flush()}
}
