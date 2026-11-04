package `in`.samtravels.app

/**
 * Native participants are discovered from Room's declared entity inventory.
 * Each entity owns its participant metadata; actual SQLite tables are compared
 * against the discovered adapters at every backup/restore boundary.
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

    /** Executable adapters; metadata without a serializer is not accepted. */
    private val snapshotAdapters: Map<String, Class<*>> = mapOf(
        "stored-records-json-v1" to StoredRecord::class.java,
    )

    fun discoverParticipants(): List<SnapshotParticipant> =
        discoverEntityTypes(LocalDatabase.backupEntityTypes)

    internal fun discoverEntityTypesForTest(entityTypes: List<Class<*>>): List<SnapshotParticipant> =
        discoverEntityTypes(entityTypes)

    private fun discoverEntityTypes(entityTypes: List<Class<*>>): List<SnapshotParticipant> {
        val participants = entityTypes.map { entityType ->
            val contract = entityType.getAnnotation(NativeBackupParticipant::class.java)
                ?: error("backup_room_entity_missing_participant:" + entityType.name)
            require(
                contract.id.isNotBlank() &&
                    contract.featureId.isNotBlank() &&
                    contract.roomTable.isNotBlank() &&
                    contract.snapshotVersion >= 1,
            ) { "backup_room_participant_contract_invalid:" + entityType.name }

            val adapterEntity = snapshotAdapters[contract.adapterId]
                ?: error("backup_room_snapshot_adapter_missing:" + contract.adapterId)
            require(adapterEntity == entityType) {
                "backup_room_snapshot_adapter_entity_mismatch:" + contract.id
            }
            SnapshotParticipant(
                id = contract.id,
                featureId = contract.featureId,
                snapshotVersion = contract.snapshotVersion,
                adapterId = contract.adapterId,
                entityType = entityType,
                roomTable = contract.roomTable,
            )
        }
        require(participants.map { it.id }.distinct().size == participants.size) {
            "backup_duplicate_participant_id"
        }
        require(participants.map { it.roomTable }.distinct().size == participants.size) {
            "backup_duplicate_table_participant"
        }
        return participants
    }

    fun registeredParticipantIds(): Set<String> =
        discoverParticipants().map { it.id }.toSet()

    fun assertRoomSchemaCovered(database: LocalDatabase) {
        val discovered = discoverParticipants()
        val cursor = database.openHelper.readableDatabase.query(
            "SELECT name FROM sqlite_master WHERE type='table' " +
                "AND name NOT IN ('room_master_table', 'android_metadata') " +
                "AND name NOT LIKE 'sqlite_%'",
        )
        val actualTables = cursor.use {
            buildSet {
                while (it.moveToNext()) add(it.getString(0))
            }
        }
        val registeredTables = discovered.map { it.roomTable }.toSet()
        require(actualTables == registeredTables) {
            "backup_room_table_registration_mismatch"
        }
    }
}
