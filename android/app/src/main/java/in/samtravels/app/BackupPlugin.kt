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

    private val checkpointPrefix = NativeBackupRecovery.CHECKPOINT_PREFIX
    private val journalPrefix = NativeBackupRecovery.JOURNAL_PREFIX
    private fun isInternal(id: String) = NativeBackupRecovery.isInternalRecord(id)
 private fun ensureStartupRecovery(): List<String> = NativeStartupRecovery.ensure(db)


    private fun makeSnapshot(): NativeSnapshotBundle =
        NativeSnapshotBuilder.build(
            db,
            ::isInternal,
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown",
        )

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
                ensureStartupRecovery()
                var snapshot: NativeSnapshotBundle? = null
                db.runInTransaction { snapshot = makeSnapshot() }
                val bundle = snapshot ?: error("snapshot_unavailable")
                val out = JSObject()
                out.put("snapshot", bundle.snapshot)
                out.put("manifest", bundle.manifest)
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
                ensureStartupRecovery()
                val result = NativeBackupRestoreCoordinator.restore(db, snapshot, manifest, ::makeSnapshot)
                val out = JSObject()
                out.put("checkpointId", result.checkpointId)
                out.put("restoredCount", result.restoredCount)
                call.resolve(out)
            } catch (error: Exception) {
                LocalDiagnostics.record(context, "recovery", "restore_snapshot", "backup", "restore_failed")
                call.reject("Restore failed; source data or recovery checkpoint was preserved: " + (error.message ?: "unknown failure"), "RESTORE_FAILED", error)
            }
        }
    }
    @PluginMethod
    fun recoverPendingCheckpoints(call: PluginCall) {
        executor.execute {
            try {
                val recovered = ensureStartupRecovery()
                val out = JSObject()
                out.put("recovered", JSONArray(recovered))
                call.resolve(out)
            } catch (error: Exception) {
                LocalDiagnostics.record(context, "recovery", "recover_pending_checkpoints", "backup", "recovery_failed")
                val reason = error.message?.takeIf { it.isNotBlank() } ?: error.javaClass.simpleName
                call.reject("Pending restore recovery failed; retained checkpoints remain available ($reason)", error)
            }
        }
    }

    @PluginMethod
    fun listCheckpoints(call: PluginCall) {
        executor.execute {
            try {
                ensureStartupRecovery()
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
                ensureStartupRecovery()
                try {
                    NativeBackupRecovery.rollback(db, id)
                } catch (rollbackError: Exception) {
                    NativeStartupRecovery.invalidate(db)
                    throw rollbackError
                }
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
                ensureStartupRecovery()
                NativeBackupRestoreCoordinator.markVerified(db, id)
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
                ensureStartupRecovery()
                NativeBackupRestoreCoordinator.discardVerified(db, id)
                call.resolve()
            } catch (error: Exception) {
                call.reject("Recovery checkpoint cannot be discarded yet", error)
            }
        }
    }
}


/**
 * Production Room restore transaction, separated from Capacitor dispatch so
 * instrumentation tests exercise the exact same validation, checkpoint,
 * replacement, read-back and rollback implementation as the app.
 *
 * Transaction boundaries and recovery journal states intentionally match the
 * original BackupPlugin.restoreSnapshot implementation.
 */
internal object NativeBackupRestoreCoordinator {
    data class RestoreResult(val checkpointId: String, val restoredCount: Int)

    fun restore(
        database: LocalDatabase,
        snapshot: JSONObject,
        manifest: JSONObject,
        makeSnapshot: () -> NativeSnapshotBundle,
        afterReplacement: () -> Unit = {},
        maxRecordCount: Int = MAX_BACKUP_RECORD_COUNT,
    ): RestoreResult {
        BackupSnapshotContract.validateSnapshot(snapshot)
        BackupSnapshotContract.validateManifest(manifest)
        val rawRecords = snapshot.optJSONArray("records") ?: error("backup_records_missing")
        requireBackupRecordCountWithinLimit(rawRecords.length(), maxRecordCount)
        NativeBackupCoverage.validateParticipantManifest(snapshot.optJSONArray("participants"), rawRecords)
        NativeBackupCoverage.validateParticipantManifest(manifest.optJSONArray("participants"), rawRecords)
        val records = if (snapshot.optJSONArray("participants") == null)
            NativeBackupCoverage.normalizeLegacyRecords(rawRecords) else rawRecords
        NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        NativeBackupCoverage.validateSnapshotRevision(records, snapshot.optInt("snapshotRevision", -1))
        require(manifest.optInt("schemaVersion", -1) == BackupSnapshotContract.CURRENT_SCHEMA_VERSION &&
            snapshot.optInt("schemaVersion", -1) == BackupSnapshotContract.CURRENT_SCHEMA_VERSION) {
            "backup_unsupported_schema"
        }
        require(manifest.optInt("snapshotRevision", -1) == snapshot.optInt("snapshotRevision", -2)) {
            "backup_snapshot_revision_mismatch"
        }
        require(manifest.optJSONObject("recordCounts")?.optInt("records", -1) == records.length()) {
            "backup_record_count_mismatch"
        }
        requireBackupRecordCountWithinLimit(records.length())

        val ids = HashSet<String>()
        for (index in 0 until records.length()) {
            val record = records.optJSONObject(index) ?: error("backup_invalid_record")
            val id = record.optString("id")
            require(id.isNotBlank() && !NativeBackupRecovery.isInternalRecord(id) &&
                ids.add(record.optString("participantId") + ":" + id)) {
                "backup_duplicate_or_reserved_record_id"
            }
            require(record.optInt("schemaVersion", 0) >= 1 &&
                record.optString("updatedAt").isNotBlank() && record.optString("json").isNotBlank()) {
                "backup_invalid_record_envelope"
            }
            val payload = JSONObject(record.getString("json"))
            if (payload.has("id")) require(payload.optString("id") == id) {
                "backup_record_identity_mismatch"
            }
        }

        val now = Instant.now().toString()
        val id = UUID.randomUUID().toString()
        database.runInTransaction {
            val checkpoint = makeSnapshot()
            database.records().put(StoredRecord(
                NativeBackupRecovery.CHECKPOINT_PREFIX + id,
                checkpoint.snapshot.toString(), 1, now,
            ))
            database.records().put(StoredRecord(
                NativeBackupRecovery.JOURNAL_PREFIX + id,
                JSONObject().put("id", id).put("createdAt", now).put("status", "checkpoint").toString(),
                1, now,
            ))
        }

        try {
            database.runInTransaction {
                NativeBackupCoverage.replaceBusinessRecords(database, records)
                database.records().put(StoredRecord(
                    NativeBackupRecovery.JOURNAL_PREFIX + id,
                    JSONObject().put("id", id).put("createdAt", now)
                        .put("status", "restored_unverified").toString(),
                    1, now,
                ))
            }

            // Test seam at the real post-commit/pre-read-back boundary. Production
            // callers use the no-op default; instrumentation can force rollback
            // after the replacement transaction has committed.
            afterReplacement()
            val restored = makeSnapshot().snapshot.getJSONArray("records")
            require(restored.length() == records.length()) { "backup_post_restore_count_mismatch" }
            val restoredById = (0 until restored.length()).associate {
                val record = restored.getJSONObject(it)
                record.getString("participantId") + ":" + record.getString("id") to
                    Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
            }
            val expectedById = (0 until records.length()).associate {
                val record = records.getJSONObject(it)
                record.getString("participantId") + ":" + record.getString("id") to
                    Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
            }
            require(restoredById == expectedById && restoredById.keys == ids) {
                "backup_post_restore_integrity_mismatch"
            }
        } catch (restoreError: Exception) {
            try {
                NativeBackupRecovery.rollback(database, id)
            } catch (rollbackError: Exception) {
                NativeStartupRecovery.invalidate(database)
                rollbackError.addSuppressed(restoreError)
                throw rollbackError
            }
            throw restoreError
        }

        return RestoreResult(id, records.length())
    }

    /** Production checkpoint acknowledgement shared by the Capacitor plugin and Room tests. */
    fun markVerified(database: LocalDatabase, checkpointId: String) {
        require(checkpointId.isNotBlank()) { "recovery_checkpoint_missing" }
        database.runInTransaction {
            val key = NativeBackupRecovery.JOURNAL_PREFIX + checkpointId
            val row = database.records().get(key) ?: error("recovery_checkpoint_missing")
            val journal = JSONObject(row.json)
            require(journal.optString("status") == "restored_unverified") {
                "restore_not_pending_verification"
            }
            journal.put("status", "verified")
            database.records().put(StoredRecord(key, journal.toString(), 1, Instant.now().toString()))
        }
    }

    /** Remove only a checkpoint whose restored snapshot was explicitly verified. */
    fun discardVerified(database: LocalDatabase, checkpointId: String) {
        require(checkpointId.isNotBlank()) { "recovery_checkpoint_missing" }
        database.runInTransaction {
            val journalKey = NativeBackupRecovery.JOURNAL_PREFIX + checkpointId
            val checkpointKey = NativeBackupRecovery.CHECKPOINT_PREFIX + checkpointId
            val row = database.records().get(journalKey) ?: error("recovery_checkpoint_missing")
            require(JSONObject(row.json).optString("status") == "verified") {
                "checkpoint_must_be_verified_before_discard"
            }
            database.records().remove(checkpointKey)
            database.records().remove(journalKey)
        }
    }
}

