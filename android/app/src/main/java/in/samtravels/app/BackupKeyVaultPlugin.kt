package `in`.samtravels.app

import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BackupKeyVault")
class BackupKeyVaultPlugin : Plugin() {
    @PluginMethod
    fun storeRecoveryKey(call: PluginCall) {
        val recoveryKey = call.getString("recoveryKey")
        if (recoveryKey.isNullOrBlank()) {
            call.reject("Backup recovery key is required")
            return
        }
        try {
            BackupRecoveryKeyVault(context).store(recoveryKey)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Could not protect backup recovery key with Android Keystore", error)
        }
    }

    @PluginMethod
    fun hasRecoveryKey(call: PluginCall) {
        try {
            val result = JSObject()
            result.put("available", BackupRecoveryKeyVault(context).read() != null)
            call.resolve(result)
        } catch (error: Exception) {
            call.reject("Could not access protected backup recovery key", error)
        }
    }

    @PluginMethod
    fun removeRecoveryKey(call: PluginCall) {
        try {
            BackupRecoveryKeyVault(context).remove()
            call.resolve()
        } catch (error: Exception) {
            call.reject("Could not remove protected backup recovery key", error)
        }
    }
}
