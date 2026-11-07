package `in`.samtravels.app

import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "LocalDiagnostics")
class DiagnosticsPlugin : Plugin() {
    @PluginMethod
    fun recordDiagnosticEvent(call: PluginCall) {
        try {
            LocalDiagnostics.recordEvent(context, call.data)
            call.resolve()
        } catch (_: Exception) {
            // Recording is best-effort; never reject a business operation.
            call.resolve()
        }
    }

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
