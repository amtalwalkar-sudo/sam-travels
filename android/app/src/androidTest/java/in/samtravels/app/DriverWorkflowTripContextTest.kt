package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverWorkflowTripContextTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(), LocalDatabase::class.java,
    ).allowMainThreadQueries().build()
    @After fun closeDatabase() = db.close()

    private fun command(id: String, type: String, prior: String, revision: Int) = JSONObject()
        .put("schemaVersion", 1).put("commandId", id).put("eventId", id).put("eventType", type)
        .put("originSurface", "native_overlay").put("transitionAt", java.time.Instant.now().toString())
        .put("expectedPriorState", prior).put("expectedRevision", revision).put("idempotencyKey", id)

    private fun gps() = JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
        .put("horizontalAccuracyM", 8.0).put("fixAt", java.time.Instant.now().toString())
        .put("provider", "android-test")

    private fun saveRecord(id: String, data: JSONObject) {
        val at = java.time.Instant.now().toString()
        val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", at).put("updatedAt", at).put("source", "android")
            .put("revision", 1).put("data", data)
        db.records().put(StoredRecord(id, envelope.toString(), 1, at))
    }

    private fun seedDriverContext() {
        val assignedAt = java.time.Instant.now().minusSeconds(60).toString()
        saveRecord("work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", "driver-17"))
        saveRecord("feature:driver-records:driver:driver-17", JSONObject()
            .put("schemaVersion", 1).put("driverId", "driver-17").put("name", "Test Driver")
            .put("lifecycleState", "active"))
        saveRecord("feature:driver-records:assignment:driver-17", JSONObject()
            .put("schemaVersion", 1).put("driverId", "driver-17")
            .put("assignments", JSONArray().put(JSONObject().put("assignmentId", "assignment-23")
                .put("vehicleId", "feature:vehicle:MH01AB1234").put("assignedAt", assignedAt))))
        saveRecord("feature:vehicle:MH01AB1234", JSONObject().put("schemaVersion", 1)
            .put("registrationNumber", "MH01AB1234").put("make", "Test").put("model", "Car")
            .put("vehicleType", "car").put("fuelType", "petrol").put("yearOfManufacture", 2022)
            .put("ownership", "owned").put("lifecycleState", "active"))
    }

    private fun startShift() {
        val shift = command("shift-for-trip", "shift_start", "idle", 0)
        DriverWorkflowStore.queue(db, shift)
        DriverWorkflowStore.complete(db, shift.getString("eventId"), gps())
    }

    @Test fun tripStartCapturesImmutableSelectedDriverAssignmentAndVehicle() {
        startShift()
        seedDriverContext()
        val trip = command("trip-with-context", "trip_start", "shift_active", 1)
        DriverWorkflowStore.queue(db, trip)
        DriverWorkflowStore.complete(db, trip.getString("eventId"), gps())
        val stored = JSONObject(db.logBookEvents().list().first { it.eventId == "trip-with-context" }.json)
        assertEquals("driver-17", stored.getJSONObject("driverContext").getString("driverId"))
        assertEquals("assignment-23", stored.getJSONObject("driverContext").getString("assignmentId"))
        assertEquals("feature:vehicle:MH01AB1234", stored.getJSONObject("driverContext").getString("vehicleId"))
        saveRecord("feature:driver-records:assignment:driver-17", JSONObject().put("schemaVersion", 1)
            .put("driverId", "driver-17").put("assignments", JSONArray().put(JSONObject()
                .put("assignmentId", "assignment-24").put("vehicleId", "feature:vehicle:MH02CD5678")
                .put("assignedAt", java.time.Instant.now().toString()))))
        val replayed = JSONObject(db.logBookEvents().list().first { it.eventId == "trip-with-context" }.json)
        assertEquals("assignment-23", replayed.getJSONObject("driverContext").getString("assignmentId"))
        assertEquals("feature:vehicle:MH01AB1234", replayed.getJSONObject("driverContext").getString("vehicleId"))
    }

    @Test fun tripStartWithoutSelectedDriverDoesNotCommitOrAdvanceRevision() {
        startShift()
        val trip = command("trip-without-driver", "trip_start", "shift_active", 1)
        DriverWorkflowStore.queue(db, trip)
        val error = runCatching { DriverWorkflowStore.complete(db, trip.getString("eventId"), gps()) }.exceptionOrNull()
        assertEquals("work_driver_not_selected", error?.message)
        assertEquals(1, DriverWorkflowStore.snapshot(db).getInt("revision"))
        assertEquals(1, db.logBookEvents().list().size)
        assertEquals("pending_location", JSONObject(db.records().get("driver-intent:trip-without-driver")!!.json)
            .getString("status"))
    }
}
