package `in`.samtravels.app

import android.content.Context
import android.content.Intent
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

    fun schedule(context: Context, delayMillis: Long = 0L, appendAfterCurrent: Boolean = false) {
        val request = OneTimeWorkRequestBuilder<TimelineEnrichmentWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(delayMillis.coerceAtLeast(0L), TimeUnit.MILLISECONDS)
            .build()
        val policy = if (appendAfterCurrent) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, policy, request)
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
            .enableMultiInstanceInvalidation()
            .build()
    }
    private val store by lazy { TimelineEnrichmentStore(db) }

    override fun doWork(): Result {
        try {
            if (!store.internetAllowed()) { store.markPendingAsNetworkDisabled(); notifyEnrichmentChanged(); return Result.success() }
            val now = System.currentTimeMillis()
            val (due, hasMoreDue) = store.dueEnrichmentRows(now, BATCH_LIMIT)

            
            for (row in due) {
                if (!store.internetAllowed()) { store.markPendingAsNetworkDisabled(); notifyEnrichmentChanged(); return Result.success() }
                try {
                    val envelope = JSONObject(row.json)
                    val data = envelope.getJSONObject("data")
                    val cached = store.findCachedCoordinate(
                        data.getDouble("latitude"), data.getDouble("longitude"), System.currentTimeMillis(),
                    )
                    val label = if (cached != null) cached.optString("label").takeIf { it.isNotBlank() }
                        else reverse(data.getDouble("latitude"), data.getDouble("longitude"))
                    if (!store.internetAllowed()) {
                        store.markPendingAsNetworkDisabled()
                        notifyEnrichmentChanged()
                        return Result.success()
                    }
                    val lookedUpAt = cached?.optString("lookedUpAt")?.takeIf { it.isNotBlank() }
                        ?: Instant.now().toString()
                    data.put("status", if (label.isNullOrBlank()) "not_found" else "resolved")
                        .put("attempts", data.optInt("attempts") + 1)
                        .put("lookedUpAt", lookedUpAt)
                    data.remove("nextAttemptAt")
                    data.remove("lastFailure")
                    if (label.isNullOrBlank()) data.remove("label") else data.put("label", label)
                    envelope.put("revision", envelope.optInt("revision") + 1).put("updatedAt", lookedUpAt)
                    store.putRecord(StoredRecord(row.id, envelope.toString(), row.schemaVersion, lookedUpAt))
                    notifyEnrichmentChanged()
                } catch (error: Exception) {
                    val envelope = JSONObject(row.json)
                    val data = envelope.getJSONObject("data")
                    val attempts = data.optInt("attempts") + 1
                    val delay = (30_000L * (1L shl (attempts - 1).coerceIn(0, 10))).coerceAtMost(6 * 60 * 60 * 1000L)
                    val updatedAt = Instant.now().toString()
                    data.put("status", "retry_wait").put("attempts", attempts)
                        .put("lastFailure", "provider_unavailable")
                        .put("nextAttemptAt", Instant.ofEpochMilli(System.currentTimeMillis() + delay).toString())
                    envelope.put("revision", envelope.optInt("revision") + 1).put("updatedAt", updatedAt)
                    store.putRecord(StoredRecord(row.id, envelope.toString(), row.schemaVersion, updatedAt))
                    notifyEnrichmentChanged()
                }
            }
            // Schedule exactly when the next durable item is due. A full batch is
            // continued immediately; transient failures wait for their persisted backoff.
            store.nextWorkDelayMillis(System.currentTimeMillis())?.let { delay ->
                TimelineEnrichmentScheduler.schedule(applicationContext, delay, appendAfterCurrent = true)
            }
            return Result.success()
        } catch (_: Exception) {
            return Result.retry()
        } finally {
            runCatching { db.close() }
        }
    }

    private fun notifyEnrichmentChanged() {
        applicationContext.sendBroadcast(Intent(TimelineEnrichmentPlugin.ACTION_CHANGED)
            .setPackage(applicationContext.packageName))
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
        // Native app requests use the already-allowlisted Capacitor origin.
        connection.setRequestProperty("Origin", "https://localhost")
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
        private const val BATCH_LIMIT = 5
        // Public proxy endpoint only; the Geoapify API key remains exclusively in Cloudflare.
        private const val PROXY_URL = "https://sam-travels.amtalwalkar.workers.dev"
    }
}
