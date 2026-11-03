package `in`.samtravels.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.location.Criteria
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.room.Room
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.abs

class DriverOverlayService:Service(){
 private val executor=Executors.newSingleThreadExecutor()
 private val main=Handler(Looper.getMainLooper())
 private lateinit var window:WindowManager
 private var panel:LinearLayout?=null
 private var status:TextView?=null
 private val actionButtons=mutableMapOf<String,Button>()
 private var databaseObserver:androidx.room.InvalidationTracker.Observer?=null
 private val db by lazy{Room.databaseBuilder(applicationContext,LocalDatabase::class.java,"sam-travels.db").build()}
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{if(!Settings.canDrawOverlays(this)){stopSelf();return START_NOT_STICKY};if(databaseObserver==null){databaseObserver=object:androidx.room.InvalidationTracker.Observer("records"){override fun onInvalidated(tables:Set<String>){refresh()}};db.invalidationTracker.addObserver(databaseObserver!!)};main.post{showPanel()};return START_STICKY}
 private fun showPanel(){
  if(panel!=null)return
  window=getSystemService(WINDOW_SERVICE) as WindowManager
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(18,14,18,14);setBackgroundColor(android.graphics.Color.WHITE)}
  status=TextView(this).apply{text="Sam Travels · Driver";textSize=14f;setTextColor(android.graphics.Color.rgb(24,54,74))}
  root.addView(status)
  val shiftStart=Button(this).apply{text="Start shift";setOnClickListener{runTransition("shift_start")}}
  val tripStart=Button(this).apply{text="Start trip";setOnClickListener{runTransition("trip_start")}}
  val tripEnd=Button(this).apply{text="End trip";setOnClickListener{runTransition("trip_end")}}
  val cancel=Button(this).apply{text="Cancel trip";setOnClickListener{runTransition("ride_cancel")}}
  val shiftEnd=Button(this).apply{text="End shift";setOnClickListener{runTransition("shift_end")}}
  actionButtons["shift_start"]=shiftStart;actionButtons["trip_start"]=tripStart;actionButtons["trip_end"]=tripEnd;actionButtons["ride_cancel"]=cancel;actionButtons["shift_end"]=shiftEnd
  listOf(shiftStart,tripStart,tripEnd,cancel,shiftEnd).forEach{root.addView(it)}
  panel=root
  val type=if(Build.VERSION.SDK_INT>=26)WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
  val params=WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.WRAP_CONTENT,type,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT).apply{gravity=Gravity.END or Gravity.CENTER_VERTICAL;x=12;y=0}
  try{window.addView(root,params);refresh()}catch(_:Exception){panel=null;stopSelf()}
 }
 private fun refresh(message:String?=null){executor.execute{try{
  val s=db.records().get("driver-state")?.let{JSONObject(it.json).optJSONObject("value")}?:JSONObject().put("state","idle").put("revision",0)
  val pending=db.records().list().any{row->if(!row.id.startsWith("driver-intent:"))false else runCatching{val item=JSONObject(row.json);item.optString("status")=="pending_location"||item.optString("status")=="needs_attention"}.getOrDefault(false)}
  val state=s.optString("state")
  main.post{
   status?.text=message?:("Sam Travels · "+state.replace("_"," ")+" · r"+s.optInt("revision"))
   actionButtons["shift_start"]?.isEnabled=!pending&&state=="idle"
   actionButtons["trip_start"]?.isEnabled=!pending&&state=="shift_active"
   actionButtons["trip_end"]?.isEnabled=!pending&&(state=="trip_active"||state=="approach_active")
   actionButtons["ride_cancel"]?.isEnabled=!pending&&(state=="trip_active"||state=="approach_active")
   actionButtons["shift_end"]?.isEnabled=!pending&&state=="shift_active"
  }
 }catch(_:Exception){main.post{status?.text="Driver state unavailable"}}}}
 private fun runTransition(event:String){
  status?.text="Saving action · GPS pending"
  main.post{actionButtons.values.forEach{it.isEnabled=false}}
  executor.execute{try{
   val snapshot=db.records().get("driver-state")?.let{JSONObject(it.json).optJSONObject("value")}?:JSONObject().put("schemaVersion",1).put("state","idle").put("revision",0)
   val id=UUID.randomUUID().toString();val transitionAt=java.time.Instant.now().toString()
   val command=JSONObject().put("schemaVersion",1).put("commandId",id).put("eventId",id).put("eventType",event)
    .put("originSurface","native_overlay").put("transitionAt",transitionAt).put("expectedPriorState",snapshot.optString("state"))
    .put("expectedRevision",snapshot.optInt("revision")).put("idempotencyKey",id)
   val intent=DriverWorkflowStore.queue(db,command);acquireLocation(id,command,intent)
  }catch(e:Exception){main.post{refresh("Action not queued · "+(e.message?:"storage error"))}}}
 }
 private fun acquireLocation(id:String,command:JSONObject,intent:JSONObject){
  try{
   if(checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED&&checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED){markAttention(id,intent,"permission_denied");return}
   val manager=getSystemService(Context.LOCATION_SERVICE) as LocationManager
   val provider=manager.getBestProvider(Criteria().apply{accuracy=Criteria.ACCURACY_FINE},true)
   if(provider==null){markAttention(id,intent,"location_unavailable");return}
   var finished=false;lateinit var listener:LocationListener
   val timeout=Runnable{if(!finished){finished=true;try{manager.removeUpdates(listener)}catch(_:Exception){};markAttention(id,intent,"location_timeout")}}
   listener=LocationListener{location:Location->if(!finished){finished=true;main.removeCallbacks(timeout);complete(id,command,intent,location)}}
   manager.requestSingleUpdate(provider,listener,Looper.getMainLooper());main.postDelayed(timeout,35_000L)
  }catch(e:Exception){markAttention(id,intent,"location_unavailable")}
 }
 private fun markAttention(id:String,intent:JSONObject,reason:String){
  try{DriverWorkflowStore.markNeedsAttention(db,id,reason)}catch(_:Exception){}
  main.post{refresh("Action retained · "+reason)}
 }
 private fun complete(id:String,command:JSONObject,intent:JSONObject,location:Location){
  try{
   val gps=JSONObject().put("latitude",location.latitude).put("longitude",location.longitude)
    .put("horizontalAccuracyM",location.accuracy.toDouble()).put("fixAt",java.time.Instant.ofEpochMilli(location.time).toString())
    .put("provider",location.provider?:"android")
   DriverWorkflowStore.complete(db,id,gps)
   main.post{refresh("Recorded · "+command.optString("eventType").replace("_"," "))}
  }catch(e:Exception){markAttention(id,intent,e.message?:"commit_failed")}
 }
 override fun onDestroy(){databaseObserver?.let{db.invalidationTracker.removeObserver(it)};databaseObserver=null;panel?.let{try{window.removeView(it)}catch(_:Exception){}};panel=null;executor.shutdown();super.onDestroy()}
}
