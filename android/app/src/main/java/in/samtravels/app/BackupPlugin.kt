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
                ensureStartupRecovery()
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
