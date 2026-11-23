package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject

/** Fills gaps when a feature participant's adapter snapshot misses a shared Room record. */
internal object NativeBackupFeatureRecordExport {
    fun appendMissingRegisteredRecords(
        database: LocalDatabase,
        isInternal: (String) -> Boolean,
        result: JSONArray,
    ) {
        val exported = (0 until result.length()).map { index ->
            val row = result.getJSONObject(index)
            row.optString("participantId") + ":" + row.optString("id")
        }.toSet()
        NativeBackupCoverage.dynamicFeatureRecordPrefixes.forEach { (participantId, prefix) ->
            database.records().list()
                .filter { !isInternal(it.id) && it.id.startsWith(prefix) &&
                    (participantId + ":" + it.id) !in exported }
                .forEach { row ->
                    result.put(JSONObject().put("id", row.id).put("json", row.json)
                        .put("schemaVersion", row.schemaVersion).put("updatedAt", row.updatedAt)
                        .put("participantId", participantId))
                }
        }
    }
}
