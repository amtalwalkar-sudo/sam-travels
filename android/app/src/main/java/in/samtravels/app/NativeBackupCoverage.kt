package `in`.samtravels.app

/**
 * Android business data currently lives in one Room table of feature-owned
 * records. Both manual and headless scheduled backups must cover that table.
 * Inspect the actual SQLite schema so a future Room entity/table fails closed
 * before it can silently escape the snapshot.
 */
internal object NativeBackupCoverage {
    fun assertRoomSchemaCovered(database: LocalDatabase) {
        val cursor = database.openHelper.readableDatabase.query(
            "SELECT name FROM sqlite_master WHERE type='table' " +
                "AND name NOT IN ('room_master_table', 'android_metadata') " +
                "AND name NOT LIKE 'sqlite_%'",
        )
        val tables = cursor.use {
            buildSet {
                while (it.moveToNext()) add(it.getString(0))
            }
        }
        require(tables == setOf("records")) {
            "backup_room_table_registration_mismatch"
        }
    }
}
