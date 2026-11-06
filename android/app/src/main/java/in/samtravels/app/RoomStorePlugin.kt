package `in`.samtravels.app

import androidx.room.Room
import androidx.room.withTransaction
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** Shared transaction primitive used by the native repository and Room instrumentation tests. */
internal suspend fun compareAndSetStoredRecord(
    database: LocalDatabase,
    id: String,
    expectedRevision: Int,
    record: JSONObject,
): Boolean {
    require(id.isNotBlank() && record.optString("id") == id) { "atomic_record_identity_mismatch" }
    require(expectedRevision >= -1) { "atomic_record_expected_revision_invalid" }
    return database.withTransaction {
        val current = database.records().get(id)
        val currentRevision = current?.let { JSONObject(it.json).optInt("revision", -1) } ?: -1
        if (currentRevision != expectedRevision) {
            false
        } else {
            database.records().put(StoredRecord(
                id, record.toString(), record.optInt("schemaVersion", -1), record.optString("updatedAt"),
            ))
            true
        }
    }
}

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

    /** Revision comparison and replacement execute under one Room transaction. */
    @PluginMethod
    fun compareAndSet(call: PluginCall) {
        val record = call.getObject("record")
        if (record == null) {
            call.reject("Record envelope required")
            return
        }
        val id = record.optString("id")
        val expected = call.getInt("expectedRevision")
        if (id.isBlank() || expected == null || expected < -1) {
            call.reject("Valid id and expected revision required")
            return
        }
        try {
            RecordEnvelopeContract.validate(record)
        } catch (error: Exception) {
            call.reject("Invalid record envelope", error)
            return
        }
        executor.execute {
            try {
                NativeStartupRecovery.ensure(db)
                val committed = compareAndSetStoredRecord(db, id, expected, record)
                val out = JSObject()
                out.put("committed", committed)
                call.resolve(out)
            } catch (error: Exception) {
                call.reject("Room compare-and-set failed", error)
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
