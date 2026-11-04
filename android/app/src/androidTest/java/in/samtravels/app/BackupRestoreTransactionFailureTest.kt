package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BackupRestoreTransactionFailureTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase() = db.close()

    @Test fun injectedFailureDuringReplacementRollsBackTheRoomTransaction() {
        val before = StoredRecord(
            id = "business-record-before",
            json = "{\"value\":\"preserve-me\"}",
            schemaVersion = 1,
            updatedAt = "2026-11-04T00:00:00.000Z",
        )
        db.records().put(before)
        val logBookEvent = LogBookEventRecord("event-before", """{"eventId":"event-before","kind":"trip_completed"}""", 1, before.updatedAt)
        db.logBookEvents().put(logBookEvent)

        var injected = false
        try {
            db.runInTransaction {
                db.records().remove(before.id)
                db.logBookEvents().clear()
                // Simulate an interruption/failure between destructive replacement steps.
                throw IllegalStateException("injected_restore_replacement_failure")
            }
        } catch (error: IllegalStateException) {
            injected = error.message == "injected_restore_replacement_failure"
        }

        assertEquals(true, injected)
        assertNotNull("Room must roll back the deletion after the injected failure", db.records().get(before.id))
        assertEquals(before, db.records().get(before.id))
        assertEquals(listOf(logBookEvent), db.logBookEvents().list())
    }
}
