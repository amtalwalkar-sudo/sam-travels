package `in`.samtravels.app
import org.json.JSONObject
import java.time.Instant
import kotlin.math.abs
/** Shared transactional boundary for native PWA commands and floating-overlay actions. */
object DriverWorkflowStore {
 private fun snapshot(db:LocalDatabase)=db.records().get("driver-state")?.let{JSONObject(it.json).optJSONObject("value")}?:JSONObject().put("schemaVersion",1).put("revision",0).put("state","idle")
 private fun save(db:LocalDatabase,key:String,value:JSONObject,now:String){db.records().put(StoredRecord(key,value.toString(),1,now))}
 private fun target(state:String,event:String):String?=when(event){
  "shift_start"->if(state=="idle")"shift_active" else null
  "shift_end"->if(state=="shift_active")"idle" else null
  "trip_start"->if(state=="shift_active"||state=="approach_active")"trip_active" else null
  "trip_end","ride_cancel"->if(state=="trip_active"||state=="approach_active")"shift_active" else null
  else->null
 }
 fun queue(db:LocalDatabase,command:JSONObject):JSONObject{
  var result:JSONObject?=null
  db.runInTransaction{
   val eventId=command.optString("eventId");val commandId=command.optString("commandId");val idem=command.optString("idempotencyKey")
   require(command.optInt("schemaVersion",-1)==1&&eventId.isNotBlank()&&commandId.isNotBlank()&&idem.isNotBlank()){"invalid_command_identity"}
   Instant.parse(command.getString("transitionAt"));require(command.optInt("expectedRevision",-1)>=0){"invalid_revision"}
   require(command.optString("eventType") in setOf("shift_start","shift_end","trip_start","trip_end","ride_cancel")){"invalid_event_type"}
   val key="driver-intent:$eventId";val oldRow=db.records().get(key)
   if(oldRow!=null){val old=JSONObject(oldRow.json);val c=old.optJSONObject("command");require(c!=null&&c.optString("commandId")==commandId&&c.optString("idempotencyKey")==idem){"duplicate_event_id_conflict"};result=old;return@runInTransaction}
   val current=snapshot(db)
   require(command.optInt("expectedRevision",-1)==current.optInt("revision")&&command.optString("expectedPriorState")==current.optString("state")){"stale_revision"}
   require(target(current.optString("state"),command.optString("eventType"))!=null){"invalid_transition"}
   val competing=db.records().list().any{row->if(!row.id.startsWith("driver-intent:"))false else runCatching{val i=JSONObject(row.json);val rev=i.optJSONObject("command")?.optInt("expectedRevision",-1);(i.optString("status")=="pending_location"||i.optString("status")=="needs_attention")&&rev==current.optInt("revision")}.getOrDefault(false)}
   require(!competing){"competing_transition_pending"}
   val now=Instant.now().toString();val intent=JSONObject().put("command",command).put("status","pending_location").put("createdAt",now).put("updatedAt",now)
   save(db,key,intent,now);result=intent
  }
  return result?:error("intent_enqueue_failed")
 }
 fun complete(db:LocalDatabase,eventId:String,gps:JSONObject):JSONObject{
  var committed:JSONObject?=null
  db.runInTransaction{
   val key="driver-intent:$eventId";val row=db.records().get(key)?:error("intent_not_found");val intent=JSONObject(row.json)
   require(intent.optString("status")=="pending_location"){"intent_not_pending"}
   val command=intent.getJSONObject("command");val current=snapshot(db)
   require(command.optInt("expectedRevision",-1)==current.optInt("revision")&&command.optString("expectedPriorState")==current.optString("state")){"stale_revision"}
   val lat=gps.optDouble("latitude",Double.NaN);val lon=gps.optDouble("longitude",Double.NaN);val accuracy=gps.optDouble("horizontalAccuracyM",Double.NaN)
   require(lat.isFinite()&&lon.isFinite()&&lat in -90.0..90.0&&lon in -180.0..180.0){"invalid_gps_coordinates"}
   require(accuracy.isFinite()&&accuracy>=0.0&&accuracy<=50.0){"gps_accuracy_exceeds_50m"}
   val fixAt=Instant.parse(gps.getString("fixAt"));val transitionAt=Instant.parse(command.getString("transitionAt"))
   require(abs(fixAt.toEpochMilli()-transitionAt.toEpochMilli())<=30000L){"gps_fix_outside_30s_window"}
   val event=command.optString("eventType");val nextState=target(current.optString("state"),event)?:error("invalid_transition")
   val revision=current.optInt("revision")+1;val next=JSONObject(current.toString()).put("schemaVersion",1).put("revision",revision).put("state",nextState).put("lastEventId",eventId)
   when(event){"shift_start"->next.put("shiftStartedAt",command.getString("transitionAt"));"shift_end"->next.remove("shiftStartedAt");"trip_start"->next.put("tripStartedAt",command.getString("transitionAt"));"trip_end","ride_cancel"->next.remove("tripStartedAt")}
   val now=Instant.now().toString();val eventRecord=JSONObject().put("eventId",eventId).put("command",command).put("gps",gps).put("committedAt",now).put("revision",revision)
   intent.put("status","recorded").put("updatedAt",now).remove("reason")
   save(db,"driver-event:$eventId",eventRecord,now);save(db,"driver-state",JSONObject().put("value",next),now);save(db,key,intent,now)
   save(db,"driver-outbox:$revision",JSONObject().put("id","driver-state:$revision").put("eventId",eventId).put("revision",revision).put("delivered",false).put("createdAt",now),now)
   committed=next
  }
  return committed?:error("transition_not_committed")
 }
 fun reactivate(db:LocalDatabase,eventId:String):JSONObject{
  var result:JSONObject?=null
  db.runInTransaction{
   val key="driver-intent:$eventId";val row=db.records().get(key)?:error("intent_not_found");val intent=JSONObject(row.json)
   require(intent.optString("status")=="needs_attention"||intent.optString("status")=="pending_location"){"intent_not_recoverable"}
   val command=intent.getJSONObject("command");val current=snapshot(db)
   require(command.optInt("expectedRevision",-1)==current.optInt("revision")&&command.optString("expectedPriorState")==current.optString("state")){"stale_revision"}
   val now=Instant.now().toString();intent.put("status","pending_location").put("updatedAt",now).remove("reason");save(db,key,intent,now);result=intent
  }
  return result?:error("intent_recovery_failed")
 }
 fun markNeedsAttention(db:LocalDatabase,eventId:String,reason:String){
  db.runInTransaction{val key="driver-intent:$eventId";val row=db.records().get(key)?:error("intent_not_found");val intent=JSONObject(row.json)
   if(intent.optString("status")!="recorded"){val now=Instant.now().toString();intent.put("status","needs_attention").put("reason",reason).put("updatedAt",now);save(db,key,intent,now)}}
 }
}
