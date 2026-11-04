package `in`.samtravels.app
import androidx.room.Room
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
@CapacitorPlugin(name="RoomStore") class RoomStorePlugin:Plugin(){private val executor=Executors.newSingleThreadExecutor();private val db by lazy{Room.databaseBuilder(context,LocalDatabase::class.java,"sam-travels.db") .addMigrations(LocalDatabase.MIGRATION_1_2).build()}
@PluginMethod fun get(call:PluginCall){val id=call.getString("id");if(id.isNullOrBlank()){call.reject("Record id required");return};executor.execute{try{val row=db.records().get(id);val out=JSObject();if(row!=null)out.put("record",JSONObject(row.json));call.resolve(out)}catch(e:Exception){call.reject("Room read failed",e)}}}
@PluginMethod fun put(call:PluginCall){val record=call.getObject("record");if(record==null){call.reject("Record envelope required");return};val id=record.optString("id");val version=record.optInt("schemaVersion",0);val updated=record.optString("updatedAt");if(id.isBlank()||version<1||updated.isBlank()){call.reject("Invalid record envelope");return};executor.execute{try{db.records().put(StoredRecord(id,record.toString(),version,updated));call.resolve()}catch(e:Exception){call.reject("Room write failed",e)}}}
@PluginMethod fun list(call:PluginCall){executor.execute{try{val rows=db.records().list();val arr=JSONArray();rows.forEach{arr.put(JSONObject(it.json))};val out=JSObject();out.put("records",arr);call.resolve(out)}catch(e:Exception){call.reject("Room list failed",e)}}}
@PluginMethod fun remove(call:PluginCall){val id=call.getString("id");if(id.isNullOrBlank()){call.reject("Record id required");return};executor.execute{try{db.records().remove(id);call.resolve()}catch(e:Exception){call.reject("Room delete failed",e)}}}}