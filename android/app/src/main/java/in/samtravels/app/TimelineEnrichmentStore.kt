package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant

/**
 * Persistence gateway for the Timeline enrichment feature's derived records.
 * WorkManager never reaches into Room DAOs directly.
 */
internal class TimelineEnrichmentStore(private val database: LocalDatabase) {
    fun listRecords(): List<StoredRecord> = database.records().list()

    fun getRecord(id: String): StoredRecord? = database.records().get(id)

    fun putRecord(row: StoredRecord) = database.records().put(row)

    fun internetAllowed(): Boolean {
        val row = getRecord("network-policy") ?: return false
        return runCatching {
            JSONObject(row.json).optJSONObject("data")?.optBoolean("enabled", false) == true
        }.getOrDefault(false)
    }

    fun markPendingAsNetworkDisabled() {
        listRecords().filter { it.id.startsWith(RECORD_PREFIX) }.forEach { row ->
            runCatching {
                val envelope = JSONObject(row.json)
                val data = envelope.getJSONObject("data")
                val status = data.optString("status")
                if (status == "pending" || status == "retry_wait") {
                    val updatedAt = Instant.now().toString()
                    data.put("status", "network_disabled")
                    data.remove("nextAttemptAt")
                    data.put("lastFailure", "network_disabled")
                    envelope.put("revision", envelope.optInt("revision") + 1).put("updatedAt", updatedAt)
                    putRecord(StoredRecord(row.id, envelope.toString(), row.schemaVersion, updatedAt))
                }
            }
        }
    }

    fun findCachedCoordinate(latitude: Double, longitude: Double, nowMs: Long): JSONObject? {
        val key = coordinateKey(latitude, longitude)
        return listRecords().asSequence()
            .filter { it.id.startsWith(RECORD_PREFIX) }
            .mapNotNull { row -> runCatching { JSONObject(row.json).getJSONObject("data") }.getOrNull() }
            .firstOrNull { data ->
                val status = data.optString("status")
                if (status != "resolved" && status != "not_found") return@firstOrNull false
                val lookedUpAt = runCatching { Instant.parse(data.getString("lookedUpAt")).toEpochMilli() }.getOrNull()
                    ?: return@firstOrNull false
                val ttl = if (status == "resolved") SUCCESS_CACHE_TTL_MILLIS else NEGATIVE_CACHE_TTL_MILLIS
                nowMs >= lookedUpAt && nowMs - lookedUpAt <= ttl &&
                    coordinateKey(data.optDouble("latitude"), data.optDouble("longitude")) == key
            }
            ?.let { JSONObject(it.toString()) }
    }

    private fun coordinateKey(latitude: Double, longitude: Double): String =
        String.format(java.util.Locale.US, "%.4f,%.4f", latitude, longitude)

    fun dueEnrichmentRows(nowMs: Long, limit: Int): Pair<List<StoredRecord>, Boolean> {
        val due = listRecords().filter { row ->
            if (!row.id.startsWith(RECORD_PREFIX)) return@filter false
            runCatching {
                val data = JSONObject(row.json).getJSONObject("data")
                val status = data.optString("status")
                status == "pending" || status == "network_disabled" ||
                    (status == "retry_wait" && (data.optString("nextAttemptAt").isBlank() ||
                        Instant.parse(data.getString("nextAttemptAt")).toEpochMilli() <= nowMs))
            }.getOrDefault(false)
        }
        return due.take(limit) to (due.size > limit)
    }

    fun hasDeferredRetry(nowMs: Long): Boolean = listRecords().any { row ->
        if (!row.id.startsWith(RECORD_PREFIX)) return@any false
        runCatching {
            val data = JSONObject(row.json).getJSONObject("data")
            data.optString("status") == "retry_wait" &&
                data.optString("nextAttemptAt").isNotBlank() &&
                Instant.parse(data.getString("nextAttemptAt")).toEpochMilli() > nowMs
        }.getOrDefault(false)
    }

    companion object {
        const val RECORD_PREFIX = "timeline-enrichment:"
        private const val SUCCESS_CACHE_TTL_MILLIS = 30L * 24 * 60 * 60 * 1000
        private const val NEGATIVE_CACHE_TTL_MILLIS = 60L * 60 * 1000
    }
}
