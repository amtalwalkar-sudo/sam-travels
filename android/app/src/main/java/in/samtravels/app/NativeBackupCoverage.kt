package `in`.samtravels.app

import androidx.room.Database
import androidx.room.Entity

/**
 * Android business data currently lives in one Room table of feature-owned
 * records. Both manual and headless scheduled backups must cover that table.
 * A new Room entity fails closed until the backup format is deliberately
 * extended and this coverage contract is updated.
 */
internal object NativeBackupCoverage {
    fun assertRoomSchemaCovered() {
        val database = LocalDatabase::class.java.getAnnotation(Database::class.java)
            ?: error("backup_room_schema_unavailable")
        val tables = database.entities.mapNotNull { entity ->
            entity.java.getAnnotation(Entity::class.java)?.tableName
        }.toSet()
        require(tables == setOf("records") && tables.size == database.entities.size) {
            "backup_room_table_registration_mismatch"
        }
    }
}
