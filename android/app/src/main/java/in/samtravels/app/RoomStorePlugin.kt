package `in`.samtravels.app

import androidx.room.Room
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

@CapacitorPlugin(name = "RoomStore")
class RoomStorePlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    private val db by lazy {
        Room.databaseBuilder(context, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .build()
    }

    // Reads preserve historical rows; application services validate typed records before use.
    private fun decodeStoredRow(row: StoredRecord): JSONObject = JSONObject(row.json)

    @PluginMethod
    fun get(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrBlank()) {
            call.reject("Record id required")
            return
        }
        executor.execute {
            try {
                NativeStartupRecovery.ensure(db)
                val row = db.records().get(id)
                val out = JSObject()
                if (row != null) out.put("record", decodeStoredRow(row))
                call.resolve(out)
            } catch (error: Exception) {
                call.reject("Room read failed", error)
            }
        }
    }

    @PluginMethod
    fun put(call: PluginCall) {
        val record = call.getObject("record")
        if (record == null) {
            call.reject("Record envelope required")
            return
        }
        try {
            RecordEnvelopeContract.validate(record)
        } catch (error: Exception) {
            call.reject("Invalid record envelope", error)
            return
        }
        val id = record.optString("id")
        val version = record.optInt("schemaVersion", -1)
        val updated = record.optString("updatedAt")
        executor.execute {
            try {
                NativeStartupRecovery.ensure(db)
                db.records().put(StoredRecord(id, record.toString(), version, updated))
                call.resolve()
            } catch (error: Exception) {
                call.reject("Room write failed", error)
            }
        }
    }

    @PluginMethod
    fun list(call: PluginCall) {
        executor.execute {
            try {
                NativeStartupRecovery.ensure(db)
                val rows = db.records().list()
                val arr = JSONArray()
                rows.forEach { arr.put(decodeStoredRow(it)) }
                val out = JSObject()
                out.put("records", arr)
                call.resolve(out)
            } catch (error: Exception) {
                call.reject("Room list failed", error)
            }
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrBlank()) {
            call.reject("Record id required")
            return
        }
        executor.execute {
            try {
                NativeStartupRecovery.ensure(db)
                db.records().remove(id)
                call.resolve()
            } catch (error: Exception) {
                call.reject("Room delete failed", error)
            }
        }
    }
}
