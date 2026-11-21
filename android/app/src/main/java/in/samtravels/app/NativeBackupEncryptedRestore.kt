package `in`.samtravels.app

import android.content.Context
import com.getcapacitor.PluginCall
import com.getcapacitor.JSObject
import java.util.concurrent.Executor

/** Capacitor dispatch for authenticated v2 package restore; kept outside BackupPlugin. */
internal object NativeBackupEncryptedRestore {
    fun dispatch(
        call: PluginCall,
        executor: Executor,
        database: () -> LocalDatabase,
        makeSnapshot: () -> NativeSnapshotBundle,
        ensureStartupRecovery: () -> List<String>,
        context: Context,
    ) {
        val confirmed = call.getBoolean("confirmed") ?: false
        val backup = call.getObject("backup")
        val recoveryKey = call.getString("recoveryKey")
        if (!confirmed) {
            call.reject("Explicit restore confirmation is required", "RESTORE_CONFIRMATION_REQUIRED")
            return
        }
        if (backup == null || recoveryKey.isNullOrBlank()) {
            call.reject("Encrypted package and recovery key are required")
            return
        }
        executor.execute {
            try {
                val result = NativeBackupRestoreCoordinator.restoreEncrypted(
                    database(), backup, recoveryKey, makeSnapshot,
                ) { ensureStartupRecovery() }
                val out = JSObject()
                out.put("checkpointId", result.checkpointId)
                out.put("restoredCount", result.restoredCount)
                call.resolve(out)
            } catch (error: Exception) {
                LocalDiagnostics.record(context, "recovery", "restore_encrypted_package", "backup", "restore_failed")
                call.reject("Encrypted restore failed; source data or recovery checkpoint was preserved: " +
                    (error.message ?: "unknown failure"), "RESTORE_FAILED", error)
            }
        }
    }
}
