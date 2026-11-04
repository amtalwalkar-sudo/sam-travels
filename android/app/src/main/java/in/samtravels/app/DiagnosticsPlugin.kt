package `in`.samtravels.app

import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "LocalDiagnostics")
class DiagnosticsPlugin : Plugin() {
    @PluginMethod
    fun exportLocalDiagnostics(call: PluginCall) {
        try {
            val out = JSObject()
            out.put("entries", LocalDiagnostics.export(context))
            call.resolve(out)
        } catch (_: Exception) {
            val out = JSObject()
            out.put("entries", org.json.JSONArray())
            call.resolve(out)
        }
    }
}
