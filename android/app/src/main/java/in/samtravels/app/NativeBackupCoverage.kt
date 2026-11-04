package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * Executable, feature-owned Room snapshot adapters. Participant metadata is
 * only accepted when a matching adapter can export, validate, clear and restore
 * that entity. Adding a Room entity without all four operations fails closed.
 */
internal object NativeBackupCoverage {
    data class SnapshotParticipant(
        val id: String,
        val featureId: String,
        val snapshotVersion: Int,
        val adapterId: String,
        val entityType: Class<*>,
        val roomTable: String,
    )

    private interface SnapshotAdapter {
        val adapterId: String
        val entityType: Class<*>
        fun export(database: LocalDatabase, participantId: String, isInternal: (String) -> Boolean): List<JSONObject>
        fun validate(row: JSONObject)
        fun clear(database: LocalDatabase)
        fun restore(database: LocalDatabase, row: JSONObject)
    }

    private object StoredRecordsAdapter : SnapshotAdapter {
        override val adapterId = "stored-records-json-v1"
        override val entityType = StoredRecord::class.java
        override fun export(database: LocalDatabase, participantId: String, isInternal: (String) -> Boolean) =
            database.records().list().filterNot { isInternal(it.id) }.map { row ->
                JSONObject().put("id", row.id).put("json", row.json)
                    .put("schemaVersion", row.schemaVersion).put("updatedAt", row.updatedAt)
                    .put("participantId", participantId)
            }
        override fun validate(row: JSONObject) {
            require(row.optString("id").isNotBlank() && row.optString("json").isNotBlank() &&
                row.optInt("schemaVersion", 0) >= 1 && row.optString("updatedAt").isNotBlank()) {
                "backup_invalid_record_envelope"
            }
            val payload = JSONObject(row.getString("json"))
            if (payload.has("id")) require(payload.optString("id") == row.optString("id")) {
                "backup_record_identity_mismatch"
            }
        }
        override fun clear(database: LocalDatabase) {
            database.records().list().filterNot { it.id.startsWith("__sam_travels_recovery_checkpoint__:") ||
                it.id.startsWith("__sam_travels_recovery_journal__:") }.forEach { database.records().remove(it.id) }
        }
        override fun restore(database: LocalDatabase, row: JSONObject) {
            database.records().put(StoredRecord(row.getString("id"), row.getString("json"),
                row.getInt("schemaVersion"), row.getString("updatedAt")))
        }
    }

    /** Log Book owns a separate durable Room table, written with the Work event transaction. */
    private object LogBookEventsAdapter : SnapshotAdapter {
        override val adapterId = "logbook-events-json-v1"
        override val entityType = LogBookEventRecord::class.java
        override fun export(database: LocalDatabase, participantId: String, isInternal: (String) -> Boolean) =
            database.logBookEvents().list().map { row ->
                JSONObject().put("id", row.eventId).put("json", row.json)
                    .put("schemaVersion", row.schemaVersion).put("updatedAt", row.updatedAt)
                    .put("participantId", participantId)
            }
        override fun validate(row: JSONObject) {
            require(row.optString("id").isNotBlank() && row.optString("json").isNotBlank() &&
                row.optInt("schemaVersion", 0) >= 1 && row.optString("updatedAt").isNotBlank()) {
                "backup_invalid_logbook_event_envelope"
            }
            val payload = JSONObject(row.getString("json"))
            require(payload.optString("eventId") == row.optString("id")) {
                "backup_logbook_event_identity_mismatch"
            }
        }
        override fun clear(database: LocalDatabase) = database.logBookEvents().clear()
        override fun restore(database: LocalDatabase, row: JSONObject) {
            database.logBookEvents().put(LogBookEventRecord(row.getString("id"), row.getString("json"),
                row.getInt("schemaVersion"), row.getString("updatedAt")))
        }
    }

    private val snapshotAdapters: Map<String, SnapshotAdapter> = listOf(
        StoredRecordsAdapter, LogBookEventsAdapter,
    ).associateBy { it.adapterId }

    fun discoverParticipants(): List<SnapshotParticipant> = discoverEntityTypes(LocalDatabase.backupEntityTypes)
    internal fun discoverEntityTypesForTest(entityTypes: List<Class<*>>): List<SnapshotParticipant> =
        discoverEntityTypes(entityTypes)

    private fun discoverEntityTypes(entityTypes: List<Class<*>>): List<SnapshotParticipant> {
        val participants = entityTypes.map { entityType ->
            val contract = entityType.getAnnotation(NativeBackupParticipant::class.java)
                ?: error("backup_room_entity_missing_participant:" + entityType.name)
            require(contract.id.isNotBlank() && contract.featureId.isNotBlank() &&
                contract.roomTable.isNotBlank() && contract.snapshotVersion >= 1) {
                "backup_room_participant_contract_invalid:" + entityType.name
            }
            val adapter = snapshotAdapters[contract.adapterId]
                ?: error("backup_room_snapshot_adapter_missing:" + contract.adapterId)
            require(adapter.entityType == entityType) {
                "backup_room_snapshot_adapter_entity_mismatch:" + contract.id
            }
            SnapshotParticipant(contract.id, contract.featureId, contract.snapshotVersion,
                contract.adapterId, entityType, contract.roomTable)
        }
        require(participants.map { it.id }.distinct().size == participants.size) { "backup_duplicate_participant_id" }
        require(participants.map { it.roomTable }.distinct().size == participants.size) { "backup_duplicate_table_participant" }
        return participants
    }

    private fun adapter(participant: SnapshotParticipant) =
        snapshotAdapters[participant.adapterId] ?: error("backup_room_snapshot_adapter_missing:" + participant.adapterId)

    fun registeredParticipantIds(): Set<String> = discoverParticipants().map { it.id }.toSet()

    fun assertRoomSchemaCovered(database: LocalDatabase) {
        val discovered = discoverParticipants()
        val cursor = database.openHelper.readableDatabase.query(
            "SELECT name FROM sqlite_master WHERE type='table' " +
                "AND name NOT IN ('room_master_table', 'android_metadata') AND name NOT LIKE 'sqlite_%'",
        )
        val actualTables = cursor.use { c -> buildSet { while (c.moveToNext()) add(c.getString(0)) } }
        require(actualTables == discovered.map { it.roomTable }.toSet()) {
            "backup_room_table_registration_mismatch"
        }
    }

    fun exportBusinessRecords(database: LocalDatabase, isInternal: (String) -> Boolean): JSONArray {
        assertRoomSchemaCovered(database)
        val result = JSONArray()
        discoverParticipants().forEach { participant ->
            adapter(participant).export(database, participant.id, isInternal).forEach { row -> result.put(row) }
        }
        return result
    }

    private fun participantId(row: JSONObject, participants: List<SnapshotParticipant>): String {
        val id = row.optString("participantId").ifBlank {
            require(participants.size == 1) { "backup_record_participant_missing" }
            participants.single().id
        }
        require(participants.any { it.id == id }) { "backup_unknown_participant:" + id }
        return id
    }

    fun validateBusinessRecords(records: JSONArray) {
        val participants = discoverParticipants()
        require(participants.isNotEmpty()) { "backup_no_room_participants" }
        val byId = participants.associateBy { it.id }
        val seen = mutableSetOf<String>()
        for (index in 0 until records.length()) {
            val row = records.optJSONObject(index) ?: error("backup_invalid_record")
            val owner = participantId(row, participants)
            require(seen.add(owner + ":" + row.optString("id"))) { "backup_duplicate_participant_record_id" }
            adapter(byId.getValue(owner)).validate(row)
        }
    }

    /** Caller owns the surrounding Room transaction. */
    fun replaceBusinessRecords(database: LocalDatabase, records: JSONArray) {
        val participants = discoverParticipants()
        val byId = participants.associateBy { it.id }
        participants.forEach { adapter(it).clear(database) }
        for (index in 0 until records.length()) {
            val row = records.getJSONObject(index)
            val owner = participantId(row, participants)
            adapter(byId.getValue(owner)).restore(database, row)
        }
    }
}
