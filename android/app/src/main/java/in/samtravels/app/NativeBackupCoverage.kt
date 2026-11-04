package `in`.samtravels.app

import androidx.room.Database
import androidx.room.RoomDatabase

/**
 * Discovers native backup participants from the entity list Room compiles into
 * LocalDatabase. No parallel hand-maintained participant/table list is kept.
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

    /**
     * Adapter IDs are executable serialization contracts. Adding a Room entity
     * requires a real adapter, not merely metadata that makes coverage appear green.
     */
    private val snapshotAdapters: Map<String, Class<*>> = mapOf(
        "stored-records-json-v1" to StoredRecord::class.java,
    )

    fun discoverParticipants(
        databaseType: Class<out RoomDatabase> = LocalDatabase::class.java,
    ): List<SnapshotParticipant> {
        val database = databaseType.getAnnotation(Database::class.java)
            ?: error("backup_room_database_annotation_missing")
        val participants = database.entities.map { entityType ->
            val contract = entityType.getAnnotation(NativeBackupParticipant::class.java)
                ?: error("backup_room_entity_missing_participant:" + entityType.name)
            require(contract.id.isNotBlank() && contract.featureId.isNotBlank()) {
                "backup_room_participant_identity_invalid:" + entityType.name
            }
            require(contract.snapshotVersion >= 1) {
                "backup_room_participant_version_invalid:" + contract.id
            }
            val adapterEntity = snapshotAdapters[contract.adapterId]
                ?: error("backup_room_snapshot_adapter_missing:" + contract.adapterId)
            require(adapterEntity == entityType) {
                "backup_room_snapshot_adapter_entity_mismatch:" + contract.id
            }
            val roomEntity = entityType.getAnnotation(androidx.room.Entity::class.java)
                ?: error("backup_room_entity_annotation_missing:" + entityType.name)
            val tableName = roomEntity.tableName.takeIf { it.isNotBlank() }
                ?: entityType.simpleName
            SnapshotParticipant(
                id = contract.id,
                featureId = contract.featureId,
                snapshotVersion = contract.snapshotVersion,
                adapterId = contract.adapterId,
                entityType = entityType,
                roomTable = tableName,
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

    internal fun discoverEntityTypesForTest(entityTypes: List<Class<*>>): List<SnapshotParticipant> =
        discoverEntityTypes(entityTypes)

    private fun discoverEntityTypes(entityTypes: List<Class<*>>): List<SnapshotParticipant> {
        val participants = entityTypes.map { entityType ->
            val contract = entityType.getAnnotation(NativeBackupParticipant::class.java)
                ?: error("backup_room_entity_missing_participant:" + entityType.name)
            require(contract.id.isNotBlank() && contract.featureId.isNotBlank()) {
                "backup_room_participant_identity_invalid:" + entityType.name
            }
            require(contract.snapshotVersion >= 1) {
                "backup_room_participant_version_invalid:" + contract.id
            }
            val adapterEntity = snapshotAdapters[contract.adapterId]
                ?: error("backup_room_snapshot_adapter_missing:" + contract.adapterId)
            require(adapterEntity == entityType) {
                "backup_room_snapshot_adapter_entity_mismatch:" + contract.id
            }
            val roomEntity = entityType.getAnnotation(androidx.room.Entity::class.java)
                ?: error("backup_room_entity_annotation_missing:" + entityType.name)
            val tableName = roomEntity.tableName.takeIf { it.isNotBlank() }
                ?: entityType.simpleName
            SnapshotParticipant(contract.id, contract.featureId, contract.snapshotVersion, contract.adapterId, entityType, tableName)
        }
        require(participants.map { it.id }.distinct().size == participants.size) { "backup_duplicate_participant_id" }
        require(participants.map { it.roomTable }.distinct().size == participants.size) { "backup_duplicate_table_participant" }
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
