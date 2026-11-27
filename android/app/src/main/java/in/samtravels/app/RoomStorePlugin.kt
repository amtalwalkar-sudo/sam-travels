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
import org.json.JSONTokener
import kotlinx.coroutines.runBlocking
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Only transient form working copies may be hard-deleted through the generic Room repository. */
internal fun assertTransientRecordDeletionAllowed(id: String) {
    require(id.startsWith("__sam_travels_form_working_copy__:")) { "record_delete_forbidden" }
}

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

/** Commit a staged feature migration batch with revision guards in one Room transaction. */
internal suspend fun commitFeatureUpgradeBatch(
    database: LocalDatabase,
    records: JSONArray,
    deletes: JSONArray,
    expectedRevisions: JSONObject,
    deleteNamespacePrefix: String? = null,
): Boolean {
    val writesById = linkedMapOf<String, JSONObject>()
    for (index in 0 until records.length()) {
        val record = records.getJSONObject(index)
        RecordEnvelopeContract.validate(record)
        val id = record.optString("id")
        require(id.isNotBlank() && writesById.put(id, record) == null) {
            "feature_upgrade_duplicate_write"
        }
    }
    val deleteIds = (0 until deletes.length()).map { deletes.getString(it) }
    require(deleteIds.all { it.isNotBlank() } && deleteIds.distinct().size == deleteIds.size) {
        "feature_upgrade_invalid_delete"
    }
    if (deleteIds.isNotEmpty()) {
        require(!deleteNamespacePrefix.isNullOrBlank() && deleteIds.all { it.startsWith(deleteNamespacePrefix) }) {
            "feature_upgrade_delete_namespace_mismatch"
        }
    }
    require(deleteIds.none { it in writesById }) { "feature_upgrade_write_delete_conflict" }
    val touchedIds = writesById.keys + deleteIds
    require(touchedIds.all { expectedRevisions.has(it) }) { "feature_upgrade_expected_revision_missing" }

    return database.withTransaction {
        for (id in touchedIds) {
            val expected = expectedRevisions.optInt(id, Int.MIN_VALUE)
            require(expected >= -1) { "feature_upgrade_expected_revision_invalid" }
            val currentRevision = database.records().get(id)?.let {
                JSONObject(it.json).optInt("revision", -1)
            } ?: -1
            if (currentRevision != expected) return@withTransaction false
        }
        writesById.forEach { (id, record) ->
            val expected = expectedRevisions.optInt(id, Int.MIN_VALUE)
            require(record.optInt("revision", -1) == if (expected == -1) 1 else expected + 1) {
                "atomic_record_batch_revision_invalid"
            }
        }
        writesById.values.forEach { record ->
            database.records().put(StoredRecord(
                record.getString("id"),
                record.toString(),
                record.getInt("schemaVersion"),
                record.getString("updatedAt"),
            ))
        }
        deleteIds.forEach(database.records()::remove)
        true
    }
}

@CapacitorPlugin(name = "RoomStore")
class RoomStorePlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var failNextWorkingCopyCompletion = false

    /** Debug-only deterministic fault injection for WebView/Room recovery instrumentation. */
    @PluginMethod
    fun armWorkingCopyCompletionFailure(call: PluginCall) {
        if (!BuildConfig.DEBUG) {
            call.reject("Fault injection is available only in debug builds")
            return
        }
        failNextWorkingCopyCompletion = true
        call.resolve()
    }
    private val database = lazy {
        Room.databaseBuilder(context, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation()
            .build()
    }
    private val db by database

    /**
     * Drain repository operations and close Room before the Activity teardown returns.
     *
     * Tests and Android lifecycle transitions can immediately reopen or replace the
     * database file. Merely enqueueing close here leaves a window in which the next
     * Bridge can attach to a stale Room connection and observe a different database
     * generation from the one its direct Room repository has opened.
     */
    override fun handleOnDestroy() {
        if (database.isInitialized()) {
            // The single-thread executor preserves operation order: close runs after
            // every accepted repository operation, and shutdown prevents new work.
            executor.execute { runCatching { db.close() } }
        }
        executor.shutdown()
        try {
            if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                executor.shutdownNow()
                executor.awaitTermination(2, TimeUnit.SECONDS)
            }
        } catch (interrupted: InterruptedException) {
            executor.shutdownNow()
            Thread.currentThread().interrupt()
        } finally {
            super.handleOnDestroy()
        }
    }

    // Reads preserve historical rows; application services validate typed records before use.
    private fun decodeStoredRow(row: StoredRecord): JSONObject {
        // Parse the persisted payload explicitly as JSON text. Do not pass the
        // Room entity itself to JSONObject's reflective Object constructor:
        // that constructor interprets StoredRecord as a bean and fails before
        // the browser repository can enumerate any rows.
        val payload = JSONTokener(row.json).nextValue() as? JSONObject
            ?: error("room_record_payload_not_object:" + row.id)
        if (!payload.has("id")) payload.put("id", row.id)
        return payload
    }

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
                val workingCopyStatus = record.optJSONObject("data")?.optString("status")
                if (BuildConfig.DEBUG && failNextWorkingCopyCompletion &&
                    id.startsWith("__sam_travels_form_working_copy__:") &&
                    (workingCopyStatus == "saved" || workingCopyStatus == "submitted")) {
                    failNextWorkingCopyCompletion = false
                    call.reject("simulated_process_death_after_domain_commit")
                    return@execute
                }
                NativeStartupRecovery.ensure(db)
                val committed = runBlocking { compareAndSetStoredRecord(db, id, expected, record) }
                val out = JSObject()
                out.put("committed", committed)
                call.resolve(out)
            } catch (error: Exception) {
                call.reject("Room compare-and-set failed", error)
            }
        }
    }

    /** Apply precomputed migration writes atomically after revision checks against Room. */
    @PluginMethod
    fun commitFeatureUpgradeBatch(call: PluginCall) {
        val records = call.getArray("records") ?: JSONArray()
        val deletes = call.getArray("deletes") ?: JSONArray()
        val expected = call.getObject("expectedRevisions") ?: JSONObject()
        val deleteNamespacePrefix = call.getString("deleteNamespacePrefix")
        executor.execute {
            try {
                NativeStartupRecovery.ensure(db)
                val committed = runBlocking { commitFeatureUpgradeBatch(db, records, deletes, expected, deleteNamespacePrefix) }
                val out = JSObject()
                out.put("committed", committed)
                call.resolve(out)
            } catch (error: Exception) {
                call.reject("Feature extension upgrade transaction failed", error)
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
                // Preserve the stable production error while exposing the native
                // cause in debug acceptance builds so WebView startup failures
                // identify the failing Room/recovery operation.
                val detail = if (BuildConfig.DEBUG) {
                    " (" + error.javaClass.simpleName + ": " + (error.message ?: "no detail") + ")"
                } else ""
                call.reject("Room list failed" + detail, error)
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
        try { assertTransientRecordDeletionAllowed(id) } catch (error: Exception) {
            call.reject("Room delete failed", error)
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
