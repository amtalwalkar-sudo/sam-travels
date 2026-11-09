package `in`.samtravels.app

import android.app.Service
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.ServiceInfo
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
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
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
 private var recoveryButton:Button?=null
 private var swipeLabel:TextView?=null
 private var swipeBar:SeekBar?=null
 private var cancelButton:Button?=null
 @Volatile private var activeLocationEventId:String?=null
 private var activeLocationListener:LocationListener?=null
 private var activeLocationTimeout:Runnable?=null
 private var gpsWakeLock:PowerManager.WakeLock?=null
 private var databaseObserver:androidx.room.InvalidationTracker.Observer?=null
 @Volatile private var startupRecoveryReady=false
 @Volatile private var startupRecoveryFailed=false
 @Volatile private var pendingIntentRecoveryChecked=false
 private val notificationChannelId="sam_travels_driver_controls"
 private val notificationId=7301
 private fun enterForeground(){
  if(Build.VERSION.SDK_INT>=26){
   val manager=getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
   manager.createNotificationChannel(NotificationChannel(notificationChannelId,"Driver controls",NotificationManager.IMPORTANCE_LOW))
   val notification=Notification.Builder(this,notificationChannelId)
    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
    .setContentTitle("Sam Travels driver controls")
    .setContentText("Floating controls active · GPS only when you start an action")
    .setCategory(Notification.CATEGORY_SERVICE).setOngoing(true).build()
   if(Build.VERSION.SDK_INT>=34)startForeground(notificationId,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)else if(Build.VERSION.SDK_INT>=29)startForeground(notificationId,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)else startForeground(notificationId,notification)
  }else{
   @Suppress("DEPRECATION")
   val notification=Notification.Builder(this).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Sam Travels driver controls").setContentText("GPS only when you start an action").setOngoing(true).build()
   startForeground(notificationId,notification)
  }
 }
 private val db by lazy{Room.databaseBuilder(applicationContext,LocalDatabase::class.java,"sam-travels.db").addMigrations(LocalDatabase.MIGRATION_1_2,LocalDatabase.MIGRATION_2_3).enableMultiInstanceInvalidation().build()}
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  if(!Settings.canDrawOverlays(this)){stopSelf();return START_NOT_STICKY}
  try{enterForeground()}catch(_:Exception){stopSelf();return START_NOT_STICKY}
  executor.execute{
   try{
    NativeStartupRecovery.ensure(db)
    startupRecoveryReady=true
    startupRecoveryFailed=false
    if(databaseObserver==null){
     databaseObserver=object:androidx.room.InvalidationTracker.Observer("records"){override fun onInvalidated(tables:Set<String>){refresh()}}
     db.invalidationTracker.addObserver(databaseObserver!!)
    }
    main.post{showPanel();recoverPendingAfterServiceStart()}
   }catch(error:Exception){
    startupRecoveryReady=false
    startupRecoveryFailed=true
    LocalDiagnostics.record(applicationContext,"recovery","repository_startup","recovery","startup_blocked")
    main.post{showPanel();refresh("Recovery required · actions disabled")}
   }
  }
  return START_STICKY
 }
 /**
  * START_STICKY can recreate this service after process death. Resume only an
  * intent whose original event-time GPS evidence window is still open. Older
  * intents remain durable and visible for review; they are never backdated.
  */
 private fun recoverPendingAfterServiceStart(){
  if(!startupRecoveryReady||pendingIntentRecoveryChecked)return
  pendingIntentRecoveryChecked=true
  executor.execute{
   try{
    NativeStartupRecovery.ensure(db)
    startupRecoveryReady=true
    val intent=DriverWorkflowStore.firstPendingLocation(db)?:return@execute
    val command=intent.optJSONObject("command")?:error("pending_command_missing")
    val id=command.optString("eventId")
    if(!DriverRecoveryPolicy.isWithinGpsWindow(command.getString("transitionAt"))){
     DriverWorkflowStore.markNeedsAttention(db,id,"gps_recovery_window_expired")
     main.post{refresh("Action retained · GPS evidence window expired; review required")}
     return@execute
    }
    val resumed=DriverWorkflowStore.reactivate(db,id)
    main.post{acquireLocation(id,command,resumed)}
   }catch(error:Exception){
    main.post{refresh("Pending action retained · "+(error.message?:"recovery deferred"))}
   }
  }
 }
 private fun showPanel(){
  if(panel!=null)return
  window=getSystemService(WINDOW_SERVICE) as WindowManager
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(18,14,18,14);setBackgroundColor(android.graphics.Color.WHITE)}
  status=TextView(this).apply{text="Sam Travels · Driver";textSize=14f;setTextColor(android.graphics.Color.rgb(24,54,74))}
  root.addView(status)
  val shiftStart=Button(this).apply{text="Start shift";setOnClickListener{runTransition("shift_start")}}
  val shiftEnd=Button(this).apply{text="End shift";setOnClickListener{runTransition("shift_end")}}
  actionButtons["shift_start"]=shiftStart
  actionButtons["shift_end"]=shiftEnd
  root.addView(shiftStart)
  val label=TextView(this).apply{text="Swipe to Going to pickup";textSize=12f;setTextColor(android.graphics.Color.rgb(36,73,94));setPadding(2,10,2,4)}
  swipeLabel=label
  root.addView(label)
  val slider=SeekBar(this).apply{
   max=100
   progress=0
   setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{
    override fun onProgressChanged(bar:SeekBar?,progress:Int,fromUser:Boolean){}
    override fun onStartTrackingTouch(bar:SeekBar?){}
    override fun onStopTrackingTouch(bar:SeekBar?){
     val confirmed=(bar?.progress?:0)>=95
     bar?.progress=0
     if(confirmed)runSwipeTransition()
    }
   })
  }
  swipeBar=slider
  root.addView(slider,LinearLayout.LayoutParams(dp(230),dp(48)))
  val cancel=Button(this).apply{text="Cancel trip";setOnClickListener{runTransition("cancel_ride")}}
  cancelButton=cancel
  root.addView(cancel)
  root.addView(shiftEnd)
  recoveryButton=Button(this).apply{text="Retry pending action";setOnClickListener{runRecovery()};isEnabled=false}
  root.addView(recoveryButton)
  panel=root
  val type=if(Build.VERSION.SDK_INT>=26)WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
  val params=WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.WRAP_CONTENT,type,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT).apply{gravity=Gravity.END or Gravity.CENTER_VERTICAL;x=12;y=0}
  try{window.addView(root,params);refresh()}catch(_:Exception){panel=null;stopSelf()}
 }
 private fun refresh(message:String?=null){executor.execute{try{
  NativeStartupRecovery.ensure(db)
  startupRecoveryReady=true
  startupRecoveryFailed=false
  val s=DriverWorkflowStore.snapshot(db)
  val intents=DriverWorkflowStore.listIntents(db)
  val pending=DriverWorkflowStore.firstRecoverableIntent(db)!=null
  val expiredPending=intents.any{it.optString("reason")=="gps_recovery_window_expired"}
  val state=s.optString("state")
  main.post{
   val baseStatus="Sam Travels · "+state.replace("_"," ")+" · r"+s.optInt("revision")
   status?.text=message?:(if(pending)"Action awaiting GPS · "+state.replace("_"," ") else if(expiredPending)baseStatus+" · previous GPS action expired" else baseStatus)
   val swipeText=when(DriverTransitionPolicy.swipeEvent(state)){
    "trip_create"->"Swipe to Going to pickup"
    "start_ride"->"Swipe to Start trip"
    "end_ride"->"Swipe to End trip"
    else->null
   }
   val canSwipe=!pending&&activeLocationEventId==null&&swipeText!=null&&(state!="shift_active"||s.has("shiftContext"))
   swipeLabel?.text=swipeText?: "Trip action unavailable"
   swipeLabel?.visibility=if(swipeText==null)View.GONE else View.VISIBLE
   swipeBar?.visibility=if(swipeText==null)View.GONE else View.VISIBLE
   swipeBar?.progress=0
   swipeBar?.isEnabled=canSwipe
   cancelButton?.visibility=if(state=="going_to_pickup")View.VISIBLE else View.GONE
   cancelButton?.isEnabled=!pending&&activeLocationEventId==null&&state=="going_to_pickup"
   actionButtons["shift_start"]?.visibility=if(state=="idle")View.VISIBLE else View.GONE
   actionButtons["shift_start"]?.isEnabled=!pending&&state=="idle"
   actionButtons["shift_end"]?.visibility=if(state=="shift_active")View.VISIBLE else View.GONE
   actionButtons["shift_end"]?.isEnabled=!pending&&state=="shift_active"
  }
 }catch(_:Exception){
  startupRecoveryReady=false
  startupRecoveryFailed=true
  LocalDiagnostics.record(applicationContext,"recovery","repository_startup","recovery","startup_blocked")
  main.post{
   status?.text="Recovery required · actions disabled"
   recoveryButton?.isEnabled=false
   actionButtons.values.forEach{it.isEnabled=false}
  }
 }}}
 private fun runRecovery(){
  if(!startupRecoveryReady||activeLocationEventId!=null)return
  executor.execute{try{
   NativeStartupRecovery.ensure(db)
   startupRecoveryReady=true
   val intent=DriverWorkflowStore.firstRecoverableIntent(db)
   if(intent==null){main.post{refresh("No pending action to recover")};return@execute}
   val command=intent.optJSONObject("command")?:error("pending_command_missing");val id=command.optString("eventId")
   if(!DriverRecoveryPolicy.isWithinGpsWindow(command.getString("transitionAt"))){
    DriverWorkflowStore.markNeedsAttention(db,id,"gps_recovery_window_expired")
    main.post{refresh("GPS evidence window expired · reissue the action when ready")}
    return@execute
   }
   val resumed=DriverWorkflowStore.reactivate(db,id);acquireLocation(id,command,resumed)
  }catch(e:Exception){main.post{refresh("Recovery unavailable · "+(e.message?:"retry later"))}}}
 }
 private fun dp(value:Int):Int=(value*resources.displayMetrics.density).toInt()
 private fun runSwipeTransition(){
  if(!startupRecoveryReady)return
  executor.execute{
   try{
    NativeStartupRecovery.ensure(db)
    val state=DriverWorkflowStore.snapshot(db).optString("state")
    val event=DriverTransitionPolicy.swipeEvent(state)
    if(event!=null)main.post{runTransition(event)}else main.post{refresh("No trip action is available in this state")}
   }catch(error:Exception){main.post{refresh("Unable to read current trip state · "+(error.message?:"retry"))}}
  }
 }
 private fun runTransition(event:String){
  if(!startupRecoveryReady){refresh("Recovery required · actions disabled");return}
  status?.text="Saving action · GPS pending"
  main.post{actionButtons.values.forEach{it.isEnabled=false};swipeBar?.isEnabled=false;cancelButton?.isEnabled=false}
  executor.execute{try{
   NativeStartupRecovery.ensure(db)
   startupRecoveryReady=true
   val snapshot=DriverWorkflowStore.snapshot(db)
   val id=UUID.randomUUID().toString();val transitionAt=java.time.Instant.now().toString()
   val command=JSONObject().put("schemaVersion",1).put("commandId",id).put("eventId",id).put("eventType",event)
    .put("originSurface","native_overlay").put("transitionAt",transitionAt).put("expectedPriorState",snapshot.optString("state"))
    .put("expectedRevision",snapshot.optInt("revision")).put("idempotencyKey",id).put("workflowVersion",2)
   val intent=DriverWorkflowStore.queue(db,command);acquireLocation(id,command,intent)
  }catch(e:Exception){main.post{refresh("Action not queued · "+(e.message?:"storage error"))}}}
 }
 private fun acquireLocation(id:String,command:JSONObject,intent:JSONObject){
  try{
   if(activeLocationEventId!=null){if(activeLocationEventId==id)return;markAttention(id,intent,"another_location_request_active");return}
   if(checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED&&checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED){markAttention(id,intent,"permission_denied");return}
   val transitionAt=command.optString("transitionAt")
   val remainingMs=DriverRecoveryPolicy.remainingGpsWindowMillis(transitionAt)
   if(remainingMs<=0L){markAttention(id,intent,"gps_recovery_window_expired");return}
   val manager=getSystemService(Context.LOCATION_SERVICE) as LocationManager
   val provider=if(manager.isProviderEnabled(LocationManager.GPS_PROVIDER))LocationManager.GPS_PROVIDER else manager.getBestProvider(Criteria().apply{accuracy=Criteria.ACCURACY_FINE},true)
   if(provider==null){markAttention(id,intent,"location_unavailable");return}
   activeLocationEventId=id
   val powerManager=getSystemService(Context.POWER_SERVICE) as PowerManager
   gpsWakeLock=powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"SamTravels:DriverGps").apply{setReferenceCounted(false);acquire(remainingMs.coerceAtMost(30_000L))}
   var finished=false
   lateinit var listener:LocationListener
   lateinit var timeout:Runnable
   fun finish(location:Location?=null,reason:String="location_timeout"){
    if(finished)return
    finished=true
    main.removeCallbacks(timeout)
    try{manager.removeUpdates(listener)}catch(_:Exception){}
    activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null
    releaseGpsWakeLock()
    if(location!=null)complete(id,command,intent,location)else markAttention(id,intent,reason)
   }
   timeout=Runnable{finish(reason="location_timeout")}
   listener=LocationListener{location:Location->
    if(!finished){
     val gps=JSONObject().put("latitude",location.latitude).put("longitude",location.longitude)
      .put("horizontalAccuracyM",location.accuracy.toDouble())
      .put("fixAt",java.time.Instant.ofEpochMilli(location.time).toString()).put("provider",location.provider?:"android")
     val valid=DriverTransitionPolicy.isAcceptableGpsEvidence(gps,transitionAt)
     if(valid)finish(location=location)
    }
   }
   activeLocationListener=listener;activeLocationTimeout=timeout
   manager.requestLocationUpdates(provider,0L,0f,listener,Looper.getMainLooper())
   main.postDelayed(timeout,remainingMs)
  }catch(e:Exception){activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null;releaseGpsWakeLock();markAttention(id,intent,"location_unavailable")}
 }
 private fun releaseGpsWakeLock(){val lock=gpsWakeLock;gpsWakeLock=null;if(lock?.isHeld==true)try{lock.release()}catch(_:Exception){}}
 private fun markAttention(id:String,intent:JSONObject,reason:String){
  val transitionAt=intent.optJSONObject("command")?.optString("transitionAt").orEmpty()
  val effectiveReason=if(!DriverRecoveryPolicy.isWithinGpsWindow(transitionAt))"gps_recovery_window_expired" else reason
  executor.execute{
   try{
    NativeStartupRecovery.ensure(db)
    startupRecoveryReady=true
    startupRecoveryFailed=false
    DriverWorkflowStore.markNeedsAttention(db,id,effectiveReason)
   }catch(_:Exception){
    startupRecoveryReady=false
    startupRecoveryFailed=true
   }
   main.post{refresh("Action retained · "+effectiveReason)}
  }
 }
 private fun complete(id:String,command:JSONObject,intent:JSONObject,location:Location){
  executor.execute{
   try{
    val gps=JSONObject().put("latitude",location.latitude).put("longitude",location.longitude)
     .put("horizontalAccuracyM",location.accuracy.toDouble()).put("fixAt",java.time.Instant.ofEpochMilli(location.time).toString())
     .put("provider",location.provider?:"android")
    NativeStartupRecovery.ensure(db)
    DriverWorkflowStore.complete(db,id,gps)
    main.post{refresh("Recorded · "+command.optString("eventType").replace("_"," "))}
   }catch(e:Exception){markAttention(id,intent,e.message?:"commit_failed")}
  }
 }
 override fun onDestroy(){activeLocationTimeout?.let{main.removeCallbacks(it)};releaseGpsWakeLock();activeLocationListener?.let{try{(getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(it)}catch(_:Exception){}};activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null;databaseObserver?.let{db.invalidationTracker.removeObserver(it)};databaseObserver=null;panel?.let{try{window.removeView(it)}catch(_:Exception){}};panel=null;executor.shutdown();if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE)else stopForeground(true);super.onDestroy()}
}
