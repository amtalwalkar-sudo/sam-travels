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
        .put("transitionAt", java.time.Instant.now().toString())
        .put("expectedPriorState", "idle")
        .put("expectedRevision", 0)
        .put("idempotencyKey", id)

    private fun gps(accuracy: Double = 8.0) = JSONObject()
        .put("latitude", 19.076)
        .put("longitude", 72.8777)
        .put("horizontalAccuracyM", accuracy)
        .put("fixAt", java.time.Instant.now().toString())
        .put("provider", "android-test")

    @Test fun completionAtomicallyWritesEventProjectionIntentAndOutbox() {
        DriverWorkflowStore.queue(db, command("event-1"))
        val next = DriverWorkflowStore.complete(db, "event-1", gps())

        assertEquals("shift_active", next.getString("state"))
        assertEquals(1, next.getInt("revision"))
        assertEquals("recorded", JSONObject(db.records().get("driver-intent:event-1")!!.json).getString("status"))
        assertEquals(1, db.logBookEvents().list().size)
        assertEquals("event-1", JSONObject(db.logBookEvents().list().single().json).getString("eventId"))
        val outbox = JSONObject(db.records().get("driver-outbox:1")!!.json)
        assertEquals("logbook.work-driver-events.v1", outbox.getString("integrationId"))
        assertEquals(1, outbox.getInt("contractVersion"))
        assertEquals("work.driver-event-committed", outbox.getString("eventName"))
        assertEquals(1, outbox.getInt("payloadVersion"))
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
        // A failed first transition must not create a projection; its implicit baseline is idle/revision 0.
        val persistedState = db.records().get("driver-state")?.let { JSONObject(it.json).getJSONObject("value") }
        assertEquals("idle", persistedState?.optString("state", "idle") ?: "idle")
        assertEquals(0, persistedState?.optInt("revision", 0) ?: 0)
        assertEquals("pending_location", JSONObject(db.records().get("driver-intent:event-bad-gps")!!.json)
            .getString("status"))
        assertTrue(db.logBookEvents().list().isEmpty())
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
        val duplicate = DriverWorkflowStore.queue(db, original)
        assertEquals(first.getString("status"), duplicate.getString("status"))
        assertEquals(first.getJSONObject("command").getString("commandId"),
            duplicate.getJSONObject("command").getString("commandId"))

        var rejected = false
        try { DriverWorkflowStore.queue(db, command("same-event", "trip_start")) }
        catch (_: IllegalArgumentException) { rejected = true }
        assertTrue(rejected)
        assertEquals(1, db.records().list().count { it.id.startsWith("driver-intent:") })
    }

    @Test fun pendingIntentSurvivesRoomReopenAndCanBeRecovered() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "driver-workflow-recovery-test.db"
        context.deleteDatabase(databaseName)
        val first = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        DriverWorkflowStore.queue(first, command("persistent-event"))
        first.close()

        val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        try {
            val persisted = JSONObject(reopened.records().get("driver-intent:persistent-event")!!.json)
            assertEquals("pending_location", persisted.getString("status"))
            assertEquals("persistent-event", persisted.getJSONObject("command").getString("eventId"))
            DriverWorkflowStore.reactivate(reopened, "persistent-event")
            val next = DriverWorkflowStore.complete(reopened, "persistent-event", gps())
            assertEquals("shift_active", next.getString("state"))
            assertEquals("recorded", JSONObject(reopened.records().get("driver-intent:persistent-event")!!.json)
                .getString("status"))
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
    }

    @Test fun replayedCompletionCannotDuplicateEventProjectionOrOutbox() {
        DriverWorkflowStore.queue(db, command("event-replay"))
        val first = DriverWorkflowStore.complete(db, "event-replay", gps())
        assertEquals(1, first.getInt("revision"))

        var rejected = false
        try {
            DriverWorkflowStore.complete(db, "event-replay", gps())
        } catch (_: Exception) {
            rejected = true
        }

        assertTrue(rejected)
        assertEquals(1, db.logBookEvents().list().size)
        assertEquals(1, db.records().list().count { it.id.startsWith("driver-outbox:") })
        assertEquals(1, JSONObject(db.records().get("driver-state")!!.json)
            .getJSONObject("value").getInt("revision"))
        assertEquals("recorded", JSONObject(db.records().get("driver-intent:event-replay")!!.json)
            .getString("status"))
    }


    @Test fun committedTransitionReplayAfterRoomReopenCannotDuplicateEventOrOutbox() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "driver-workflow-commit-replay-test.db"
        context.deleteDatabase(databaseName)
        val first = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        DriverWorkflowStore.queue(first, command("durable-replay"))
        val committed = DriverWorkflowStore.complete(first, "durable-replay", gps())
        assertEquals(1, committed.getInt("revision"))
        first.close()

        val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        try {
            var rejected = false
            try {
                DriverWorkflowStore.complete(reopened, "durable-replay", gps())
            } catch (_: Exception) {
                rejected = true
            }

            assertTrue(rejected)
            assertEquals(1, reopened.logBookEvents().list().size)
            assertEquals("durable-replay", JSONObject(reopened.logBookEvents().list().single().json).getString("eventId"))
            assertEquals(1, reopened.records().list().count { it.id.startsWith("driver-outbox:") })
            assertEquals(1, JSONObject(reopened.records().get("driver-state")!!.json)
                .getJSONObject("value").getInt("revision"))
            assertEquals("recorded", JSONObject(
                reopened.records().get("driver-intent:durable-replay")!!.json,
            ).getString("status"))
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
    }

    @Test fun workRepositoryGatewayExposesSnapshotPendingIntentsAndCommittedEvents() {
        DriverWorkflowStore.queue(db, command("gateway-event"))
        assertEquals("idle", DriverWorkflowStore.snapshot(db).getString("state"))
        assertEquals(1, DriverWorkflowStore.listIntents(db).size)
        assertEquals(1, DriverWorkflowStore.listPending(db).size)
        assertEquals("gateway-event", DriverWorkflowStore.firstPendingLocation(db)
            ?.getJSONObject("command")?.getString("eventId"))
        assertEquals("gateway-event", DriverWorkflowStore.firstRecoverableIntent(db)
            ?.getJSONObject("command")?.getString("eventId"))

        DriverWorkflowStore.complete(db, "gateway-event", gps())
        assertEquals(0, DriverWorkflowStore.listPending(db).size)
        assertEquals(1, DriverWorkflowStore.listEvents(db).size)
        assertEquals("gateway-event", DriverWorkflowStore.listEvents(db).single().getString("eventId"))
        assertEquals("shift_active", DriverWorkflowStore.snapshot(db).getString("state"))
        assertTrue(DriverWorkflowStore.firstPendingLocation(db) == null)
        assertTrue(DriverWorkflowStore.firstRecoverableIntent(db) == null)
    }


    @Test fun roomEventReadMatchesTheSharedTimelineParityFixture() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val fixture = context.assets.open("timeline-parity-events-v1.json")
            .bufferedReader().use { it.readText() }
        val expected = org.json.JSONArray(fixture)
        for (index in 0 until expected.length()) {
            val event = expected.getJSONObject(index)
            db.logBookEvents().put(
                LogBookEventRecord(
                    event.getString("eventId"),
                    event.toString(),
                    1,
                    event.getString("committedAt"),
                ),
            )
        }

        val actual = DriverWorkflowStore.listEvents(db)
        assertEquals(expected.length(), actual.size)
        for (index in 0 until expected.length()) {
            val expectedEvent = expected.getJSONObject(index)
            val actualEvent = actual[index]
            assertEquals(expectedEvent.getString("eventId"), actualEvent.getString("eventId"))
            assertEquals(expectedEvent.getInt("revision"), actualEvent.getInt("revision"))
            assertEquals(expectedEvent.getString("committedAt"), actualEvent.getString("committedAt"))
            assertEquals(expectedEvent.getJSONObject("command").getString("eventType"),
                actualEvent.getJSONObject("command").getString("eventType"))
            assertEquals(expectedEvent.getJSONObject("command").getString("transitionAt"),
                actualEvent.getJSONObject("command").getString("transitionAt"))
        }
    }

}
