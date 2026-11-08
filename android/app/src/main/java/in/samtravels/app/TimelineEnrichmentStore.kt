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
    }
}
