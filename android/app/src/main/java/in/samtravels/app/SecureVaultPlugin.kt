package `in`.samtravels.app

import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "SecureVault")
class SecureVaultPlugin : Plugin() {
    @PluginMethod
    fun set(call: PluginCall) {
        val name = call.getString("name")
        val value = call.getString("value")
        if (name.isNullOrBlank() || value == null) {
            call.reject("Credential name and value are required")
            return
        }
        try {
            SecureCredentialVault(context).set(name, value)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Secure credential write failed", error)
        }
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val name = call.getString("name")
        if (name.isNullOrBlank()) {
            call.reject("Credential name required")
            return
        }
        try {
            val out = JSObject()
            SecureCredentialVault(context).get(name)?.let { out.put("value", it) }
            call.resolve(out)
        } catch (error: Exception) {
            call.reject("Secure credential read failed", error)
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val name = call.getString("name")
        if (name.isNullOrBlank()) {
            call.reject("Credential name required")
            return
        }
        try {
            SecureCredentialVault(context).remove(name)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Secure credential removal failed", error)
        }
    }
}
