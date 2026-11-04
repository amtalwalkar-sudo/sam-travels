package `in`.samtravels.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Best-effort bounded local diagnostics; never captures business payloads or GPS. */
internal object LocalDiagnostics {
    private const val PREFS = "sam_travels_local_diagnostics"
    private const val KEY = "entries"
    private const val MAX_ENTRIES = 200
    private const val MAX_TOKEN = 64

    private fun token(value: String): String =
        value.replace(Regex("[^A-Za-z0-9_.:-]"), "_").take(MAX_TOKEN).ifBlank { "unknown" }

    fun record(context: Context, subsystem: String, operation: String, failureCategory: String, recoveryResult: String) {
        try {
            val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val entries = JSONArray(preferences.getString(KEY, "[]") ?: "[]")
            entries.put(JSONObject()
                .put("timestamp", Instant.now().toString())
                .put("subsystem", token(subsystem))
                .put("operation", token(operation))
                .put("outcome", "failure")
                .put("failureCategory", token(failureCategory))
                .put("recoveryResult", token(recoveryResult))
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
