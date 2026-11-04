package `in`.samtravels.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Best-effort bounded local diagnostics; enum allowlists prohibit payload/GPS text. */
internal object LocalDiagnostics {
    private const val PREFS = "sam_travels_local_diagnostics"
    private const val KEY = "entries"
    private const val MAX_ENTRIES = 200
    private val subsystems = setOf("storage", "workflow", "recovery", "backup")
    private val operations = setOf("repository_startup", "workflow_startup", "retry_pending_action", "dispatch_transition", "queue_intent", "complete_intent", "retry_intent", "export_snapshot", "restore_snapshot")
    private val categories = setOf("storage", "workflow", "recovery", "backup", "permission", "location")
    private val results = setOf("startup_blocked", "retry_required", "retry_failed", "operation_failed", "export_failed", "restore_failed", "rolled_back")

    private fun token(value: String, allowed: Set<String>): String = if (allowed.contains(value)) value else "unknown"

    fun record(context: Context, subsystem: String, operation: String, failureCategory: String, recoveryResult: String) {
        try {
            val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val entries = JSONArray(preferences.getString(KEY, "[]") ?: "[]")
            entries.put(JSONObject()
                .put("timestamp", Instant.now().toString())
                .put("subsystem", token(subsystem, subsystems))
                .put("operation", token(operation, operations))
                .put("outcome", "failure")
                .put("failureCategory", token(failureCategory, categories))
                .put("recoveryResult", token(recoveryResult, results))
                .put("appVersion", runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown" }.getOrDefault("unknown"))
                .put("schemaVersion", 1))
            val bounded = JSONArray()
            val start = (entries.length() - MAX_ENTRIES).coerceAtLeast(0)
            for (index in start until entries.length()) bounded.put(entries.getJSONObject(index))
            preferences.edit().putString(KEY, bounded.toString()).apply()
        } catch (_: Exception) {
            // Recording failures must not affect the business/recovery operation.
        }
    }

    fun export(context: Context): JSONArray = try {
        JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]")
    } catch (_: Exception) {
        JSONArray()
    }
}
