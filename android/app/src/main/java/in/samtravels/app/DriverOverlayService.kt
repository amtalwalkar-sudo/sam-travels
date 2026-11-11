package `in`.samtravels.app

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.location.*
import android.os.*
import android.provider.Settings
import androidx.room.Room
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
class DriverOverlayService:Service(){
 private val executor=Executors.newSingleThreadExecutor()
 private val swipePresentation by lazy{DriverSwipePresentationContract.fromAssets(this)}
 private val presentation by lazy {
  DriverOverlayPresentation(
   this,db,executor,main,swipePresentation,{elapsedInterval()},
   {message->refresh(message)},
   {runSwipeTransition()},
   {event->runTransition(event)},
   {runRecovery()},
   {stopSelf()},
  )
 }
 private val main=Handler(Looper.getMainLooper())
 @Volatile private var intervalStartedAt:String?=null
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
  try{enterForeground()}catch(error:Exception){android.util.Log.e("DriverOverlayService","Foreground startup failed",error);stopSelf();return START_NOT_STICKY}
  executor.execute{
   try{
    NativeStartupRecovery.ensure(db)
    startupRecoveryReady=true
    startupRecoveryFailed=false
    if(databaseObserver==null){
     databaseObserver=object:androidx.room.InvalidationTracker.Observer("records"){override fun onInvalidated(tables:Set<String>){refresh()}}
     db.invalidationTracker.addObserver(databaseObserver!!)
    }
    val active=DriverWorkflowStore.snapshot(db).optString("state")!="idle"
    main.post{if(active){presentation.showPanel();recoverPendingAfterServiceStart()}else stopSelf()}
   }catch(error:Exception){
    android.util.Log.e("DriverOverlayService","Repository startup failed",error)
    startupRecoveryReady=false
    startupRecoveryFailed=true
    LocalDiagnostics.record(applicationContext,"recovery","repository_startup","recovery","startup_blocked")
    main.post{presentation.showPanel();refresh("Recovery required · actions disabled")}
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
 private fun refresh(message:String?=null){executor.execute{try{
  NativeStartupRecovery.ensure(db)
  startupRecoveryReady=true
  startupRecoveryFailed=false
  val s=DriverWorkflowStore.snapshot(db)
  val intents=DriverWorkflowStore.listIntents(db)
  val pending=DriverWorkflowStore.firstRecoverableIntent(db)!=null
  val expiredPending=intents.any{it.optString("reason")=="gps_recovery_window_expired"}
  val feeData=DriverCancellationFeeStore.pendingObligation(db)?.optJSONObject("data")
  val feeTripId=feeData?.optString("tripId")?.takeIf{!it.isNullOrBlank()}
  val feeDraft=feeTripId?.let{DriverCancellationFeeStore.ensureCancellationFeeDraft(db,it)}
  val feePaise=feeDraft?.optJSONObject("values")?.let{values->
   if(values.has("cancellationFeePaise"))values.optLong("cancellationFeePaise",-1L).takeIf{it>=0L} else null
  }
  val completedFinancialForms=DriverTripFinancialStore.pendingObligations(db).mapNotNull{obligation->
   val tripId=obligation.optJSONObject("data")?.optString("tripId")?.takeIf{it.isNotBlank()}?:return@mapNotNull null
   JSONObject().put("obligation",obligation).put("draft",DriverTripFinancialStore.ensureDraft(db,tripId))
  }
  val financialPending=feeTripId!=null
  val state=s.optString("state")
  intervalStartedAt=if(state=="idle")null else runCatching{
   DriverWorkflowStore.listEvents(db).firstOrNull{it.optString("eventId")==s.optString("lastEventId")}
    ?.optJSONObject("command")?.optString("transitionAt")?.takeIf{it.isNotBlank()}
  }.getOrNull()
  main.post{
   if(state=="idle"){main.post{presentation.removePanel();stopSelf()};return@post}
   val canSwipe=!pending&&!financialPending&&activeLocationEventId==null&&
    swipePresentation.action(state)!=null&&(state!="shift_active"||s.has("shiftContext"))
   presentation.updateTimer(elapsedInterval())
   presentation.render(
    state,s.optInt("revision"),pending,expiredPending,financialPending,canSwipe,
    feeTripId,feePaise,financialPending&&feePaise!=null&&!pending&&activeLocationEventId==null,
    completedFinancialForms,message,
   )
  }
 }catch(_:Exception){
  startupRecoveryReady=false
  startupRecoveryFailed=true
  LocalDiagnostics.record(applicationContext,"recovery","repository_startup","recovery","startup_blocked")
  main.post{
   presentation.setRecoveryBlocked()
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
 private fun runSwipeTransition(){
  if(!startupRecoveryReady)return
  executor.execute{
   try{
    NativeStartupRecovery.ensure(db)
    val state=DriverWorkflowStore.snapshot(db).optString("state")
    val event=swipePresentation.action(state)?.eventType
    if(event!=null)main.post{runTransition(event)}else main.post{refresh("No trip action is available in this state")}
   }catch(error:Exception){main.post{refresh("Unable to read current trip state · "+(error.message?:"retry"))}}
  }
 }
 private fun runTransition(event:String){
  if(!startupRecoveryReady){refresh("Recovery required · actions disabled");return}
  presentation.setSavingStatus()
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
 override fun onDestroy(){activeLocationTimeout?.let{main.removeCallbacks(it)};releaseGpsWakeLock();activeLocationListener?.let{try{(getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(it)}catch(_:Exception){}};activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null;databaseObserver?.let{db.invalidationTracker.removeObserver(it)};databaseObserver=null;presentation.removePanel();executor.shutdown();if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE)else stopForeground(true);super.onDestroy()}
}
