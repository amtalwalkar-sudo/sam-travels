package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class DriverWorkflowIdentityAttributionTest {
    private fun command(id: String) = JSONObject().put("schemaVersion", 1).put("commandId", id)
        .put("eventId", id).put("eventType", "shift_start").put("originSurface", "native_overlay")
        .put("transitionAt", java.time.Instant.now().toString()).put("expectedPriorState", "idle")
        .put("expectedRevision", 0).put("idempotencyKey", id)
    private fun gps() = JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
        .put("horizontalAccuracyM", 8.0).put("fixAt", java.time.Instant.now().toString()).put("provider", "android-test")

    @Test fun committedNativeEventCarriesLinkedPersonAuthorAndFailsClosedWithoutLink() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java).allowMainThreadQueries().build()
        try {
            DriverWorkflowIdentityTestFixtures.seed(db, "driver-test", "person-test")
            DriverWorkflowStore.queue(db, command("attributed-event"))
            DriverWorkflowStore.complete(db, "attributed-event", gps())
            val event = JSONObject(db.logBookEvents().list().single().json)
            assertEquals("native_overlay", event.getJSONObject("command").getString("originSurface"))
            assertEquals("person-test", event.getJSONObject("createdBy").getString("personId"))
            assertEquals("driver", event.getJSONObject("createdBy").getString("role"))
        } finally { db.close() }

        val isolated = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java).allowMainThreadQueries().build()
        try {
            val now = java.time.Instant.now().toString()
            val selected = JSONObject().put("data", JSONObject().put("schemaVersion", 1).put("driverId", "driver-without-link"))
            isolated.records().put(StoredRecord("work:selected-driver", selected.toString(), 1, now))
            val driver = JSONObject().put("data", JSONObject().put("schemaVersion", 1)
                .put("driverId", "driver-without-link").put("name", "Driver").put("lifecycleState", "active"))
            isolated.records().put(StoredRecord("feature:driver-records:driver:driver-without-link", driver.toString(), 1, now))
            DriverWorkflowStore.queue(isolated, command("unlinked-event"))
            val failure = runCatching { DriverWorkflowStore.complete(isolated, "unlinked-event", gps()) }.exceptionOrNull()
            assertEquals("driver_person_link_missing", failure?.message)
            assertTrue(isolated.logBookEvents().list().isEmpty())
            assertEquals("pending_location", JSONObject(isolated.records().get("driver-intent:unlinked-event")!!.json).getString("status"))
        } finally { isolated.close() }
    }

    @Test fun liveOverlayWorkflowV2AttributesShiftAndSubsequentOverlayEventsToLinkedPerson() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java).allowMainThreadQueries().build()
        try {
            val driverId = "driver-live-overlay"
            val personId = "person-live-overlay"
            DriverWorkflowIdentityTestFixtures.seed(db, driverId, personId)
            val now = java.time.Instant.now().toString()
            val vehicleId = "feature:vehicle:MH01AB1234"
            fun put(id: String, data: JSONObject) {
                val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
                    .put("createdAt", now).put("updatedAt", now).put("source", "android")
                    .put("revision", 1).put("data", data)
                db.records().put(StoredRecord(id, envelope.toString(), 1, now))
            }
            put(vehicleId, JSONObject().put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
                .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
                .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
                .put("ownership", "Owned").put("lifecycleState", "active"))
            put("feature:driver-records:assignment:$driverId", JSONObject()
                .put("schemaVersion", 1).put("driverId", driverId)
                .put("assignments", org.json.JSONArray().put(JSONObject()
                    .put("assignmentId", "assignment-live-overlay").put("vehicleId", vehicleId)
                    .put("assignedAt", now))))

            val startId = "live-overlay-shift-start"
            val start = command(startId).put("workflowVersion", 2)
            DriverWorkflowStore.queue(db, start)
            DriverWorkflowStore.complete(db, startId, gps())
            val firstEvent = JSONObject(db.logBookEvents().list().single().json)
            assertEquals("native_overlay", firstEvent.getJSONObject("command").getString("originSurface"))
            assertEquals("person-live-overlay", firstEvent.getJSONObject("createdBy").getString("personId"))
            assertEquals("person-live-overlay", DriverWorkflowStore.snapshot(db)
                .getJSONObject("shiftAuthor").getString("personId"))

            val endId = "live-overlay-shift-end"
            val end = JSONObject().put("schemaVersion", 1).put("commandId", endId)
                .put("eventId", endId).put("eventType", "shift_end").put("originSurface", "native_overlay")
                .put("transitionAt", java.time.Instant.now().toString()).put("expectedPriorState", "shift_active")
                .put("expectedRevision", 1).put("idempotencyKey", endId).put("workflowVersion", 2)
            DriverWorkflowStore.queue(db, end)
            DriverWorkflowStore.complete(db, endId, gps())
            val events = db.logBookEvents().list().map { JSONObject(it.json) }
            assertEquals(2, events.size)
            assertTrue(events.all { it.getJSONObject("command").getString("originSurface") == "native_overlay" })
            assertTrue(events.all { it.getJSONObject("createdBy").getString("personId") == personId })
            assertTrue(events.all { it.getJSONObject("createdBy").getString("role") == "driver" })
        } finally { db.close() }
    }

    @Test fun inactiveLinkedDriverCannotAuthorANativeOverlayEvent() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java).allowMainThreadQueries().build()
        try {
            DriverWorkflowIdentityTestFixtures.seed(db, "driver-inactive", "person-inactive")
            val row = db.records().get("feature:driver-records:driver:driver-inactive")!!
            val envelope = JSONObject(row.json)
            envelope.getJSONObject("data").put("lifecycleState", "inactive")
            db.records().put(StoredRecord(row.id, envelope.toString(), row.schemaVersion, row.updatedAt))
            DriverWorkflowStore.queue(db, command("inactive-overlay-event"))
            val failure = runCatching { DriverWorkflowStore.complete(db, "inactive-overlay-event", gps()) }.exceptionOrNull()
            assertEquals("driver_person_profile_invalid", failure?.message)
            assertTrue(db.logBookEvents().list().isEmpty())
            assertEquals("pending_location", JSONObject(
                db.records().get("driver-intent:inactive-overlay-event")!!.json,
            ).getString("status"))
        } finally { db.close() }
    }

}
