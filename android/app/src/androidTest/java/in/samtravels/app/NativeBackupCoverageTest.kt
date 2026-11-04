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
    @Test fun everyPhysicalRoomTableIsCoveredByManualAndScheduledSnapshots() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        try {
            NativeBackupCoverage.assertRoomSchemaCovered(database)
            assertEquals(setOf("platform-records"), NativeBackupCoverage.registeredParticipantIds())
            val cursor = database.openHelper.readableDatabase.query(
                "SELECT name FROM sqlite_master WHERE type='table' " +
                    "AND name NOT IN ('room_master_table', 'android_metadata') " +
                    "AND name NOT LIKE 'sqlite_%'",
            )
            val names = cursor.use {
                buildSet { while (it.moveToNext()) add(it.getString(0)) }
            }
            assertEquals(setOf("records"), names)
        } finally {
            database.close()
        }
    }
}
