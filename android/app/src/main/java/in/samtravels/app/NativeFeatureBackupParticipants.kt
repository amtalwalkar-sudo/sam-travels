package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * Runtime registration for add-on-owned records stored in the shared Room
 * records table. Kept separate from the core snapshot coordinator so each
 * feature can contribute its own validator without growing the platform file.
 */
internal fun NativeBackupCoverage.registerFeatureRecordParticipant(
    id: String,
    featureId: String,
    snapshotVersion: Int,
    recordIdPrefix: String,
    validateRelationships: (ownedRecords: List<JSONObject>, allRecords: List<JSONObject>) -> Unit,
): AutoCloseable = synchronized(NativeBackupCoverage) {
    require(id.isNotBlank() && featureId.isNotBlank() && snapshotVersion >= 1) {
        "backup_feature_participant_contract_invalid"
    }
    require(recordIdPrefix.startsWith("feature:$featureId:")) {
        "backup_feature_record_namespace_invalid"
    }
    require(id !in dynamicFeatureParticipants && discoverParticipants().none { it.id == id }) {
        "backup_duplicate_participant_id"
    }
    require(dynamicFeatureRecordPrefixes.values.none { existing ->
        existing == recordIdPrefix || existing.startsWith(recordIdPrefix) || recordIdPrefix.startsWith(existing)
    }) { "backup_feature_record_namespace_overlap" }

    val featureAdapterId = "feature-records-json-v1:$id"
    val adapter = object : NativeBackupCoverage.SnapshotAdapter {
        override val adapterId = featureAdapterId
        override val entityType = StoredRecord::class.java
        override fun export(database: LocalDatabase, participantId: String, isInternal: (String) -> Boolean) =
            database.records().list().filter { !isInternal(it.id) && it.id.startsWith(recordIdPrefix) }.map { row ->
                JSONObject().put("id", row.id).put("json", row.json)
                    .put("schemaVersion", row.schemaVersion).put("updatedAt", row.updatedAt)
                    .put("participantId", participantId)
            }
        override fun validate(row: JSONObject) {
            NativeBackupCoverage.StoredRecordsAdapter.validate(row)
            require(row.optString("participantId") == id && row.optString("id").startsWith(recordIdPrefix)) {
                "backup_feature_record_owner_mismatch:$id"
            }
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(
                envelope.optString("id") == row.optString("id") &&
                    envelope.optInt("schemaVersion", -1) == row.optInt("schemaVersion", -2) &&
                    envelope.optString("updatedAt") == row.optString("updatedAt"),
            ) { "backup_record_storage_envelope_mismatch" }
        }
        override fun clear(database: LocalDatabase) {
            database.records().list().filter { it.id.startsWith(recordIdPrefix) }
                .forEach { database.records().remove(it.id) }
        }
        override fun restore(database: LocalDatabase, row: JSONObject) {
            validate(row)
            NativeBackupCoverage.StoredRecordsAdapter.restore(database, row)
        }
    }
    snapshotAdapters[featureAdapterId] = adapter
    dynamicFeatureRecordPrefixes[id] = recordIdPrefix
    dynamicFeatureRelationshipValidators[id] = validateRelationships
    dynamicFeatureParticipants[id] = NativeBackupCoverage.SnapshotParticipant(
        id, featureId, snapshotVersion, featureAdapterId, StoredRecord::class.java, "records",
    )
    AutoCloseable {
        synchronized(NativeBackupCoverage) {
            dynamicFeatureParticipants.remove(id)
            dynamicFeatureRecordPrefixes.remove(id)
            dynamicFeatureRelationshipValidators.remove(id)
            snapshotAdapters.remove(featureAdapterId)
        }
    }
}


/** Backward compatibility for snapshots created before a new empty feature participant existed. */
internal object NativeFeatureBackupManifestCompatibility {
    fun validate(incoming: JSONArray?, records: JSONArray?) {
        if (incoming == null) return
        val expected = NativeBackupCoverage.participantManifest()
        fun canonical(array: JSONArray): List<String> = (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            listOf(item.getString("id"), item.getString("featureId"),
                item.getInt("snapshotVersion").toString(), item.getString("adapterId"),
                item.getString("restoreValidatorId")).joinToString("|")
        }.sorted()
        if (canonical(incoming) == canonical(expected)) return
        val incomingIds = (0 until incoming.length()).map { incoming.getJSONObject(it).getString("id") }.toSet()
        val omitted = (0 until expected.length()).map { expected.getJSONObject(it) }
            .filter { it.getString("id") in setOf("business-settings-records", "vehicle-records", "driver-records", "compliance-records", "maintenance-records", "finance-records", "finance-payment-records", "finance-prepayment-records") && it.getString("id") !in incomingIds }
        val hasRecordsForOmitted = records?.let { rows ->
            omitted.any { participant ->
                val id = participant.getString("id")
                val featureId = participant.getString("featureId")
                val ownedPrefix = when (id) {
                    "finance-payment-records" -> "feature:finance:payments:"
                    "finance-prepayment-records" -> "feature:finance:prepayments:"
                    else -> if (featureId != "platform") "feature:$featureId:" else ""
                }
                (0 until rows.length()).any { index ->
                    val row = rows.optJSONObject(index) ?: return@any false
                    row.optString("participantId") == id ||
                        (ownedPrefix.isNotEmpty() && row.optString("id").startsWith(ownedPrefix))
                }
            }
        } ?: false
        val omittedIds = omitted.map { it.getString("id") }.toSet()
        val compatibleExpected = JSONArray()
        for (index in 0 until expected.length()) {
            val item = expected.getJSONObject(index)
            if (item.getString("id") !in omittedIds) compatibleExpected.put(JSONObject(item.toString()))
        }
        require(!hasRecordsForOmitted && canonical(incoming) == canonical(compatibleExpected)) {
            "backup_participant_manifest_mismatch"
        }
    }
}
