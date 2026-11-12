package fm.donmuse.app.alarms

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmActivity:Activity(){
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState);if(android.os.Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true)}else{@Suppress("DEPRECATION")window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)}
        val id=intent.getStringExtra("id") ?: "alarm";val label=AlarmScheduler.get(this,id)?.optString("label") ?: "المنبّه"
        ContextCompat.startForegroundService(this,Intent(this,AlarmService::class.java).setAction(AlarmService.ACTION_RING).putExtra("id",id))
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(48,48,48,48);setBackgroundColor(Color.rgb(5,6,10));layoutDirection=android.view.View.LAYOUT_DIRECTION_RTL}
        fun text(value:String,size:Float,color:Int)=TextView(this).apply{text=value;textSize=size;setTextColor(color);gravity=Gravity.CENTER}
        root.addView(text("DON MUSE",20f,Color.rgb(29,185,84)))
        root.addView(text(SimpleDateFormat("HH:mm",Locale.getDefault()).format(Date()),72f,Color.WHITE))
        root.addView(text(label,26f,Color.WHITE))
        val dismiss=Button(this).apply{text="إيقاف المنبّه";setOnClickListener{sendService(AlarmService.ACTION_DISMISS,id);finish()}}
        val snooze=Button(this).apply{text="غفوة 5 دقائق";setOnClickListener{sendService(AlarmService.ACTION_SNOOZE,id);finish()}}
        root.addView(dismiss,LinearLayout.LayoutParams(-1,-2));root.addView(snooze,LinearLayout.LayoutParams(-1,-2));setContentView(root)
    }
    private fun sendService(action:String,id:String){ContextCompat.startForegroundService(this,Intent(this,AlarmService::class.java).setAction(action).putExtra("id",id))}
}
