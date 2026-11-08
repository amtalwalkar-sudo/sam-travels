package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Schedules one durable, network-constrained drain; no periodic polling or foreground service. */
internal object TimelineEnrichmentScheduler {
    private const val UNIQUE_WORK = "sam-travels-timeline-enrichment"

    fun schedule(context: Context) {
        val request = OneTimeWorkRequestBuilder<TimelineEnrichmentWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.KEEP, request)
    }
}

/**
 * Background worker owns only derived Timeline enrichment records. It never reads or updates
 * driver event rows, and it exits without network traffic while the user's policy is disabled.
 */
class TimelineEnrichmentWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    private val db by lazy {
        Room.databaseBuilder(applicationContext, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .build()
    }

    override fun doWork(): Result {
        try {
            if (!internetAllowed()) return Result.success()
            val now = System.currentTimeMillis()
            val due = db.records().list().filter { row ->
                if (!row.id.startsWith(PREFIX)) return@filter false
                runCatching {
                    val envelope = JSONObject(row.json)
                    val data = envelope.getJSONObject("data")
                    val status = data.optString("status")
                    (status == "pending" || status == "network_disabled" ||
                        (status == "retry_wait" && (data.optString("nextAttemptAt").isBlank() ||
                            Instant.parse(data.getString("nextAttemptAt")).toEpochMilli() <= now)))
                }.getOrDefault(false)
            }.take(BATCH_LIMIT)

            var retryableFailure = false
            val hasDeferredRetry = db.records().list().any { row ->
                if (!row.id.startsWith(PREFIX)) return@any false
                runCatching {
                    val data = JSONObject(row.json).getJSONObject("data")
                    data.optString("status") == "retry_wait" &&
                        data.optString("nextAttemptAt").isNotBlank() &&
                        Instant.parse(data.getString("nextAttemptAt")).toEpochMilli() > now
                }.getOrDefault(false)
            }
            for (row in due) {
                if (!internetAllowed()) return Result.success()
                try {
                    val envelope = JSONObject(row.json)
                    val data = envelope.getJSONObject("data")
                    val label = reverse(data.getDouble("latitude"), data.getDouble("longitude"))
                    val lookedUpAt = Instant.now().toString()
                    data.put("status", if (label.isNullOrBlank()) "not_found" else "resolved")
                        .put("attempts", data.optInt("attempts") + 1)
                        .put("lookedUpAt", lookedUpAt)
                        .remove("nextAttemptAt").remove("lastFailure")
                    if (label.isNullOrBlank()) data.remove("label") else data.put("label", label)
                    envelope.put("revision", envelope.optInt("revision") + 1).put("updatedAt", lookedUpAt)
                    db.records().put(StoredRecord(row.id, envelope.toString(), row.schemaVersion, lookedUpAt))
                } catch (error: Exception) {
                    retryableFailure = true
                    val envelope = JSONObject(row.json)
                    val data = envelope.getJSONObject("data")
                    val attempts = data.optInt("attempts") + 1
                    val delay = (30_000L * (1L shl (attempts - 1).coerceIn(0, 10))).coerceAtMost(6 * 60 * 60 * 1000L)
                    val updatedAt = Instant.now().toString()
                    data.put("status", "retry_wait").put("attempts", attempts)
                        .put("lastFailure", "provider_unavailable")
                        .put("nextAttemptAt", Instant.ofEpochMilli(System.currentTimeMillis() + delay).toString())
                    envelope.put("revision", envelope.optInt("revision") + 1).put("updatedAt", updatedAt)
                    db.records().put(StoredRecord(row.id, envelope.toString(), row.schemaVersion, updatedAt))
                }
            }
            return if (retryableFailure || hasDeferredRetry) Result.retry() else Result.success()
        } catch (_: Exception) {
            return Result.retry()
        } finally {
            runCatching { db.close() }
        }
    }

    private fun internetAllowed(): Boolean {
        val row = db.records().get("network-policy") ?: return false
        return runCatching { JSONObject(row.json).optJSONObject("data")?.optBoolean("enabled", false) == true }
            .getOrDefault(false)
    }

    private fun reverse(latitude: Double, longitude: Double): String? {
        require(latitude.isFinite() && latitude in -90.0..90.0 &&
            longitude.isFinite() && longitude in -180.0..180.0) { "invalid_coordinates" }
        val connection = URL(PROXY_URL.trimEnd('/') + "/reverse-geocode").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Accept", "application/json")
        return try {
            connection.outputStream.use {
                it.write(JSONObject().put("latitude", latitude).put("longitude", longitude).toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            if (status == 429 || status >= 500) throw java.io.IOException("proxy_temporarily_unavailable")
            if (status !in 200..299) throw IllegalStateException("proxy_rejected_request")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            JSONObject(body).optString("label").takeIf { it.isNotBlank() }
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        private const val PREFIX = "timeline-enrichment:"
        private const val BATCH_LIMIT = 5
        // Public proxy endpoint only; the Geoapify API key remains exclusively in Cloudflare.
        private const val PROXY_URL = "https://sam-travels.amtalwalkar.workers.dev"
    }
}

/** Small Capacitor bridge: feature UI requests scheduling after it has persisted explicit consent. */
@com.getcapacitor.annotation.CapacitorPlugin(name = "TimelineEnrichment")
class TimelineEnrichmentPlugin : com.getcapacitor.Plugin() {
    @com.getcapacitor.PluginMethod
    fun schedule(call: com.getcapacitor.PluginCall) {
        TimelineEnrichmentScheduler.schedule(context)
        call.resolve()
    }
}
