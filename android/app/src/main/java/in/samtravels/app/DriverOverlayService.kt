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
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
class DriverOverlayService:Service(){
 private val executor=ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,LinkedBlockingQueue(),{r->Thread(r,"DriverOverlayService").apply{isDaemon=true}},{_,_->})
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
 // Room invalidation is the fast path. A low-frequency refresh pulse is the
 // cross-process safety net for OEM/Room invalidation delivery gaps.
 private val roomRefreshPulse=object:Runnable{
  override fun run(){
   if(serviceDestroyed)return
   refresh()
   main.postDelayed(this,1_000L)
  }
 }
 @Volatile private var intervalStartedAt:String?=null
 private var activeLocationEventId:String?=null
 // Main-thread idempotency guard prevents stale recovery reacquiring an event after its first fix.
 private val locationRequestEventIds=mutableSetOf<String>()
 // Main-thread gate: one overlay transition may be queued, awaiting GPS, or committing at a time.
 private var transitionInFlight=false
 // Reserve swipe dispatch before Room lookup so duplicate ACTION_UP events cannot queue two commands.
 private var swipeDispatchInFlight=false
 // These request fields are read and written only on the main thread.
 private var activeLocationListener:LocationListener?=null
 private var activeLocationTimeout:Runnable?=null
 @Volatile private var serviceDestroyed=false
 private var gpsWakeLock:PowerManager.WakeLock?=null
 private var databaseObserver:androidx.room.InvalidationTracker.Observer?=null
 @Volatile private var startupRecoveryReady=false
 @Volatile private var startupRecoveryFailed=false
 @Volatile private var pendingIntentRecoveryChecked=false
 // Keep fresh actions disabled until the startup pending-intent scan settles.
 @Volatile private var startupPendingRecoverySettled=false
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
 // Snapshot test-factory overrides so a retiring service cannot observe later test globals.
 private var databaseNameForService:String?=null
 private lateinit var locationSource:DriverLocationSource
 private val db by lazy{DriverOverlayDatabaseFactory.open(applicationContext,databaseNameForService)}
 override fun onCreate(){
  super.onCreate()
  databaseNameForService=DriverOverlayDatabaseFactory.databaseNameOverrideForTests
  locationSource=DriverLocationSourceFactory.create(this)
  android.util.Log.i("DriverOverlayService", "service_created instance=${System.identityHashCode(this)} source=${System.identityHashCode(locationSource)} isolatedDatabaseOverridePresent=${databaseNameForService != null} testLocationSource=${DriverLocationSourceFactory.overrideForTests != null}")
 }
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  if(!Settings.canDrawOverlays(this)){stopSelf();return START_NOT_STICKY}
  try{enterForeground()}catch(error:Exception){android.util.Log.e("DriverOverlayService","Foreground startup failed",error);stopSelf();return START_NOT_STICKY}
  executor.execute{
   try{
    android.util.Log.i("DriverOverlayService", "service_database_opened isolatedPath=${databaseNameForService != null} pendingIntents=${DriverWorkflowStore.listIntents(db).count { it.optString("status") == "pending_location" }}")
    NativeStartupRecovery.ensure(db)
    startupRecoveryReady=true
    startupRecoveryFailed=false
    if(databaseObserver==null){
     databaseObserver=object:androidx.room.InvalidationTracker.Observer("records"){override fun onInvalidated(tables:Set<String>){refresh()}}
     db.invalidationTracker.addObserver(databaseObserver!!)
     main.removeCallbacks(roomRefreshPulse)
     main.postDelayed(roomRefreshPulse,1_000L)
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
    val intent=DriverWorkflowStore.firstPendingLocation(db)?:run{
     android.util.Log.i("DriverOverlayService", "startup_recovery_no_pending_intent")
     main.post{
      startupPendingRecoverySettled=true
      refresh()
     }
     return@execute
    }
    android.util.Log.i("DriverOverlayService", "startup_recovery_pending_intent_found")
    val command=intent.optJSONObject("command")?:error("pending_command_missing")
    val id=command.optString("eventId")
    if(!DriverRecoveryPolicy.isWithinGpsWindow(command.getString("transitionAt"))){
     DriverWorkflowStore.markNeedsAttention(db,id,"gps_recovery_window_expired")
     main.post{
      startupPendingRecoverySettled=true
      refresh("Action retained · GPS evidence window expired; review required")
     }
     return@execute
    }
    val resumed=DriverWorkflowStore.reactivate(db,id)
    main.post{
     // Keep fresh overlay actions disabled until this startup decision is
     // complete. If another surface or a just-completed transition won the
     // race, do not blindly reacquire the stale snapshot returned above.
     if(transitionInFlight||activeLocationEventId!=null){
      startupPendingRecoverySettled=true
      refresh()
      return@post
     }
     acquireLocation(id,command,resumed)
     startupPendingRecoverySettled=true
     refresh()
    }
   }catch(error:Exception){
    main.post{
     startupRecoveryReady=false
     startupPendingRecoverySettled=false
     refresh("Pending action retained · "+(error.message?:"recovery deferred"))
    }
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
   // Location-request state is owned by the main thread. Read it only here,
   // alongside presentation updates, rather than from the database executor.
   val canSwipe=startupPendingRecoverySettled&&!pending&&!financialPending&&
    activeLocationEventId==null&&!transitionInFlight&&
    swipePresentation.action(state)!=null&&(state!="shift_active"||s.has("shiftContext"))
   if (!canSwipe) android.util.Log.i("DriverOverlayService",
    "swipe_readiness pending=$pending financialPending=$financialPending activeLocationRequest=${activeLocationEventId != null} shiftContext=${s.has("shiftContext")} actionPresent=${swipePresentation.action(state) != null} recoveryReady=$startupRecoveryReady")
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
  if(!startupRecoveryReady||activeLocationEventId!=null||transitionInFlight)return
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
   val resumed=DriverWorkflowStore.reactivate(db,id)
   main.post{
    if(transitionInFlight||activeLocationEventId!=null)return@post
    acquireLocation(id,command,resumed)
   }
  }catch(e:Exception){main.post{refresh("Recovery unavailable · "+(e.message?:"retry later"))}}}
 }
 private fun runSwipeTransition(){
  if(Looper.myLooper()!=Looper.getMainLooper()){
   main.post{runSwipeTransition()}
   return
  }
  if(!startupRecoveryReady||!startupPendingRecoverySettled||
    transitionInFlight||activeLocationEventId!=null||swipeDispatchInFlight){
   android.util.Log.i("DriverOverlayService", "swipe_dispatch_rejected instance=${System.identityHashCode(this)} transitionInFlight=$transitionInFlight active=${activeLocationEventId != null} dispatchInFlight=$swipeDispatchInFlight startupRecoverySettled=$startupPendingRecoverySettled")
   return
  }
  android.util.Log.i("DriverOverlayService", "swipe_dispatch_accepted instance=${System.identityHashCode(this)}")
  swipeDispatchInFlight=true
  executor.execute{
   try{
    NativeStartupRecovery.ensure(db)
    val state=DriverWorkflowStore.snapshot(db).optString("state")
    val event=swipePresentation.action(state)?.eventType
    if(event!=null)main.post{runTransition(event)}
    else main.post{
     swipeDispatchInFlight=false
     refresh("No trip action is available in this state")
    }
   }catch(error:Exception){
    main.post{
     swipeDispatchInFlight=false
     refresh("Unable to read current trip state · "+(error.message?:"retry"))
    }
   }
  }
 }
 private fun runTransition(event:String){
  if(Looper.myLooper()!=Looper.getMainLooper()){main.post{runTransition(event)};return}
  if(transitionInFlight||activeLocationEventId!=null){
   swipeDispatchInFlight=false
   return
  }
  swipeDispatchInFlight=false
  if(!startupRecoveryReady||!startupPendingRecoverySettled){refresh("Recovery required · actions disabled");return}
  transitionInFlight=true
  android.util.Log.i("DriverOverlayService", "transition_dispatch_accepted instance=${System.identityHashCode(this)} eventType=$event")
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
  }catch(e:Exception){main.post{transitionInFlight=false;refresh("Action not queued · "+(e.message?:"storage error"))}}}
 }
 /**
  * All location-request state and LocationManager lifecycle operations are main-thread
  * confined. Callers may be on the database executor; marshal them before touching
  * activeLocationEventId, listener/timeout references, or the wake lock.
  */
 private fun acquireLocation(id:String,command:JSONObject,intent:JSONObject){
  if(Looper.myLooper()!=Looper.getMainLooper()){
   main.post{if(!serviceDestroyed)acquireLocationOnMain(id,command,intent)}
   return
  }
  if(serviceDestroyed)return
  acquireLocationOnMain(id,command,intent)
 }
 private fun acquireLocationOnMain(id:String,command:JSONObject,intent:JSONObject){
  check(Looper.myLooper()==Looper.getMainLooper()){ "location_request_must_run_on_main_thread" };android.util.Log.i("DriverOverlayService", "gps_acquire_attempt instance=${System.identityHashCode(this)} source=${System.identityHashCode(locationSource)} eventType=${command.optString("eventType")} active=${activeLocationEventId != null} previouslyRequested=${locationRequestEventIds.contains(id)} transitionInFlight=$transitionInFlight startupRecoverySettled=$startupPendingRecoverySettled")
  try{
   if(locationRequestEventIds.contains(id)){
    android.util.Log.i("DriverOverlayService", "gps_request_duplicate_suppressed")
    return
   }
   if(activeLocationEventId!=null){if(activeLocationEventId==id)return;markAttention(id,intent,"another_location_request_active");return}
   if(checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED&&checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED){markAttention(id,intent,"permission_denied");return}
   val transitionAt=command.optString("transitionAt")
   val remainingMs=DriverRecoveryPolicy.remainingGpsWindowMillis(transitionAt)
   if(remainingMs<=0L){markAttention(id,intent,"gps_recovery_window_expired");return}
   val provider=locationSource.bestProvider()
   if(provider==null){markAttention(id,intent,"location_unavailable");return}
   locationRequestEventIds.add(id)
   activeLocationEventId=id
   val powerManager=getSystemService(Context.POWER_SERVICE) as PowerManager
   gpsWakeLock=powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"SamTravels:DriverGps").apply{setReferenceCounted(false);acquire(remainingMs.coerceAtMost(30_000L))}
   var finished=false
   lateinit var listener:LocationListener
   lateinit var timeout:Runnable
   fun finish(location:Location?=null,reason:String="location_timeout"){
    check(Looper.myLooper()==Looper.getMainLooper()){ "location_finish_must_run_on_main_thread" }
    if(finished)return
    finished=true
    main.removeCallbacks(timeout)
    try{locationSource.removeUpdates(listener)}catch(_:Exception){}
    activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null
    releaseGpsWakeLock()
    if(location!=null)complete(id,command,intent,location)else{
     locationRequestEventIds.remove(id)
     markAttention(id,intent,reason)
    }
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
   locationSource.requestLocationUpdates(provider,listener,Looper.getMainLooper());android.util.Log.i("DriverOverlayService", "gps_request_started instance=${System.identityHashCode(this)} eventType=${command.optString("eventType")}")
   main.postDelayed(timeout,remainingMs)
  }catch(e:Exception){locationRequestEventIds.remove(id);activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null;releaseGpsWakeLock();markAttention(id,intent,"location_unavailable")}
 }
 private fun elapsedInterval():String{
  val start=intervalStartedAt?.let{runCatching{java.time.Instant.parse(it).toEpochMilli()}.getOrNull()}?:return "00:00:00"
  val seconds=((System.currentTimeMillis()-start)/1000).coerceAtLeast(0)
  return "%02d:%02d:%02d".format(seconds/3600,(seconds%3600)/60,seconds%60)
 }
 private fun releaseGpsWakeLock(){val lock=gpsWakeLock;gpsWakeLock=null;if(lock?.isHeld==true)try{lock.release()}catch(_:Exception){}}
 private fun markAttention(id:String,intent:JSONObject,reason:String){
  if(Looper.myLooper()==Looper.getMainLooper())locationRequestEventIds.remove(id)
  else main.post{locationRequestEventIds.remove(id)}
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
   main.post{transitionInFlight=false;refresh("Action retained · "+effectiveReason)}
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
    main.post{transitionInFlight=false;refresh("Recorded · "+command.optString("eventType").replace("_"," "))}
   }catch(e:Exception){markAttention(id,intent,e.message?:"commit_failed")}
  }
 }
 override fun onDestroy(){
  check(Looper.myLooper()==Looper.getMainLooper()){ "service_destroy_must_run_on_main_thread" }
  serviceDestroyed=true
  main.removeCallbacks(roomRefreshPulse)
  activeLocationTimeout?.let{main.removeCallbacks(it)}
  activeLocationListener?.let{try{locationSource.removeUpdates(it)}catch(_:Exception){}}
  activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null
  locationRequestEventIds.clear()
  releaseGpsWakeLock()
  databaseObserver?.let{db.invalidationTracker.removeObserver(it)};databaseObserver=null
  presentation.removePanel();executor.shutdown()
  if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE)else stopForeground(true)
  super.onDestroy()
 }
}
