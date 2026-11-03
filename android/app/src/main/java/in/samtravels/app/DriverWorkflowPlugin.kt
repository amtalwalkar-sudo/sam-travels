package `in`.samtravels.app

import android.Manifest
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
 @PluginMethod fun getSnapshot(call:PluginCall){executor.execute{try{val out=JSObject();out.put("snapshot",state());call.resolve(out)}catch(e:Exception){call.reject("Driver state read failed",e)}}}
 @PluginMethod fun queueIntent(call:PluginCall){
  val command=call.getObject("command");if(command==null){call.reject("Command required");return}
  executor.execute{try{
   val eventId=command.optString("eventId");val commandId=command.optString("commandId");if(eventId.isBlank()||commandId.isBlank()){call.reject("Invalid command identity");return@execute}
   val existing=db.records().get("driver-intent:"+eventId)
   if(existing!=null){val old=JSONObject(existing.json);if(old.optJSONObject("command")?.optString("commandId")!=commandId){call.reject("Duplicate event id conflict");return@execute};val out=JSObject();out.put("intent",old);call.resolve(out);return@execute}
   val snapshot=state();if(command.optInt("expectedRevision",-1)!=snapshot.optInt("revision")||command.optString("expectedPriorState")!=snapshot.optString("state")){call.reject("Stale driver revision");return@execute}
   val intent=JSONObject().put("command",command).put("status","pending_location").put("createdAt",java.time.Instant.now().toString()).put("updatedAt",java.time.Instant.now().toString())
   save("driver-intent:"+eventId,intent);val out=JSObject();out.put("intent",intent);call.resolve(out)
  }catch(e:Exception){call.reject("Driver intent enqueue failed",e)}}
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
  val eventId=call.getString("eventId");val gps=call.getObject("gps");if(eventId.isNullOrBlank()||gps==null){call.reject("Event id and GPS evidence required");return}
  executor.execute{try{
   var committed:JSONObject?=null
   db.runInTransaction{
    val stored=db.records().get("driver-intent:"+eventId)?:throw IllegalStateException("Intent not found")
    val intent=JSONObject(stored.json);if(intent.optString("status")!="pending_location")throw IllegalStateException("Intent is not pending")
    val command=intent.getJSONObject("command");val snapshot=state()
    if(command.optInt("expectedRevision",-1)!=snapshot.optInt("revision")||command.optString("expectedPriorState")!=snapshot.optString("state"))throw IllegalStateException("Stale driver revision")
    val lat=gps.optDouble("latitude",Double.NaN);val lon=gps.optDouble("longitude",Double.NaN);val accuracy=gps.optDouble("horizontalAccuracyM",Double.NaN)
    val fixAt=java.time.Instant.parse(gps.getString("fixAt"));val transitionAt=java.time.Instant.parse(command.getString("transitionAt"))
    if(lat.isNaN()||lon.isNaN()||lat !in -90.0..90.0||lon !in -180.0..180.0)throw IllegalStateException("Invalid GPS coordinates")
    if(accuracy.isNaN()||accuracy<0||accuracy>50)throw IllegalStateException("GPS accuracy exceeds 50 metres")
    if(abs(fixAt.toEpochMilli()-transitionAt.toEpochMilli())>30000L)throw IllegalStateException("GPS fix is older than 30 seconds")
    val event=command.optString("eventType");val current=snapshot.optString("state")
    val target=when(event){"shift_start"->if(current=="idle")"shift_active" else null;"shift_end"->if(current=="shift_active")"idle" else null;"trip_start"->if(current=="shift_active")"trip_active" else null;"trip_end","ride_cancel"->if(current=="trip_active"||current=="approach_active")"shift_active" else null;else->null}?:throw IllegalStateException("Invalid driver transition")
    val next=JSONObject(snapshot.toString()).put("revision",snapshot.optInt("revision")+1).put("state",target).put("lastEventId",eventId)
    if(event=="shift_start")next.put("shiftStartedAt",command.getString("transitionAt"));if(event=="shift_end")next.remove("shiftStartedAt")
    if(event=="trip_start")next.put("tripStartedAt",command.getString("transitionAt"));if(event=="trip_end"||event=="ride_cancel")next.remove("tripStartedAt")
    val now=java.time.Instant.now().toString()
    val eventRecord=JSONObject().put("eventId",eventId).put("command",command).put("gps",gps).put("committedAt",now).put("revision",next.optInt("revision"))
    intent.put("status","recorded").put("updatedAt",now)
    save("driver-event:"+eventId,eventRecord);save("driver-state",JSONObject().put("value",next));save("driver-intent:"+eventId,intent)
    save("driver-outbox:"+next.optInt("revision"),JSONObject().put("id","driver-state:"+next.optInt("revision")).put("eventId",eventId).put("revision",next.optInt("revision")).put("delivered",false).put("createdAt",now))
    committed=next
   }
   val out=JSObject();out.put("snapshot",committed);call.resolve(out)
   val eventData=JSObject();eventData.put("snapshot",committed);notifyListeners("driverStateChanged",eventData)
  }catch(e:Exception){call.reject("Driver transition was not committed: "+(e.message?:"unknown failure"),"TRANSITION_FAILED",e)}}
 }
 @PluginMethod fun listEvents(call:PluginCall){executor.execute{try{val arr=JSONArray();db.records().list().filter{it.id.startsWith("driver-event:")}.sortedBy{it.updatedAt}.forEach{arr.put(JSONObject(it.json))};val out=JSObject();out.put("events",arr);call.resolve(out)}catch(e:Exception){call.reject("Driver event history read failed",e)}}}\n @PluginMethod fun markNeedsAttention(call:PluginCall){val id=call.getString("eventId");val reason=call.getString("reason")?:"location_unavailable";if(id.isNullOrBlank()){call.reject("Event id required");return};executor.execute{try{val key="driver-intent:"+id;val row=db.records().get(key)?:throw IllegalStateException("Intent not found");val intent=JSONObject(row.json).put("status","needs_attention").put("reason",reason).put("updatedAt",java.time.Instant.now().toString());save(key,intent);call.resolve()}catch(e:Exception){call.reject("Unable to preserve pending intent",e)}}}
}
