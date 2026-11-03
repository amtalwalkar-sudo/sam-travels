package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class DriverWorkflowStoreTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase() = db.close()

    private fun command(id: String, event: String = "shift_start") = JSONObject()
        .put("schemaVersion", 1)
        .put("commandId", id)
        .put("eventId", id)
        .put("eventType", event)
        .put("originSurface", "native_overlay")
        .put("transitionAt", "2026-11-03T10:00:00.000Z")
        .put("expectedPriorState", "idle")
        .put("expectedRevision", 0)
        .put("idempotencyKey", id)

    private fun gps(accuracy: Double = 8.0) = JSONObject()
        .put("latitude", 19.076)
        .put("longitude", 72.8777)
        .put("horizontalAccuracyM", accuracy)
        .put("fixAt", "2026-11-03T10:00:00.000Z")
        .put("provider", "android-test")

    @Test fun completionAtomicallyWritesEventProjectionIntentAndOutbox() {
        DriverWorkflowStore.queue(db, command("event-1"))
        val next = DriverWorkflowStore.complete(db, "event-1", gps())

        assertEquals("shift_active", next.getString("state"))
        assertEquals(1, next.getInt("revision"))
        assertEquals("recorded", JSONObject(db.records().get("driver-intent:event-1")!!.json).getString("status"))
        assertTrue(db.records().get("driver-event:event-1") != null)
        assertTrue(db.records().get("driver-outbox:1") != null)
        assertEquals(1, JSONObject(db.records().get("driver-state")!!.json)
            .getJSONObject("value").getInt("revision"))
    }

    @Test fun failedGpsValidationLeavesIntentPendingAndProjectionUnchanged() {
        DriverWorkflowStore.queue(db, command("event-bad-gps"))
        var rejected = false
        try {
            DriverWorkflowStore.complete(db, "event-bad-gps", gps(51.0))
        } catch (_: IllegalArgumentException) {
            rejected = true
        }
        assertTrue(rejected)
        assertEquals(0, JSONObject(db.records().get("driver-state")!!.json)
            .getJSONObject("value").getInt("revision"))
        assertEquals("pending_location", JSONObject(db.records().get("driver-intent:event-bad-gps")!!.json)
            .getString("status"))
        assertFalse(db.records().list().any { it.id.startsWith("driver-event:") })
        assertFalse(db.records().list().any { it.id.startsWith("driver-outbox:") })
    }

    @Test fun competingPwaAndOverlayCommandsCannotBothQueueAtOneRevision() {
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val first = pool.submit<Boolean> {
                ready.countDown(); start.await()
                try { DriverWorkflowStore.queue(db, command("race-a")); true }
                catch (_: Exception) { false }
            }
            val second = pool.submit<Boolean> {
                ready.countDown(); start.await()
                try {
                    DriverWorkflowStore.queue(db, command("race-b").put("originSurface", "pwa")); true
                } catch (_: Exception) { false }
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            val accepted = listOf(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))
            assertEquals(1, accepted.count { it })
            assertEquals(1, db.records().list().count { it.id.startsWith("driver-intent:") })
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun recordedIntentCannotBeReactivatedOrDowngraded() {
        DriverWorkflowStore.queue(db, command("event-terminal"))
        DriverWorkflowStore.markNeedsAttention(db, "event-terminal", "gps_timeout")
        DriverWorkflowStore.reactivate(db, "event-terminal")
        DriverWorkflowStore.complete(db, "event-terminal", gps())

        var rejected = false
        try { DriverWorkflowStore.reactivate(db, "event-terminal") }
        catch (_: IllegalArgumentException) { rejected = true }
        DriverWorkflowStore.markNeedsAttention(db, "event-terminal", "late_error")
        assertTrue(rejected)
        assertEquals("recorded", JSONObject(db.records().get("driver-intent:event-terminal")!!.json)
            .getString("status"))
    }
    @Test fun duplicateCommandIsIdempotentButChangedPayloadIsRejected() {
        val original = command("same-event")
        val first = DriverWorkflowStore.queue(db, original)
        val duplicate = DriverWorkflowStore.queue(db, command("same-event"))
        assertEquals(first.getString("status"), duplicate.getString("status"))
        assertEquals(first.getJSONObject("command").getString("commandId"),
            duplicate.getJSONObject("command").getString("commandId"))

        var rejected = false
        try { DriverWorkflowStore.queue(db, command("same-event", "trip_start")) }
        catch (_: IllegalArgumentException) { rejected = true }
        assertTrue(rejected)
        assertEquals(1, db.records().list().count { it.id.startsWith("driver-intent:") })
    }

}
