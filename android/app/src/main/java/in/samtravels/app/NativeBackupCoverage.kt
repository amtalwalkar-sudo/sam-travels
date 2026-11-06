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
            database.records().list().filterNot { isInternal(it.id) || isWorkRecord(it.id) }.map { row ->
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
            if (row.optString("participantId") == "platform-records") {
                RecordEnvelopeContract.validate(payload)
                require(row.optInt("schemaVersion", -1) == payload.optInt("schemaVersion", -2) &&
                    row.optString("updatedAt") == payload.optString("updatedAt") &&
                    payload.optString("id") == row.optString("id")) {
                    "backup_record_storage_envelope_mismatch"
                }
            }
        }
        override fun clear(database: LocalDatabase) {
            database.records().list().filterNot { isInternalRecord(it.id) || isWorkRecord(it.id) }
                .forEach { database.records().remove(it.id) }
        }
        override fun restore(database: LocalDatabase, row: JSONObject) {
            database.records().put(StoredRecord(row.getString("id"), row.getString("json"),
                row.getInt("schemaVersion"), row.getString("updatedAt")))
        }
    }

    private object WorkDriverRecordsAdapter : SnapshotAdapter {
        override val adapterId = "work-driver-records-json-v1"
        override val entityType = StoredRecord::class.java
        override fun export(database: LocalDatabase, participantId: String, isInternal: (String) -> Boolean) =
            database.records().list().filter { !isInternal(it.id) && isWorkRecord(it.id) }.map { row ->
                JSONObject().put("id", row.id).put("json", row.json)
                    .put("schemaVersion", row.schemaVersion).put("updatedAt", row.updatedAt)
                    .put("participantId", participantId)
            }
        override fun validate(row: JSONObject) {
            StoredRecordsAdapter.validate(row)
            val id = row.optString("id")
            val payload = JSONObject(row.getString("json"))
            when {
                id == "driver-state" -> DriverWorkflowContract.validateState(payload.optJSONObject("value") ?: error("invalid_driver_state"))
                id == "driver-intent:" + payload.optJSONObject("command")?.optString("eventId") -> DriverWorkflowContract.validateIntent(payload)
                id.startsWith("driver-outbox:") -> {
                    DriverWorkflowContract.validateOutbox(payload)
                    require(id == "driver-outbox:" + payload.optLong("revision", -1L)) { "driver_outbox_identity_mismatch" }
                }
                id == "legacy-driver-state" -> Unit // Preserved legacy Work payload; not interpreted as the current state contract.
                else -> error("backup_work_record_owner_mismatch")
            }
            require(isWorkRecord(id)) { "backup_work_record_owner_mismatch" }
        }
        override fun clear(database: LocalDatabase) {
            database.records().list().filter { isWorkRecord(it.id) }.forEach { database.records().remove(it.id) }
        }
        override fun restore(database: LocalDatabase, row: JSONObject) {
            require(isWorkRecord(row.optString("id"))) { "backup_work_record_owner_mismatch" }
            StoredRecordsAdapter.restore(database, row)
        }
    }

    private fun isWorkRecord(id: String): Boolean =
        id == "driver-state" || id == "legacy-driver-state" ||
            id.startsWith("driver-intent:") || id.startsWith("driver-outbox:")

    private fun isInternalRecord(id: String): Boolean =
        id.startsWith("__sam_travels_recovery_checkpoint__:") || id.startsWith("__sam_travels_recovery_journal__:")

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
            DriverWorkflowContract.validateStoredEvent(payload)
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
        StoredRecordsAdapter, WorkDriverRecordsAdapter, LogBookEventsAdapter,
    ).associateBy { it.adapterId }

    fun discoverParticipants(): List<SnapshotParticipant> = discoverEntityTypes(LocalDatabase.backupEntityTypes)
    internal fun discoverEntityTypesForTest(entityTypes: List<Class<*>>): List<SnapshotParticipant> =
        discoverEntityTypes(entityTypes)

    private fun discoverEntityTypes(entityTypes: List<Class<*>>): List<SnapshotParticipant> {
        val participants = entityTypes.flatMap { entityType ->
            val contracts = entityType.getAnnotationsByType(NativeBackupParticipant::class.java)
            require(contracts.isNotEmpty()) { "backup_room_entity_missing_participant:" + entityType.name }
            contracts.map { contract ->
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
        }
        require(participants.map { it.id }.distinct().size == participants.size) { "backup_duplicate_participant_id" }
        return participants
    }

    private fun adapter(participant: SnapshotParticipant) =
        snapshotAdapters[participant.adapterId] ?: error("backup_room_snapshot_adapter_missing:" + participant.adapterId)

    fun participantManifest(): JSONArray {
        val result = JSONArray()
        discoverParticipants().sortedBy { it.id }.forEach { participant ->
            result.put(JSONObject()
                .put("id", participant.id)
                .put("featureId", participant.featureId)
                .put("snapshotVersion", participant.snapshotVersion)
                .put("adapterId", participant.adapterId)
                .put("restoreValidatorId", participant.id + "-v1"))
        }
        return result
    }

    fun validateParticipantManifest(incoming: JSONArray?) {
        if (incoming == null) return // Legacy native snapshot lacked participant inventory.
        val expected = participantManifest()
        fun canonical(array: JSONArray): List<String> = (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            listOf(item.getString("id"), item.getString("featureId"),
                item.getInt("snapshotVersion").toString(), item.getString("adapterId"),
                item.getString("restoreValidatorId")).joinToString("|")
        }.sorted()
        require(canonical(incoming) == canonical(expected)) { "backup_participant_manifest_mismatch" }
    }

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
        validateBusinessRecords(result, requireExplicitOwnerTags = true)
        return result
    }

    private fun participantId(row: JSONObject, participants: List<SnapshotParticipant>): String {
        val id = row.optString("participantId").ifBlank {
            // Pre-participant snapshots contained only generic platform records.
            // The newly introduced feature-owned tables did not exist in that format.
            if (participants.any { it.id == "platform-records" }) "platform-records"
            else {
                require(participants.size == 1) { "backup_record_participant_missing" }
                participants.single().id
            }
        }
        require(participants.any { it.id == id }) { "backup_unknown_participant:" + id }
        return id
    }

    /** Convert pre-manifest snapshots from the old shared-records owner model. */
    fun normalizeLegacyRecords(records: JSONArray): JSONArray {
        val result = JSONArray()
        for (index in 0 until records.length()) {
            val row = JSONObject(records.getJSONObject(index).toString())
            val originalId = row.optString("id")
            when {
                originalId.startsWith("driver-event:") -> {
                    row.put("id", originalId.removePrefix("driver-event:"))
                    row.put("participantId", "logbook-events")
                }
                isWorkRecord(originalId) -> row.put("participantId", "work-driver-state")
                row.optString("participantId") == "logbook-events" -> Unit
                else -> row.put("participantId", "platform-records")
            }
            result.put(row)
        }
        return result
    }

    fun validateBusinessRecords(records: JSONArray, requireExplicitOwnerTags: Boolean = false) {
        val participants = discoverParticipants()
        require(participants.isNotEmpty()) { "backup_no_room_participants" }
        val byId = participants.associateBy { it.id }
        val seen = mutableSetOf<String>()
        for (index in 0 until records.length()) {
            val row = records.optJSONObject(index) ?: error("backup_invalid_record")
            require(!requireExplicitOwnerTags || row.has("participantId")) { "backup_record_participant_missing" }
            val owner = participantId(row, participants)
            if (row.has("participantId")) {
                when (owner) {
                    "platform-records" -> require(!isWorkRecord(row.optString("id")) && !isInternalRecord(row.optString("id"))) { "backup_platform_record_owner_mismatch" }
                    "work-driver-state" -> require(isWorkRecord(row.optString("id"))) { "backup_work_record_owner_mismatch" }
                }
            }
            require(seen.add(owner + ":" + row.optString("id"))) { "backup_duplicate_participant_record_id" }
            val participant = byId.getValue(owner)
            require(row.optInt("schemaVersion", 0) == participant.snapshotVersion) {
                "backup_participant_snapshot_version_mismatch:" + owner
            }
            adapter(participant).validate(row)
        }
    }

    /** Caller owns the surrounding Room transaction. */
    fun replaceBusinessRecords(database: LocalDatabase, records: JSONArray) {
        validateBusinessRecords(records)
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


/** Durable Room restore journal and startup recovery for unverified replacements. */
internal object NativeBackupRecovery {
    const val CHECKPOINT_PREFIX = "__sam_travels_recovery_checkpoint__:"
    const val JOURNAL_PREFIX = "__sam_travels_recovery_journal__:"

    fun isInternalRecord(id: String): Boolean =
        id.startsWith(CHECKPOINT_PREFIX) || id.startsWith(JOURNAL_PREFIX)

    fun rollback(database: LocalDatabase, id: String) {
        val checkpointRow = database.records().get(CHECKPOINT_PREFIX + id)
            ?: error("recovery_checkpoint_missing")
        val journalRow = database.records().get(JOURNAL_PREFIX + id)
            ?: error("recovery_journal_missing")
        val journal = JSONObject(journalRow.json)
        require(
            journal.optString("status") == "checkpoint" ||
                journal.optString("status") == "restored_unverified" ||
                journal.optString("status") == "rollback_complete",
        ) { "checkpoint_not_rollback_eligible" }
        val oldRecords = JSONObject(checkpointRow.json).getJSONArray("records")

        database.runInTransaction {
            NativeBackupCoverage.replaceBusinessRecords(database, oldRecords)
            journal.put("status", "rollback_complete")
            database.records().put(
                StoredRecord(JOURNAL_PREFIX + id, journal.toString(), 1, java.time.Instant.now().toString()),
            )
        }

        val restored = NativeBackupCoverage.exportBusinessRecords(database, ::isInternalRecord)
        require(canonicalRecords(restored) == canonicalRecords(oldRecords)) {
            "checkpoint_rollback_integrity_mismatch"
        }
    }

    fun recoverPending(database: LocalDatabase): List<String> {
        val pending = database.records().list()
            .filter { it.id.startsWith(JOURNAL_PREFIX) }
            .map { JSONObject(it.json) }
            .filter {
                it.optString("status") == "checkpoint" ||
                    it.optString("status") == "restored_unverified"
            }
            .sortedByDescending { it.optString("createdAt") }
        val recovered = mutableListOf<String>()
        pending.forEach { journal ->
            val id = journal.getString("id")
            rollback(database, id)
            recovered.add(id)
        }
        return recovered
    }

    private fun canonicalRecords(records: JSONArray): Map<String, Triple<String, Int, String>> =
        (0 until records.length()).associate { index ->
            val row = records.getJSONObject(index)
            val key = row.getString("participantId") + ":" + row.getString("id")
            key to Triple(row.getString("json"), row.getInt("schemaVersion"), row.getString("updatedAt"))
        }
}
