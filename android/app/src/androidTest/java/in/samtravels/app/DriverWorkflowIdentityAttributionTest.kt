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
}
