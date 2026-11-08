package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverWorkflowParityInterruptionTest {
    @Test fun v2RideStartRecoveryAfterRoomReopenMatchesSharedPwaScenario() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val assets = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().context.assets
        val parity = JSONObject(assets.open("driver-workflow-parity-v1.json").bufferedReader().use { it.readText() })
        val expectedStates = parity.getJSONArray("states")
        val databaseName = "driver-workflow-parity-interruption.db"
        context.deleteDatabase(databaseName)
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries()
        var durable = builder.build()
        val created = java.time.Instant.now().minusSeconds(60).toString()

        fun putRecord(id: String, data: JSONObject) {
            val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
                .put("createdAt", created).put("updatedAt", created).put("source", "android")
                .put("revision", 1).put("data", data)
            durable.records().put(StoredRecord(id, envelope.toString(), 1, created))
        }
        fun command(id: String, event: String, state: String, revision: Int) = JSONObject()
            .put("schemaVersion", 1).put("workflowVersion", 2).put("commandId", id).put("eventId", id)
            .put("eventType", event).put("originSurface", "native_overlay")
            .put("transitionAt", java.time.Instant.now().toString())
            .put("expectedPriorState", state).put("expectedRevision", revision).put("idempotencyKey", id)
        fun complete(id: String, event: String, state: String, revision: Int): JSONObject {
            DriverWorkflowStore.queue(durable, command(id, event, state, revision))
            return DriverWorkflowStore.complete(durable, id, JSONObject()
                .put("latitude", 19.076).put("longitude", 72.8777).put("horizontalAccuracyM", 8.0)
                .put("fixAt", java.time.Instant.now().toString()).put("provider", "android-test"))
        }

        try {
            putRecord("work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", "parity-driver"))
            putRecord("feature:driver-records:driver:parity-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "parity-driver").put("name", "Parity Driver").put("lifecycleState", "active"))
            putRecord("feature:driver-records:assignment:parity-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "parity-driver").put("assignments", JSONArray().put(JSONObject()
                    .put("assignmentId", "parity-assignment").put("vehicleId", "feature:vehicle:MH01CD5678")
                    .put("assignedAt", created))))
            putRecord("feature:vehicle:MH01CD5678", JSONObject().put("schemaVersion", 1)
                .put("registrationNumber", "MH01CD5678").put("make", "Make").put("model", "Model")
                .put("vehicleType", "Sedan").put("fuelType", "Petrol").put("yearOfManufacture", 2024)
                .put("ownership", "Owned").put("lifecycleState", "active"))

            val states = mutableListOf<String>()
            states.add(complete("parity-shift-start", "shift_start", "idle", 0).getString("state"))
            states.add(complete("parity-trip-create", "trip_create", "shift_active", 1).getString("state"))

            val pendingCommand = command("parity-ride-start", "start_ride", "going_to_pickup", 2)
            DriverWorkflowStore.queue(durable, pendingCommand)
            durable.close()

            // Reopening the on-disk Room database is the native process-interruption recovery boundary.
            durable = builder.build()
            val pending = DriverWorkflowStore.listPending(durable)
                .single { it.getJSONObject("command").getString("eventId") == parity.getString("interruptedEventId") }
            assertEquals("pending_location", pending.getString("status"))
            DriverWorkflowStore.reactivate(durable, parity.getString("interruptedEventId"))
            val recovered = DriverWorkflowStore.complete(
                durable, parity.getString("interruptedEventId"),
                JSONObject().put("latitude", 19.076).put("longitude", 72.8777).put("horizontalAccuracyM", 8.0)
                    .put("fixAt", java.time.Instant.now().toString()).put("provider", "android-test"),
            )
            states.add(recovered.getString("state"))
            states.add(complete("parity-ride-end", "end_ride", "trip_active", 3).getString("state"))
            states.add(complete("parity-shift-end", "shift_end", "shift_active", 4).getString("state"))

            val expected = (0 until expectedStates.length()).map { expectedStates.getString(it) }
            assertEquals(expected, states)
            assertEquals(parity.getInt("finalRevision"), DriverWorkflowStore.snapshot(durable).getInt("revision"))
            assertEquals(parity.getInt("eventCount"), DriverWorkflowStore.listEvents(durable).size)
            assertEquals(parity.getInt("outboxCount"), durable.records().list().count { it.id.startsWith("driver-outbox:") })
            assertEquals("recorded", DriverWorkflowStore.listIntents(durable)
                .single { it.getJSONObject("command").getString("eventId") == parity.getString("interruptedEventId") }
                .getString("status"))
        } finally {
            durable.close()
            context.deleteDatabase(databaseName)
        }
    }
}
