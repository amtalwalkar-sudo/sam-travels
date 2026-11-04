package `in`.samtravels.app

import androidx.room.Database
import androidx.room.Entity
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeBackupCoverageTest {
    @Test fun everyRoomEntityIsCoveredByTheRecordBasedBusinessSnapshot() {
        val database = LocalDatabase::class.java.getAnnotation(Database::class.java)
            ?: throw AssertionError("Room database annotation missing")
        val tableNames = database.entities.mapNotNull { entity ->
            entity.java.getAnnotation(Entity::class.java)?.tableName
        }.toSet()

        // Native backup exports every non-internal StoredRecord from this table.
        // Adding another Room table must update the snapshot contract and this gate.
        assertEquals(setOf("records"), tableNames)
        assertEquals(database.entities.size, tableNames.size)
    }
}
