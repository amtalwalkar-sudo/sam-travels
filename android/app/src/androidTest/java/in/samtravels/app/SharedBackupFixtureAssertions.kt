package `in`.samtravels.app

import org.json.JSONArray

/** Stable semantic comparators shared by the populated cross-runtime lifecycle tests. */
internal object SharedBackupFixtureAssertions {
    fun canonicalParticipants(participants: JSONArray): List<String> =
        (0 until participants.length()).map { index ->
            val item = participants.getJSONObject(index)
            listOf(item.getString("id"), item.getString("featureId"),
                item.getInt("snapshotVersion").toString(), item.getString("restoreValidatorId")).joinToString("|")
        }.sorted()

    fun canonicalRecords(records: JSONArray): List<String> =
        (0 until records.length()).map { index ->
            val row = records.getJSONObject(index)
            listOf(row.getString("participantId"), row.getString("id"), row.getString("json"),
                row.getInt("schemaVersion").toString(), row.getString("updatedAt")).joinToString("|")
        }.sorted()

}
