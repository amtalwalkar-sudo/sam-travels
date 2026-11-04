package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class NativeBackupCoverageTest {
    @Test fun discoversDeclaredRoomEntitiesAndCoversEveryPhysicalTable() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        try {
            NativeBackupCoverage.assertRoomSchemaCovered(database)
            val participants = NativeBackupCoverage.discoverParticipants()
            assertEquals(setOf("platform-records"), participants.map { it.id }.toSet())
            assertEquals(setOf("records"), participants.map { it.roomTable }.toSet())
            assertEquals("stored-records-json-v1", participants.single().adapterId)
            assertEquals(setOf("platform-records"), NativeBackupCoverage.registeredParticipantIds())
        } finally {
            database.close()
        }
    }

    @Test fun failsClosedWhenARoomEntityHasNoParticipantContract() {
        val failure = runCatching {
            NativeBackupCoverage.discoverEntityTypesForTest(listOf(UnregisteredRoomEntity::class.java))
        }.exceptionOrNull()
        assertEquals(true, failure?.message?.startsWith("backup_room_entity_missing_participant:"))
    }

    @Test fun failsClosedWhenParticipantHasNoExecutableSnapshotAdapter() {
        val failure = runCatching {
            NativeBackupCoverage.discoverEntityTypesForTest(listOf(UnsupportedAdapterEntity::class.java))
        }.exceptionOrNull()
        assertEquals("backup_room_snapshot_adapter_missing:unimplemented-adapter", failure?.message)
    }

    class UnregisteredRoomEntity

    @NativeBackupParticipant(
        id = "future-feature",
        featureId = "future-feature",
        roomTable = "future_records",
        snapshotVersion = 1,
        adapterId = "unimplemented-adapter",
    )
    class UnsupportedAdapterEntity
}
