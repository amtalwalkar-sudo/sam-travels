package `in`.samtravels.app

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
    validateRelationships: (List<JSONObject>) -> Unit,
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
        }
        override fun clear(database: LocalDatabase) {
            database.records().list().filter { it.id.startsWith(recordIdPrefix) }
                .forEach { database.records().remove(it.id) }
        }
        override fun restore(database: LocalDatabase, row: JSONObject) {
            require(row.optString("participantId") == id && row.optString("id").startsWith(recordIdPrefix)) {
                "backup_feature_record_owner_mismatch:$id"
            }
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
