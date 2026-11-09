package `in`.samtravels.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.content.Context
import android.location.Criteria
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import androidx.room.Room
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

@CapacitorPlugin(name="DriverWorkflow", permissions=[Permission(alias="location", strings=[Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION])])
class DriverWorkflowPlugin:Plugin(){
 private val executor=Executors.newSingleThreadExecutor()
 private val main=Handler(Looper.getMainLooper())
 private val db by lazy{Room.databaseBuilder(context,LocalDatabase::class.java,"sam-travels.db").addMigrations(LocalDatabase.MIGRATION_1_2,LocalDatabase.MIGRATION_2_3).enableMultiInstanceInvalidation().build()}
 @Volatile private var recordObserver:androidx.room.InvalidationTracker.Observer?=null
 override fun load(){
  super.load()
  executor.execute{
   try{
    if(recordObserver==null){
     recordObserver=object:androidx.room.InvalidationTracker.Observer("records"){
      override fun onInvalidated(tables:Set<String>){
       executor.execute{
        runCatching{
         val data=JSObject();data.put("snapshot",state())
         notifyListeners("driverStateChanged",data)
        }
       }
      }
     }
     db.invalidationTracker.addObserver(recordObserver!!)
    }
   }catch(_:Exception){}
  }
 }
 override fun handleOnDestroy(){
  recordObserver?.let{runCatching{db.invalidationTracker.removeObserver(it)}}
  recordObserver=null
  executor.shutdown()
  runCatching{db.close()}
  super.handleOnDestroy()
 }
 private fun hasLocationPermission()=context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED||context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED
 private fun ensureStartupRecovery(){NativeStartupRecovery.ensure(db)}
 private fun state():JSONObject{ensureStartupRecovery();return DriverWorkflowStore.snapshot(db)}
 @PluginMethod fun enableOverlay(call:PluginCall){
  if(!hasLocationPermission()){requestPermissionForAlias("location",call,"overlayLocationPermissionCallback");return}
  startOverlay(call)
 }
 @PermissionCallback private fun overlayLocationPermissionCallback(call:PluginCall){
  if(hasLocationPermission())startOverlay(call)else call.reject("Location permission is required for driver events","PERMISSION_DENIED")
 }
 private fun startOverlay(call:PluginCall){
  if(!Settings.canDrawOverlays(context)){val settings=Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(settings);call.reject("Grant display-over-other-apps permission, then enable the overlay again","OVERLAY_PERMISSION_REQUIRED");return}
  val preferences=context.getSharedPreferences("sam_travels_driver_overlay",Context.MODE_PRIVATE)
  try{
   if(android.os.Build.VERSION.SDK_INT>=26)context.startForegroundService(Intent(context,DriverOverlayService::class.java))else context.startService(Intent(context,DriverOverlayService::class.java))
   preferences.edit().putBoolean("overlay_enabled",true).putBoolean("boot_resume_deferred",false).commit()
   call.resolve()
  }catch(e:Exception){
   preferences.edit().putBoolean("overlay_enabled",false).commit()
   call.reject("Unable to start native driver overlay",e)
  }
 }
 @PluginMethod fun disableOverlay(call:PluginCall){try{context.getSharedPreferences("sam_travels_driver_overlay",Context.MODE_PRIVATE).edit().putBoolean("overlay_enabled",false).putBoolean("boot_resume_deferred",false).commit();context.stopService(Intent(context,DriverOverlayService::class.java));call.resolve()}catch(e:Exception){call.reject("Unable to stop native driver overlay",e)}}
 @PluginMethod fun getSnapshot(call:PluginCall){executor.execute{try{val snapshot=state();if(snapshot.optString("state")=="shift_active"&&context.getSharedPreferences("sam_travels_driver_overlay",Context.MODE_PRIVATE).getBoolean("overlay_activation_pending",false)){reconcileOverlayForCommittedState("shift_start",snapshot)};val out=JSObject();out.put("snapshot",snapshot);call.resolve(out)}catch(e:Exception){call.reject("Driver state read failed",e)}}}
 @PluginMethod fun queueIntent(call:PluginCall){
  val command=call.getObject("command");if(command==null){call.reject("Command required");return}
  executor.execute{try{ensureStartupRecovery();val intent=DriverWorkflowStore.queue(db,command);val out=JSObject();out.put("intent",intent);call.resolve(out)}
   catch(e:Exception){LocalDiagnostics.record(context,"workflow","queue_intent","workflow","operation_failed");call.reject("Driver intent enqueue failed: "+(e.message?:"unknown failure"),"INTENT_ENQUEUE_FAILED",e)}}
 }
 @PluginMethod fun listPending(call:PluginCall){executor.execute{try{ensureStartupRecovery();val arr=JSONArray();DriverWorkflowStore.listPending(db).forEach{arr.put(it)};val out=JSObject();out.put("intents",arr);call.resolve(out)}catch(e:Exception){call.reject("Pending intent read failed",e)}}}
 @PluginMethod fun captureLocation(call:PluginCall){
  val transitionAt=call.getString("transitionAt")
  if(transitionAt.isNullOrBlank()){call.reject("Original transition timestamp required","INVALID_TRANSITION_TIME");return}
  if(!hasLocationPermission()){requestPermissionForAlias("location",call,"locationPermissionCallback");return}
  requestReliableFix(call,transitionAt)
 }
 @PermissionCallback private fun locationPermissionCallback(call:PluginCall){
  val transitionAt=call.getString("transitionAt")
  if(!hasLocationPermission())call.reject("Location permission denied; intent remains pending","PERMISSION_DENIED")
  else if(transitionAt.isNullOrBlank())call.reject("Original transition timestamp missing","INVALID_TRANSITION_TIME")
  else requestReliableFix(call,transitionAt)
 }
 private fun requestReliableFix(call:PluginCall,transitionAtValue:String){
  try{
   val remainingMs=DriverRecoveryPolicy.remainingGpsWindowMillis(transitionAtValue)
   if(remainingMs<=0L){call.reject("Original GPS evidence window expired; intent remains pending","GPS_WINDOW_EXPIRED");return}
   val manager=context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
   val criteria=Criteria().apply{accuracy=Criteria.ACCURACY_FINE}
   val provider=if(manager.isProviderEnabled(LocationManager.GPS_PROVIDER))LocationManager.GPS_PROVIDER
    else manager.getBestProvider(criteria,true)?:run{call.reject("No enabled location provider","LOCATION_UNAVAILABLE");return}
   val wakeLock=(context.getSystemService(Context.POWER_SERVICE) as PowerManager)
    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"SamTravels:PwaEventGps").apply{setReferenceCounted(false);acquire(remainingMs.coerceAtMost(30_000L))}
   fun releaseWakeLock(){if(wakeLock.isHeld)try{wakeLock.release()}catch(_:Exception){}}
   var finished=false
   lateinit var listener:LocationListener
   lateinit var timeout:Runnable
   fun finish(error:String?=null,location:Location?=null){
    if(finished)return
    finished=true
    main.removeCallbacks(timeout)
    try{manager.removeUpdates(listener)}catch(_:Exception){}
    releaseWakeLock()
    if(location!=null){
     val out=JSObject();out.put("latitude",location.latitude);out.put("longitude",location.longitude)
     out.put("horizontalAccuracyM",location.accuracy.toDouble());out.put("fixAt",java.time.Instant.ofEpochMilli(location.time).toString())
     out.put("provider",location.provider?:"android");call.resolve(out)
    }else call.reject(error?:"Location request timed out; intent remains pending",if(error=="gps_recovery_window_expired")"GPS_WINDOW_EXPIRED" else "LOCATION_TIMEOUT")
   }
   timeout=Runnable{finish("Location request timed out; intent remains pending")}
   listener=LocationListener{location:Location->
    if(!finished){
     val candidate=JSONObject().put("latitude",location.latitude).put("longitude",location.longitude)
      .put("horizontalAccuracyM",location.accuracy.toDouble())
      .put("fixAt",java.time.Instant.ofEpochMilli(location.time).toString())
      .put("provider",location.provider?:"android")
     if(DriverTransitionPolicy.isAcceptableGpsEvidence(candidate,transitionAtValue))finish(location=location)
    }
   }
   try{
    manager.requestLocationUpdates(provider,0L,0f,listener,Looper.getMainLooper())
    main.postDelayed(timeout,remainingMs)
   }catch(error:Exception){
    finished=true;releaseWakeLock();throw error
   }
  }catch(e:SecurityException){call.reject("Location permission unavailable","PERMISSION_DENIED",e)}
   catch(e:Exception){call.reject("Unable to acquire event location","LOCATION_UNAVAILABLE",e)}
 }
 private fun reconcileOverlayForCommittedState(eventType:String, committed:JSONObject){
  val preferences=context.getSharedPreferences("sam_travels_driver_overlay",Context.MODE_PRIVATE)
  when(eventType){
   "shift_start" -> {
    if(!Settings.canDrawOverlays(context)){
     preferences.edit().putBoolean("overlay_enabled",false).putBoolean("overlay_activation_pending",true).commit()
     LocalDiagnostics.record(context,"overlay","auto_activate","permission","overlay_permission_required")
     return
    }
    if(!hasLocationPermission()){
     preferences.edit().putBoolean("overlay_enabled",false).putBoolean("overlay_activation_pending",true).commit()
     LocalDiagnostics.record(context,"overlay","auto_activate","permission","location_permission_required")
     return
    }
    try{
     val service=Intent(context,DriverOverlayService::class.java)
     if(android.os.Build.VERSION.SDK_INT>=26)context.startForegroundService(service)else context.startService(service)
     preferences.edit().putBoolean("overlay_enabled",true).putBoolean("overlay_activation_pending",false).putBoolean("boot_resume_deferred",false).commit()
    }catch(e:Exception){
     preferences.edit().putBoolean("overlay_enabled",false).putBoolean("overlay_activation_pending",true).commit()
     LocalDiagnostics.record(context,"overlay","auto_activate","service","overlay_start_failed")
    }
   }
   "shift_end" -> {
    preferences.edit().putBoolean("overlay_enabled",false).putBoolean("overlay_activation_pending",false).putBoolean("boot_resume_deferred",false).commit()
    context.stopService(Intent(context,DriverOverlayService::class.java))
   }
  }
 }
 @PluginMethod fun completeIntent(call:PluginCall){
  val eventId=call.getString("eventId");val gps=call.getObject("gps")
  if(eventId.isNullOrBlank()||gps==null){call.reject("Event id and GPS evidence required");return}
  executor.execute{try{
   ensureStartupRecovery()
   val committed=DriverWorkflowStore.complete(db,eventId,gps)
   val eventType=DriverWorkflowStore.eventTypeForIntent(db,eventId)
   reconcileOverlayForCommittedState(eventType,committed)
   val out=JSObject();out.put("snapshot",committed);call.resolve(out)
   val eventData=JSObject();eventData.put("snapshot",committed);notifyListeners("driverStateChanged",eventData)
  }catch(e:Exception){LocalDiagnostics.record(context,"workflow","complete_intent","workflow","operation_failed");call.reject("Driver transition was not committed: "+(e.message?:"unknown failure"),"TRANSITION_FAILED",e)}}
 }
 @PluginMethod fun retryIntent(call:PluginCall){
  val id=call.getString("eventId");if(id.isNullOrBlank()){call.reject("Event id required");return}
  executor.execute{try{ensureStartupRecovery();val intent=DriverWorkflowStore.reactivate(db,id);val out=JSObject();out.put("intent",intent);call.resolve(out)}
   catch(e:Exception){LocalDiagnostics.record(context,"recovery","retry_intent","recovery","retry_failed");call.reject("Unable to resume pending intent: "+(e.message?:"unknown failure"),"INTENT_RECOVERY_FAILED",e)}}
 }
 @PluginMethod fun listEvents(call:PluginCall){executor.execute{try{ensureStartupRecovery();val arr=JSONArray();DriverWorkflowStore.listEvents(db).forEach{arr.put(it)};val out=JSObject();out.put("events",arr);call.resolve(out)}catch(e:Exception){call.reject("Driver event history read failed",e)}}}
 @PluginMethod fun markNeedsAttention(call:PluginCall){
  val id=call.getString("eventId");val reason=call.getString("reason")?:"location_unavailable"
  if(id.isNullOrBlank()){call.reject("Event id required");return}
  executor.execute{try{ensureStartupRecovery();DriverWorkflowStore.markNeedsAttention(db,id,reason);call.resolve()}
   catch(e:Exception){call.reject("Unable to preserve pending intent",e)}}
 }

}
