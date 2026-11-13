package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WorkDailyBusinessKilometreStoreTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase() = db.close()

    @Test fun boundaryRotationIsRejectedWhileATripIsActive() {
        val current = JSONObject().put("state", "trip_active").put("activeTripId", "trip-active")
        val failure = runCatching {
            WorkDailyBusinessKilometreStore.rotate(
                db, current, JSONObject(), "rotation-event", java.time.Instant.now().toString(), JSONObject(),
            )
        }.exceptionOrNull()
        assertEquals("shift_rotation_during_active_trip", failure?.message)
    }
    @Test fun personalKilometresRemainSeparateFromBusinessKilometresInRoomProjection() {
        val startedAt = "2026-11-02T08:00:00.000Z"
        val now = "2026-11-02T10:00:00.000Z"
        val vehicleId = "feature:vehicle:MH01AB1234"
        val current = JSONObject().put("state", "shift_active").put("shiftId", "shift-personal")
            .put("shiftStartedAt", startedAt).put("shiftStartOdometerKm", 500)
            .put("shiftStartPersonalKm", 50)
            .put("shiftContext", JSONObject().put("schemaVersion", 1).put("driverId", "driver-1")
                .put("assignmentId", "assignment-1").put("vehicleId", vehicleId))
        val command = JSONObject().put("eventType", "shift_end").put("transitionAt", now)
            .put("odometer", JSONObject().put("schemaVersion", 1).put("readingKm", 600).put("businessKm", 100))
        WorkDailyBusinessKilometreStore.append(db, current, command, "shift-personal-end", now)
        val operationalDate = DriverWorkflowStore.operationalDateAt(startedAt)
        val id = "work:daily-business-km:" + java.net.URLEncoder.encode(vehicleId, "UTF-8") + ":" + operationalDate
        val data = JSONObject(db.records().get(id)!!.json).getJSONObject("data")
        val entry = data.getJSONArray("entries").getJSONObject(0)
        assertEquals(100, entry.getLong("businessKm"))
        assertEquals(50, entry.getLong("personalKm"))
        assertEquals(100, data.getLong("totalBusinessKm"))
    }

}
