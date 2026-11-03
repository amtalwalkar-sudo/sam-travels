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
import androidx.room.Room
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import kotlin.math.abs

@CapacitorPlugin(name="DriverWorkflow", permissions=[Permission(alias="location", strings=[Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION])])
class DriverWorkflowPlugin:Plugin(){
 private val executor=Executors.newSingleThreadExecutor()
 private val main=Handler(Looper.getMainLooper())
 private val db by lazy{Room.databaseBuilder(context,LocalDatabase::class.java,"sam-travels.db").build()}
 private fun state():JSONObject=db.records().get("driver-state")?.let{JSONObject(it.json).optJSONObject("value")}?:JSONObject().put("schemaVersion",1).put("revision",0).put("state","idle")
 private fun save(key:String,value:JSONObject){db.records().put(StoredRecord(key,value.toString(),1,java.time.Instant.now().toString()))}
 @PluginMethod fun enableOverlay(call:PluginCall){
  if(!Settings.canDrawOverlays(context)){val settings=Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(settings);call.reject("Grant display-over-other-apps permission, then enable the overlay again","OVERLAY_PERMISSION_REQUIRED");return}
  try{context.startService(Intent(context,DriverOverlayService::class.java));call.resolve()}catch(e:Exception){call.reject("Unable to start native driver overlay",e)}
 }
 @PluginMethod fun disableOverlay(call:PluginCall){try{context.stopService(Intent(context,DriverOverlayService::class.java));call.resolve()}catch(e:Exception){call.reject("Unable to stop native driver overlay",e)}}
 @PluginMethod fun getSnapshot(call:PluginCall){executor.execute{try{val out=JSObject();out.put("snapshot",state());call.resolve(out)}catch(e:Exception){call.reject("Driver state read failed",e)}}}
 @PluginMethod fun queueIntent(call:PluginCall){
  val command=call.getObject("command");if(command==null){call.reject("Command required");return}
  executor.execute{try{val intent=DriverWorkflowStore.queue(db,command);val out=JSObject();out.put("intent",intent);call.resolve(out)}
   catch(e:Exception){call.reject("Driver intent enqueue failed: "+(e.message?:"unknown failure"),"INTENT_ENQUEUE_FAILED",e)}}
 }
 @PluginMethod fun listPending(call:PluginCall){executor.execute{try{val arr=JSONArray();db.records().list().filter{it.id.startsWith("driver-intent:")}.forEach{val j=JSONObject(it.json);if(j.optString("status")=="pending_location"||j.optString("status")=="needs_attention")arr.put(j)};val out=JSObject();out.put("intents",arr);call.resolve(out)}catch(e:Exception){call.reject("Pending intent read failed",e)}}}
 @PluginMethod fun captureLocation(call:PluginCall){
  if(getPermissionState("location")!=PermissionState.GRANTED){requestPermissionForAlias("location",call,"locationPermissionCallback");return}
  requestOneFix(call)
 }
 @PermissionCallback private fun locationPermissionCallback(call:PluginCall){if(getPermissionState("location")==PermissionState.GRANTED)requestOneFix(call)else call.reject("Location permission denied; intent remains pending","PERMISSION_DENIED")}
 private fun requestOneFix(call:PluginCall){
  try{
   val manager=context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
   val criteria=Criteria().apply{accuracy=Criteria.ACCURACY_FINE;powerRequirement=Criteria.POWER_LOW}
   val provider=manager.getBestProvider(criteria,true)?:run{call.reject("No enabled location provider","LOCATION_UNAVAILABLE");return}
   var finished=false
   lateinit var listener:LocationListener
   val timeout=Runnable{if(!finished){finished=true;try{manager.removeUpdates(listener)}catch(_:Exception){};call.reject("Location request timed out; intent remains pending","LOCATION_TIMEOUT")}}
   listener=LocationListener{location:Location->
    if(!finished){finished=true;main.removeCallbacks(timeout);val out=JSObject();out.put("latitude",location.latitude);out.put("longitude",location.longitude);out.put("horizontalAccuracyM",location.accuracy.toDouble());out.put("fixAt",java.time.Instant.ofEpochMilli(location.time).toString());out.put("provider",location.provider?:"android");call.resolve(out)}
   }
   manager.requestSingleUpdate(provider,listener,Looper.getMainLooper())
   main.postDelayed(timeout,35_000L)
  }catch(e:SecurityException){call.reject("Location permission unavailable","PERMISSION_DENIED",e)}catch(e:Exception){call.reject("Unable to acquire event location","LOCATION_UNAVAILABLE",e)}
 }
 @PluginMethod fun completeIntent(call:PluginCall){
  val eventId=call.getString("eventId");val gps=call.getObject("gps")
  if(eventId.isNullOrBlank()||gps==null){call.reject("Event id and GPS evidence required");return}
  executor.execute{try{val committed=DriverWorkflowStore.complete(db,eventId,gps)
   val out=JSObject();out.put("snapshot",committed);call.resolve(out)
   val eventData=JSObject();eventData.put("snapshot",committed);notifyListeners("driverStateChanged",eventData)
  }catch(e:Exception){call.reject("Driver transition was not committed: "+(e.message?:"unknown failure"),"TRANSITION_FAILED",e)}}
 }
 @PluginMethod fun retryIntent(call:PluginCall){
  val id=call.getString("eventId");if(id.isNullOrBlank()){call.reject("Event id required");return}
  executor.execute{try{val intent=DriverWorkflowStore.reactivate(db,id);val out=JSObject();out.put("intent",intent);call.resolve(out)}
   catch(e:Exception){call.reject("Unable to resume pending intent: "+(e.message?:"unknown failure"),"INTENT_RECOVERY_FAILED",e)}}
 }
 @PluginMethod fun listEvents(call:PluginCall){executor.execute{try{val arr=JSONArray();db.records().list().filter{it.id.startsWith("driver-event:")}.sortedBy{it.updatedAt}.forEach{arr.put(JSONObject(it.json))};val out=JSObject();out.put("events",arr);call.resolve(out)}catch(e:Exception){call.reject("Driver event history read failed",e)}}}
 @PluginMethod fun markNeedsAttention(call:PluginCall){
  val id=call.getString("eventId");val reason=call.getString("reason")?:"location_unavailable"
  if(id.isNullOrBlank()){call.reject("Event id required");return}
  executor.execute{try{DriverWorkflowStore.markNeedsAttention(db,id,reason);call.resolve()}
   catch(e:Exception){call.reject("Unable to preserve pending intent",e)}}
 }

}
