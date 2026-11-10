package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class DriverWorkflowOutboxTest {
    private fun command(id: String) = JSONObject()
        .put("schemaVersion", 1).put("commandId", id).put("eventId", id)
        .put("eventType", "shift_start").put("originSurface", "native_overlay")
        .put("transitionAt", Instant.now().toString()).put("expectedPriorState", "idle")
        .put("expectedRevision", 0).put("idempotencyKey", id)

    private fun gps(at: String) = JSONObject()
        .put("latitude", 19.076).put("longitude", 72.8777)
        .put("horizontalAccuracyM", 8.0).put("fixAt", at).put("provider", "android-test")

    @Test fun durableOutboxAcknowledgementSurvivesRoomReopenAndExcludesDeliveredEvents() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "driver-workflow-outbox-ack-test.db"
        context.deleteDatabase(databaseName)
        val first = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        val at = Instant.now()
        DriverWorkflowStore.queue(first, command("durable-outbox-ack").put("transitionAt", at.toString()))
        DriverWorkflowStore.complete(first, "durable-outbox-ack", gps(at.toString()), at)
        assertEquals(1, DriverWorkflowOutbox.listUndeliveredEvents(first).size)
        DriverWorkflowOutbox.markEventDelivered(first, "durable-outbox-ack")
        assertTrue(DriverWorkflowOutbox.listUndeliveredEvents(first).isEmpty())
        first.close()

        val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries().build()
        try {
            assertTrue(DriverWorkflowOutbox.listUndeliveredEvents(reopened).isEmpty())
            val outbox = JSONObject(reopened.records().get("driver-outbox:1")!!.json)
            assertEquals(true, outbox.getBoolean("delivered"))
            assertEquals(1, DriverWorkflowStore.listEvents(reopened).size)
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
    }
}
