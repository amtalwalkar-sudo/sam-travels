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
            .map { key -> "$key expected=${expectedRows[key]?.take(2000)} actual=${actualRows[key]?.take(2000)}" }
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
                "platform-records" -> {
                    if (id.startsWith("work:trip-financial-obligation:")) {
                        // Browser and Room may serialize the same ISO instant with
                        // different fractional-second precision. Normalize those
                        // semantic timestamps; submission/update clocks remain local.
                        payload.put("source", "integration")
                        normalizeInstant(payload, "createdAt")
                        payload.optJSONObject("data")?.let { data ->
                            normalizeInstant(data, "createdAt")
                            normalizeRuntimeTimestamp(data, "submittedAt")
                        }
                        updatedAt = "<runtime-local>"
                    } else if (id.startsWith("__sam_travels_form_working_copy__:")) {
                        payload.put("source", "integration")
                        normalizeRuntimeTimestamp(payload, "createdAt")
                        normalizeRuntimeTimestamp(payload, "updatedAt")
                        payload.optJSONObject("data")?.let { data ->
                            normalizeRuntimeTimestamp(data, "updatedAt")
                            data.optJSONObject("submission")?.let { normalizeRuntimeTimestamp(it, "submittedAt") }
                        }
                        updatedAt = "<runtime-local>"
                    }
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
                            // Recovery may refresh the intent's operational
                            // update clock. Its command, creation time, status,
                            // reason and retry semantics remain portable.
                            payload.remove("updatedAt")
                            updatedAt = ""
                        }
                        id.startsWith("driver-outbox:") -> {
                            normalizeInstant(payload, "createdAt")
                            // Room's wrapper timestamp is local persistence
                            // metadata; delivery state and payload are portable.
                            updatedAt = ""
                        }
                    }
                }
            }
            listOf(participant, id, canonicalJson(payload),
                row.getInt("schemaVersion").toString(), updatedAt).joinToString("|")
        }.sorted()

    private fun normalizeInstant(value: JSONObject, key: String) {
        if (value.has(key) && !value.isNull(key)) value.put(key, epochMillis(value.get(key).toString()))
    }

    private fun normalizeRuntimeTimestamp(value: JSONObject, key: String) {
        if (value.has(key) && !value.isNull(key)) value.put(key, "<runtime-local>")
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
