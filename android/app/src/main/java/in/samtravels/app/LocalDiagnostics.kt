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


    private val stages = setOf("discovery", "activation", "dependency", "contribution", "source_query", "data_validation", "calculation", "presentation", "upgrade_preflight")
    private val codes = setOf("feature_discovered", "feature_active", "feature_blocked", "feature_rejected", "dependency_unavailable", "contribution_invalid", "source_query_failed", "source_validation_failed", "calculation_failed", "presentation_unavailable", "upgrade_compatible", "upgrade_incompatible", "unknown")
    private val outcomes = setOf("success", "blocked", "failure", "invalid")
    private val safeId = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")

    /** Persist only the shared, allowlisted Stage 5 metadata contract. */
    fun recordEvent(context: Context, event: JSONObject) {
        try {
            val stage = token(event.optString("stage"), stages)
            val code = token(event.optString("code"), codes)
            val outcome = token(event.optString("outcome"), outcomes)
            val rawTime = event.optString("occurredAt")
            val timestamp = runCatching { Instant.parse(rawTime).toString() }.getOrDefault(Instant.EPOCH.toString())
            val entry = JSONObject()
                .put("schemaVersion", 1)
                .put("timestamp", timestamp)
                .put("stage", stage)
                .put("code", code)
                .put("outcome", outcome)
                .put("appVersion", runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown" }.getOrDefault("unknown"))
            listOf("traceId", "ownerFeatureId", "contributionId").forEach { key ->
                val value = event.optString(key, "")
                if (safeId.matches(value)) entry.put(key, value)
            }
            val version = event.optInt("contractVersion", 0)
            if (version > 0) entry.put("contractVersion", version)
            if (event.has("durationMs")) entry.put("durationMs", event.optLong("durationMs").coerceIn(0L, 86_400_000L))
            val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val entries = JSONArray(preferences.getString(KEY, "[]") ?: "[]")
            entries.put(entry)
            val bounded = JSONArray()
            val start = (entries.length() - MAX_ENTRIES).coerceAtLeast(0)
            for (index in start until entries.length()) bounded.put(entries.getJSONObject(index))
            preferences.edit().putString(KEY, bounded.toString()).apply()
        } catch (_: Exception) {
            // Diagnostic writes are best-effort and never affect the observed operation.
        }
    }

    fun export(context: Context): JSONArray = try {
        JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]")
    } catch (_: Exception) {
        JSONArray()
    }
}
