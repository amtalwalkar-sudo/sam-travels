package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Stable semantic comparators shared by the populated cross-runtime lifecycle tests. */
internal object SharedBackupFixtureAssertions {
    fun canonicalParticipants(participants: JSONArray): List<String> =
        (0 until participants.length()).map { index ->
            val item = participants.getJSONObject(index)
            listOf(item.getString("id"), item.getString("featureId"),
                item.getInt("snapshotVersion").toString(), item.getString("restoreValidatorId")).joinToString("|")
        }.sorted()

    /**
     * Work/Log Book records carry runtime-local provenance and clock formatting.
     * Compare their portable workflow semantics while retaining every business
     * field, event identity, transition, revision, GPS fix and participant owner.
     */
    fun assertCanonicalRecordsEqual(label: String, expected: JSONArray, actual: JSONArray) {
        val expectedRows = canonicalRecords(expected).associateBy { it.substringBefore("|") + "|" + it.substringAfter("|").substringBefore("|") }
        val actualRows = canonicalRecords(actual).associateBy { it.substringBefore("|") + "|" + it.substringAfter("|").substringBefore("|") }
        val mismatches = (expectedRows.keys + actualRows.keys).toSortedSet()
            .filter { expectedRows[it] != actualRows[it] }
            .take(20)
            .map { key -> "$key expected=${expectedRows[key]?.take(350)} actual=${actualRows[key]?.take(350)}" }
        check(mismatches.isEmpty()) { "$label canonical record mismatch: ${mismatches.joinToString(" || ")}" }
    }

    fun canonicalRecords(records: JSONArray): List<String> =
        (0 until records.length()).map { index ->
            val row = records.getJSONObject(index)
            val participant = row.getString("participantId")
            val id = row.getString("id")
            val payload = JSONObject(row.getString("json"))
            var updatedAt = row.getString("updatedAt")
            when (participant) {
                "logbook-events" -> {
                    payload.remove("createdBy")
                    payload.optJSONObject("gps")?.let { gps ->
                        gps.put("provider", "geolocation")
                        normalizeInstant(gps, "fixAt")
                    }
                    normalizeInstant(payload, "committedAt")
                    updatedAt = epochMillis(updatedAt)
                }
                "work-driver-state" -> {
                    when {
                        id == "driver-state" -> {
                            payload.remove("id")
                            payload.optJSONObject("value")?.remove("shiftAuthor")
                            updatedAt = ""
                        }
                        id.startsWith("driver-intent:") -> {
                            payload.optJSONObject("command")?.let { normalizeInstant(it, "transitionAt") }
                            normalizeInstant(payload, "createdAt")
                            normalizeInstant(payload, "updatedAt")
                            updatedAt = epochMillis(updatedAt)
                        }
                        id.startsWith("driver-outbox:") -> {
                            normalizeInstant(payload, "createdAt")
                            updatedAt = epochMillis(updatedAt)
                        }
                    }
                }
            }
            listOf(participant, id, canonicalJson(payload),
                row.getInt("schemaVersion").toString(), updatedAt).joinToString("|")
        }.sorted()

    private fun normalizeInstant(value: JSONObject, key: String) {
        if (value.has(key) && !value.isNull(key)) value.put(key, epochMillis(value.getString(key)))
    }

    private fun epochMillis(value: String): String =
        runCatching { Instant.parse(value).toEpochMilli().toString() }.getOrDefault(value)

    private fun canonicalJson(value: Any?): String = when (value) {
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(prefix = "{", postfix = "}") {
            JSONObject.quote(it) + ":" + canonicalJson(value.get(it))
        }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") {
            canonicalJson(value.get(it))
        }
        JSONObject.NULL -> "null"
        is String -> JSONObject.quote(value)
        else -> value.toString()
    }
}
