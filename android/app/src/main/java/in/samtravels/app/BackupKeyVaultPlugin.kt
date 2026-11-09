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
    fun getRecoveryKey(call: PluginCall) {
        try {
            val result = JSObject()
            result.put("recoveryKey", BackupRecoveryKeyVault(context).read())
            call.resolve(result)
        } catch (error: Exception) {
            call.reject("Could not read protected backup recovery key", error)
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
    fun configureBackgroundBackup(call: PluginCall) {
        val clientId = call.getString("clientId")?.trim()
        val redirectUri = call.getString("redirectUri")?.trim()
        if (clientId.isNullOrBlank() || redirectUri.isNullOrBlank()) {
            call.reject("Dropbox app key and redirect URI are required")
            return
        }
        try {
            context.getSharedPreferences("sam_travels_dropbox_config", android.content.Context.MODE_PRIVATE)
                .edit().putString("client_id", clientId).putString("redirect_uri", redirectUri).commit()
            BackgroundBackupScheduler.runSoon(context)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Could not configure scheduled Dropbox backup", error)
        }
    }

    @PluginMethod
    fun scheduleBackgroundBackup(call: PluginCall) {
        try {
            BackgroundBackupScheduler.runSoon(context)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Could not schedule Dropbox backup", error)
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
