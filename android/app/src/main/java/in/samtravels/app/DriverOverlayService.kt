package `in`.samtravels.app

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.location.*
import android.os.*
import android.provider.Settings
import android.view.*
import android.widget.*
import androidx.room.Room
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.abs

class DriverOverlayService:Service(){
 private val executor=Executors.newSingleThreadExecutor()
 private val swipePresentation by lazy{DriverSwipePresentationContract.fromAssets(this)}
 private val main=Handler(Looper.getMainLooper())
 private lateinit var window:WindowManager
 private var panel:LinearLayout?=null
 private var panelParams:WindowManager.LayoutParams?=null
 private var bubble:TextView?=null
 private var bubbleParams:WindowManager.LayoutParams?=null
 private var timerText:TextView?=null
 @Volatile private var intervalStartedAt:String?=null
 private val timerTick=object:Runnable{override fun run(){updateTimer();main.postDelayed(this,1000)}}
 private var status:TextView?=null
 private var recoveryButton:Button?=null
 private var swipeLabel:TextView?=null
 private var swipeBar:SeekBar?=null
 private var cancelButton:Button?=null
 private var cancellationFeePanel:DriverCancellationFeePanel?=null;private var tripFinancialPanel:DriverTripFinancialPanel?=null
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
    main.post{if(active){showPanel();recoverPendingAfterServiceStart()}else stopSelf()}
   }catch(error:Exception){
    android.util.Log.e("DriverOverlayService","Repository startup failed",error)
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
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(android.graphics.Color.WHITE)}
  val content=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),dp(14),dp(18),dp(14))}
  val scroll=ScrollView(this).apply{isFillViewport=false;clipToPadding=false}
  scroll.addView(content,ViewGroup.LayoutParams(-1,-2));root.addView(scroll,LinearLayout.LayoutParams(dp(270),dp(560)))
  val header=TextView(this).apply{text="Sam Travels · Driver";textSize=14f;setTextColor(android.graphics.Color.rgb(24,54,74))}
  status=header
  content.addView(header)
  val elapsed=TextView(this).apply{text="00:00:00";textSize=18f;setTextColor(android.graphics.Color.rgb(24,54,74));setPadding(2,6,2,6)}
  timerText=elapsed
  content.addView(elapsed)
  installPanelDrag(header)
  val label=TextView(this).apply{text="Swipe to Going to pickup";textSize=12f;setTextColor(android.graphics.Color.rgb(36,73,94));setPadding(2,10,2,4)}
  swipeLabel=label
  content.addView(label)
  val slider=SeekBar(this).apply{
   max=100
   progress=0
   setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{
    override fun onProgressChanged(bar:SeekBar?,progress:Int,fromUser:Boolean){}
    override fun onStartTrackingTouch(bar:SeekBar?){}
    override fun onStopTrackingTouch(bar:SeekBar?){bar?.progress=0}
   })
  }
  var swipeStartX:Float?=null
  var swipeMoved=false
  slider.setOnTouchListener{_,event->
   when(event.actionMasked){
    MotionEvent.ACTION_DOWN->{swipeStartX=event.rawX;swipeMoved=false}
    MotionEvent.ACTION_MOVE->{val start=swipeStartX;if(start!=null&&event.rawX-start>=dp(swipePresentation.minimumIntentTravelDp))swipeMoved=true}
    MotionEvent.ACTION_UP->{
     val confirmed=swipeMoved&&slider.progress>=swipePresentation.completionPercent
     swipeStartX=null;swipeMoved=false
     if(confirmed)runSwipeTransition()
     slider.progress=0
    }
    MotionEvent.ACTION_CANCEL->{swipeStartX=null;swipeMoved=false;slider.progress=0}
   }
   false
  }
  swipeBar=slider
  content.addView(slider,LinearLayout.LayoutParams(dp(230),dp(48)))
  val cancel=Button(this).apply{text=swipePresentation.secondaryAction("going_to_pickup")?.label?: "Cancel ride";setOnClickListener{runTransition(swipePresentation.secondaryAction("going_to_pickup")?.eventType?:return@setOnClickListener)}}
  cancelButton=cancel
  content.addView(cancel)
  cancellationFeePanel=DriverCancellationFeePanel(this,db,executor,main){message->refresh(message)};cancellationFeePanel?.attach(content)
  tripFinancialPanel=DriverTripFinancialPanel(this,db,executor,main){message->refresh(message)};tripFinancialPanel?.attach(content)
  recoveryButton=Button(this).apply{text="Retry pending action";setOnClickListener{runRecovery()};isEnabled=false}
  content.addView(recoveryButton)
  panel=root
  val type=if(Build.VERSION.SDK_INT>=26)WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
  val params=WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.WRAP_CONTENT,type,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT).apply{gravity=Gravity.END or Gravity.CENTER_VERTICAL;x=12;y=0}
  panelParams=params
  try{window.addView(root,params);refresh();main.removeCallbacks(timerTick);main.post(timerTick)}catch(error:Exception){android.util.Log.e("DriverOverlayService","Window attachment failed",error);panel=null;panelParams=null;stopSelf()}
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
   if(state=="idle"){main.post{removePanel();stopSelf()};return@post}
   val baseStatus="Sam Travels · "+state.replace("_"," ")+" · r"+s.optInt("revision")
   val nextStatus=message?:(if(pending)"Action awaiting GPS · "+state.replace("_"," ") else if(expiredPending)baseStatus+" · previous GPS action expired" else baseStatus)
   if(status?.text?.toString()!=nextStatus){status?.text=nextStatus;status?.announceForAccessibility(nextStatus)}
   updateTimer()
   val swipeAction=swipePresentation.action(state)
   val swipeText=swipeAction?.let{"Swipe to "+it.label}
   val canSwipe=!pending&&!financialPending&&activeLocationEventId==null&&swipeText!=null&&(state!="shift_active"||s.has("shiftContext"))
   swipeLabel?.text=swipeText?: "Trip action unavailable"
   swipeLabel?.contentDescription=swipeText?: "Trip action unavailable"
   swipeBar?.contentDescription=swipeText?: "Trip action unavailable"
   swipeLabel?.visibility=if(swipeText==null)View.GONE else View.VISIBLE
   swipeBar?.visibility=if(swipeText==null)View.GONE else View.VISIBLE
   swipeBar?.progress=0
   swipeBar?.isEnabled=canSwipe
   cancelButton?.visibility=if(state=="going_to_pickup")View.VISIBLE else View.GONE
   cancelButton?.isEnabled=!pending&&!financialPending&&activeLocationEventId==null&&state=="going_to_pickup"
   cancellationFeePanel?.render(
    feeTripId,feePaise,financialPending,financialPending&&feePaise!=null&&!pending&&activeLocationEventId==null,
    window,panel,panelParams,
   )
   tripFinancialPanel?.render(completedFinancialForms,financialPending,window,panel,panelParams)
  }
 }catch(_:Exception){
  startupRecoveryReady=false
  startupRecoveryFailed=true
  LocalDiagnostics.record(applicationContext,"recovery","repository_startup","recovery","startup_blocked")
  main.post{
   status?.text="Recovery required · actions disabled"
   recoveryButton?.isEnabled=false
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
    val event=swipePresentation.action(state)?.eventType
    if(event!=null)main.post{runTransition(event)}else main.post{refresh("No trip action is available in this state")}
   }catch(error:Exception){main.post{refresh("Unable to read current trip state · "+(error.message?:"retry"))}}
  }
 }
 private fun runTransition(event:String){
  if(!startupRecoveryReady){refresh("Recovery required · actions disabled");return}
  status?.text="Saving action · GPS pending"
  main.post{swipeBar?.isEnabled=false;cancelButton?.isEnabled=false}
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
 private fun installPanelDrag(handle:View){
  var downX=0f;var downY=0f;var initialX=0;var initialY=0;var moved=false
  handle.setOnTouchListener{_,event->
   val params=panelParams
   when(event.actionMasked){
    MotionEvent.ACTION_DOWN->{if(params!=null){downX=event.rawX;downY=event.rawY;initialX=params.x;initialY=params.y;moved=false};true}
    MotionEvent.ACTION_MOVE->{if(params!=null){val dx=(event.rawX-downX).toInt();val dy=(event.rawY-downY).toInt();if(abs(dx)>dp(6)||abs(dy)>dp(6))moved=true;if(event.rawY<dp(24)){minimizePanel();return@setOnTouchListener true};params.x=(initialX-dx).coerceAtLeast(0);params.y=initialY+dy;runCatching{panel?.let{window.updateViewLayout(it,params)}}};true}
    MotionEvent.ACTION_UP->{if(params!=null&&event.rawY<dp(24)){minimizePanel();return@setOnTouchListener true};true}
    MotionEvent.ACTION_CANCEL->{true}
    else->true
   }
  }
 }
 private fun minimizePanel(){
  val current=panel?:return
  runCatching{window.removeView(current)}
  panel=null;panelParams=null
  val chip=TextView(this).apply{
   text="⏱ "+elapsedInterval();textSize=13f;setTextColor(android.graphics.Color.WHITE)
   setBackgroundColor(android.graphics.Color.rgb(24,54,74));setPadding(dp(12),dp(10),dp(12),dp(10))
   contentDescription="Driver controls minimized. Tap to reopen"
  }
  val type=if(Build.VERSION.SDK_INT>=26)WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
  val params=WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.WRAP_CONTENT,type,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT).apply{gravity=Gravity.START or Gravity.CENTER_VERTICAL;x=0;y=0}
  var downX=0f;var downY=0f;var initialX=0;var initialY=0;var moved=false
  chip.setOnTouchListener{_,event->
   when(event.actionMasked){
    MotionEvent.ACTION_DOWN->{downX=event.rawX;downY=event.rawY;initialX=params.x;initialY=params.y;moved=false;true}
    MotionEvent.ACTION_MOVE->{val dx=(event.rawX-downX).toInt();val dy=(event.rawY-downY).toInt();if(abs(dx)>dp(6)||abs(dy)>dp(6))moved=true;params.x=(initialX+dx).coerceAtLeast(0);params.y=initialY+dy;runCatching{window.updateViewLayout(chip,params)};true}
    MotionEvent.ACTION_UP->{if(!moved)restorePanel() else {val screenWidth=resources.displayMetrics.widthPixels;params.gravity=if(event.rawX<screenWidth/2f)Gravity.START or Gravity.CENTER_VERTICAL else Gravity.END or Gravity.CENTER_VERTICAL;params.x=0;runCatching{window.updateViewLayout(chip,params)}};true}
    MotionEvent.ACTION_CANCEL->true
    else->true
   }
  }
  bubble=chip;bubbleParams=params
  try{window.addView(chip,params)}catch(_:Exception){bubble=null;bubbleParams=null;stopSelf()}
 }
 private fun restorePanel(){
  bubble?.let{runCatching{window.removeView(it)}};bubble=null;bubbleParams=null
  showPanel()
 }
 private fun elapsedInterval():String{
  val start=intervalStartedAt?.let{runCatching{java.time.Instant.parse(it).toEpochMilli()}.getOrNull()}?:return "00:00:00"
  val seconds=((System.currentTimeMillis()-start)/1000).coerceAtLeast(0)
  return "%02d:%02d:%02d".format(seconds/3600,(seconds%3600)/60,seconds%60)
 }
 private fun updateTimer(){
  val value=elapsedInterval()
  timerText?.text=value
  bubble?.text="⏱ "+value
 }
 private fun removePanel(){
  main.removeCallbacks(timerTick)
  panel?.let{try{window.removeView(it)}catch(_:Exception){}}
  panel=null;panelParams=null
  bubble?.let{try{window.removeView(it)}catch(_:Exception){}}
  bubble=null;bubbleParams=null
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
 override fun onDestroy(){activeLocationTimeout?.let{main.removeCallbacks(it)};releaseGpsWakeLock();activeLocationListener?.let{try{(getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(it)}catch(_:Exception){}};activeLocationEventId=null;activeLocationListener=null;activeLocationTimeout=null;databaseObserver?.let{db.invalidationTracker.removeObserver(it)};databaseObserver=null;removePanel();executor.shutdown();if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE)else stopForeground(true);super.onDestroy()}
}
