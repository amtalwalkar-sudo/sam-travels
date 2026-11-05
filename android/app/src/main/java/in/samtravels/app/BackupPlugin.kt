package `in`.samtravels.app

import androidx.room.Room
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors

@CapacitorPlugin(name = "Backup")
class BackupPlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    private val db by lazy {
        Room.databaseBuilder(context, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation()
            .build()
    }

    private val checkpointPrefix = "__sam_travels_recovery_checkpoint__:"
    private val journalPrefix = "__sam_travels_recovery_journal__:"
    private fun isInternal(id: String) = id.startsWith(checkpointPrefix) || id.startsWith(journalPrefix)


    private fun businessRecords(): JSONArray =
        NativeBackupCoverage.exportBusinessRecords(db, ::isInternal)

    private fun snapshotRevision(records: JSONArray): Int {
        for (index in 0 until records.length()) {
            val row = records.optJSONObject(index) ?: continue
            if (row.optString("id") == "driver-state") {
                val storedJson = runCatching { JSONObject(row.optString("json")) }.getOrNull()
                return storedJson?.optJSONObject("value")?.optInt("revision", 0) ?: 0
            }
        }
        return 0
    }

    private fun makeSnapshot(): JSONObject {
        val records = businessRecords()
        return JSONObject()
            .put("records", records)
            .put("snapshotRevision", snapshotRevision(records))
            .put("schemaVersion", 1)
            .put("participants", NativeBackupCoverage.participantManifest())
    }

    private fun saveInternal(id: String, value: JSONObject, now: String) {
        db.records().put(StoredRecord(id, value.toString(), 1, now))
    }

    @PluginMethod
    fun consumeOAuthCallback(call: PluginCall) {
        try {
            val preferences = context.getSharedPreferences("sam_travels_oauth", android.content.Context.MODE_PRIVATE)
            val callback = preferences.getString("pending_callback_url", null)
            preferences.edit().remove("pending_callback_url").apply()
            val out = JSObject()
            if (callback != null) out.put("url", callback)
            call.resolve(out)
        } catch (error: Exception) {
            call.reject("Unable to read Dropbox OAuth callback", error)
        }
    }

    @PluginMethod
    fun exportSnapshot(call: PluginCall) {
        executor.execute {
            try {
                var snapshot: JSONObject? = null
                db.runInTransaction { snapshot = makeSnapshot() }
                val value = snapshot ?: error("snapshot_unavailable")
                val manifest = JSONObject()
                    .put("applicationVersion", context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown")
                    .put("schemaVersion", 1)
                    .put("createdAt", Instant.now().toString())
                    .put("businessTimezone", "Asia/Kolkata")
                    .put("snapshotRevision", value.optInt("snapshotRevision"))
                    .put("recordCounts", JSONObject().put("records", value.getJSONArray("records").length()))
                    .put("participants", NativeBackupCoverage.participantManifest())
                val out = JSObject()
                out.put("snapshot", value)
                out.put("manifest", manifest)
                call.resolve(out)
            } catch (error: Exception) {
                LocalDiagnostics.record(context, "backup", "export_snapshot", "backup", "export_failed")
                call.reject("Consistent Room snapshot failed", error)
            }
        }
    }

    @PluginMethod
    fun restoreSnapshot(call: PluginCall) {
        val confirmed = call.getBoolean("confirmed") ?: false
        val snapshot = call.getObject("snapshot")
        val manifest = call.getObject("manifest")
        if (!confirmed) {
            call.reject("Explicit restore confirmation is required", "RESTORE_CONFIRMATION_REQUIRED")
            return
        }
        if (snapshot == null || manifest == null) {
            call.reject("Validated snapshot and manifest are required")
            return
        }
        executor.execute {
            try {
                val rawRecords = snapshot.optJSONArray("records") ?: error("backup_records_missing")
                NativeBackupCoverage.validateParticipantManifest(snapshot.optJSONArray("participants"))
                NativeBackupCoverage.validateParticipantManifest(manifest.optJSONArray("participants"))
                val records = if (snapshot.optJSONArray("participants") == null)
                    NativeBackupCoverage.normalizeLegacyRecords(rawRecords) else rawRecords
                NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
                require(manifest.optInt("schemaVersion", -1) == 1 && snapshot.optInt("schemaVersion", -1) == 1) {
                    "backup_unsupported_schema"
                }
                require(manifest.optInt("snapshotRevision", -1) == snapshot.optInt("snapshotRevision", -2)) {
                    "backup_snapshot_revision_mismatch"
                }
                require(manifest.optJSONObject("recordCounts")?.optInt("records", -1) == records.length()) {
                    "backup_record_count_mismatch"
                }
                require(records.length() <= 1_000_000) { "backup_record_count_limit" }

                val ids = HashSet<String>()
                for (index in 0 until records.length()) {
                    val record = records.optJSONObject(index) ?: error("backup_invalid_record")
                    val id = record.optString("id")
                    require(id.isNotBlank() && !isInternal(id) && ids.add(record.optString("participantId") + ":" + id)) { "backup_duplicate_or_reserved_record_id" }
                    require(record.optInt("schemaVersion", 0) >= 1 && record.optString("updatedAt").isNotBlank() &&
                        record.optString("json").isNotBlank()) {
                        "backup_invalid_record_envelope"
                    }
                    val payload = JSONObject(record.getString("json"))
                    if (payload.has("id")) require(payload.optString("id") == id) { "backup_record_identity_mismatch" }
                }

                val checkpoint = makeSnapshot()
                val now = Instant.now().toString()
                val id = UUID.randomUUID().toString()
                db.runInTransaction {
                    saveInternal(checkpointPrefix + id, checkpoint, now)
                    saveInternal(
                        journalPrefix + id,
                        JSONObject().put("id", id).put("createdAt", now).put("status", "checkpoint"),
                        now,
                    )
                }

                try {
                    db.runInTransaction {
                        NativeBackupCoverage.replaceBusinessRecords(db, records)
                        saveInternal(
                            journalPrefix + id,
                            JSONObject().put("id", id).put("createdAt", now).put("status", "restored_unverified"),
                            now,
                        )
                    }

                    val restored = businessRecords()
                    require(restored.length() == records.length()) { "backup_post_restore_count_mismatch" }
                    val restoredById = (0 until restored.length()).associate {
                        val record = restored.getJSONObject(it)
                        record.getString("participantId") + ":" + record.getString("participantId") + ":" + record.getString("id") to Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
                    }
                    val expectedById = (0 until records.length()).associate {
                        val record = records.getJSONObject(it)
                        record.getString("participantId") + ":" + record.getString("id") to Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
                    }
                    require(restoredById == expectedById && restoredById.keys == ids) {
                        "backup_post_restore_integrity_mismatch"
                    }
                } catch (restoreError: Exception) {
                    val old = JSONObject(db.records().get(checkpointPrefix + id)?.json ?: error("recovery_checkpoint_missing"))
                    val oldRecords = old.getJSONArray("records")
                    db.runInTransaction {
                        NativeBackupCoverage.replaceBusinessRecords(db, oldRecords)
                        saveInternal(
                            journalPrefix + id,
                            JSONObject().put("id", id).put("createdAt", now).put("status", "rollback_complete"),
                            now,
                        )
                    }
                    throw restoreError
                }

                val out = JSObject()
                out.put("checkpointId", id)
                out.put("restoredCount", records.length())
                call.resolve(out)
            } catch (error: Exception) {
                LocalDiagnostics.record(context, "recovery", "restore_snapshot", "backup", "restore_failed")
                call.reject("Restore failed; source data or recovery checkpoint was preserved: " + (error.message ?: "unknown failure"), "RESTORE_FAILED", error)
            }
        }
    }

    @PluginMethod
    fun listCheckpoints(call: PluginCall) {
        executor.execute {
            try {
                val result = JSONArray()
                db.records().list().filter { it.id.startsWith(journalPrefix) }.forEach {
                    val row = JSONObject(it.json)
                    result.put(row)
                }
                val out = JSObject()
                out.put("checkpoints", result)
                call.resolve(out)
            } catch (error: Exception) {
                call.reject("Recovery checkpoint listing failed", error)
            }
        }
    }

    @PluginMethod
    fun rollbackCheckpoint(call: PluginCall) {
        val id = call.getString("checkpointId")
        if (id.isNullOrBlank()) {
            call.reject("Checkpoint id required")
            return
        }
        executor.execute {
            try {
                val checkpointRow = db.records().get(checkpointPrefix + id) ?: error("recovery_checkpoint_missing")
                val journalRow = db.records().get(journalPrefix + id) ?: error("recovery_journal_missing")
                val journal = JSONObject(journalRow.json)
                require(journal.optString("status") == "checkpoint" || journal.optString("status") == "restored_unverified" || journal.optString("status") == "rollback_complete") {
                    "checkpoint_not_rollback_eligible"
                }
                val oldRecords = JSONObject(checkpointRow.json).getJSONArray("records")
                db.runInTransaction {
                    NativeBackupCoverage.replaceBusinessRecords(db, oldRecords)
                    journal.put("status", "rollback_complete")
                    saveInternal(journalPrefix + id, journal, Instant.now().toString())
                }
                val restored = businessRecords()
                require(restored.length() == oldRecords.length()) { "checkpoint_rollback_count_mismatch" }
                val restoredById = (0 until restored.length()).associate {
                    val record = restored.getJSONObject(it)
                    record.getString("participantId") + ":" + record.getString("id") to Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
                }
                val expectedById = (0 until oldRecords.length()).associate {
                    val record = oldRecords.getJSONObject(it)
                    record.getString("participantId") + ":" + record.getString("id") to Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
                }
                require(restoredById == expectedById) { "checkpoint_rollback_integrity_mismatch" }
                call.resolve()
            } catch (error: Exception) {
                call.reject("Checkpoint rollback failed; retained checkpoint remains available", error)
            }
        }
    }

    @PluginMethod
    fun markRestoreVerified(call: PluginCall) {
        val id = call.getString("checkpointId")
        if (id.isNullOrBlank()) {
            call.reject("Checkpoint id required")
            return
        }
        executor.execute {
            try {
                db.runInTransaction {
                    val key = journalPrefix + id
                    val row = db.records().get(key) ?: error("recovery_checkpoint_missing")
                    val journal = JSONObject(row.json)
                    require(journal.optString("status") == "restored_unverified") { "restore_not_pending_verification" }
                    journal.put("status", "verified")
                    saveInternal(key, journal, Instant.now().toString())
                }
                call.resolve()
            } catch (error: Exception) {
                call.reject("Unable to verify restored data", error)
            }
        }
    }

    @PluginMethod
    fun discardVerifiedCheckpoint(call: PluginCall) {
        val id = call.getString("checkpointId")
        if (id.isNullOrBlank()) {
            call.reject("Checkpoint id required")
            return
        }
        executor.execute {
            try {
                db.runInTransaction {
                    val key = journalPrefix + id
                    val row = db.records().get(key) ?: error("recovery_checkpoint_missing")
                    require(JSONObject(row.json).optString("status") == "verified") {
                        "checkpoint_must_be_verified_before_discard"
                    }
                    db.records().remove(checkpointPrefix + id)
                    db.records().remove(key)
                }
                call.resolve()
            } catch (error: Exception) {
                call.reject("Recovery checkpoint cannot be discarded yet", error)
            }
        }
    }
}
