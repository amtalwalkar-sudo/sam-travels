package `in`.samtravels.app

/**
 * Android feature-owned business records currently share one Room table.
 * The participant id is intentionally aligned with the browser adapter's
 * platform-records participant; Work state is stored as records in this table.
 */
internal object NativeBackupCoverage {
    private data class SnapshotParticipant(
        val id: String,
        val roomTables: Set<String>,
    )

    private val participants = listOf(
        SnapshotParticipant(
            id = "platform-records",
            roomTables = setOf("records"),
        ),
    )

    fun registeredParticipantIds(): Set<String> = participants.map { it.id }.toSet()

    fun assertRoomSchemaCovered(database: LocalDatabase) {
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
        val registeredTables = participants.flatMap { it.roomTables }
        require(participants.map { it.id }.distinct().size == participants.size) {
            "backup_duplicate_participant_id"
        }
        require(registeredTables.distinct().size == registeredTables.size) {
            "backup_duplicate_table_participant"
        }
        require(actualTables == registeredTables.toSet()) {
            "backup_room_table_registration_mismatch"
        }
    }
}
