package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class DriverWorkflowParityRecoveryTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    private fun database(name: String) = Room.databaseBuilder(context, LocalDatabase::class.java, name)
        .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
        .allowMainThreadQueries()
        .build()

    private fun putFeatureRecord(db: LocalDatabase, id: String, data: JSONObject, createdAt: String) {
        val envelope = JSONObject()
            .put("id", id)
            .put("schemaVersion", 1)
            .put("createdAt", createdAt)
            .put("updatedAt", createdAt)
            .put("source", "android")
            .put("revision", 1)
            .put("data", data)
        db.records().put(StoredRecord(id, envelope.toString(), 1, createdAt))
    }

    private fun seedWorkContext(db: LocalDatabase, at: String) {
        putFeatureRecord(db, "work:selected-driver",
            JSONObject().put("schemaVersion", 1).put("driverId", "parity-driver"), at)
        putFeatureRecord(db, "feature:driver-records:driver:parity-driver",
            JSONObject().put("schemaVersion", 1).put("driverId", "parity-driver")
                .put("name", "Parity Driver").put("lifecycleState", "active"), at)
        putFeatureRecord(db, "feature:driver-records:assignment:parity-driver",
            JSONObject().put("schemaVersion", 1).put("driverId", "parity-driver")
                .put("assignments", JSONArray().put(JSONObject()
                    .put("assignmentId", "parity-assignment")
                    .put("vehicleId", "feature:vehicle:MH01AB1234")
                    .put("assignedAt", at))), at)
        putFeatureRecord(db, "feature:vehicle:MH01AB1234",
            JSONObject().put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
                .put("make", "Make").put("model", "Model").put("vehicleType", "Sedan")
                .put("fuelType", "Petrol").put("yearOfManufacture", 2024)
                .put("ownership", "Owned").put("lifecycleState", "active"), at)
    }

    private fun command(
        id: String,
        eventType: String,
        priorState: String,
        revision: Int,
        origin: String,
        at: String = Instant.now().toString(),
    ) = JSONObject()
        .put("schemaVersion", 1)
        .put("workflowVersion", 2)
        .put("commandId", id)
        .put("eventId", id)
        .put("eventType", eventType)
        .put("originSurface", origin)
        .put("transitionAt", at)
        .put("expectedPriorState", priorState)
        .put("expectedRevision", revision)
        .put("idempotencyKey", id)

    private fun gps(at: String) = JSONObject()
        .put("latitude", 19.076)
        .put("longitude", 72.8777)
        .put("horizontalAccuracyM", 8)
        .put("fixAt", at)
        .put("provider", "parity-fixture")

    private fun normalizedSnapshot(value: JSONObject): JSONObject {
        val result = JSONObject()
            .put("state", value.getString("state"))
            .put("revision", value.getInt("revision"))
        listOf("shiftId", "activeTripId", "shiftContext", "tripContext").forEach { key ->
            if (value.has(key) && !value.isNull(key)) result.put(key, value.get(key))
        }
        return result
    }

    private fun normalizedEvent(value: JSONObject): JSONObject {
        val command = value.getJSONObject("command")
        val gps = value.getJSONObject("gps")
        val normalizedGps = JSONObject()
            .put("latitude", gps.getDouble("latitude"))
            .put("longitude", gps.getDouble("longitude"))
            .put("horizontalAccuracyM", gps.getDouble("horizontalAccuracyM"))
            .put("provider", gps.getString("provider"))
        val result = JSONObject()
            .put("eventId", value.getString("eventId"))
            .put("eventType", command.getString("eventType"))
            .put("originSurface", command.getString("originSurface"))
            .put("expectedRevision", command.getInt("expectedRevision"))
            .put("revision", value.getInt("revision"))
            .put("gps", normalizedGps)
        listOf("driverContext", "tripContext").forEach { key ->
            if (command.has(key) && !command.isNull(key)) result.put(key, command.get(key))
        }
        return result
    }

    @Test fun RoomRunsTheSameCompleteWorkflowAsTheDexieGeneratedOracle() {
        val assets = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().context.assets
        val oracle = JSONObject(assets.open("generated/driver-workflow-parity-oracle-v1.json")
            .bufferedReader().use { it.readText() })
        assertEquals(1, oracle.getInt("schemaVersion"))

        val dbName = "driver-workflow-cross-adapter-parity.db"
        context.deleteDatabase(dbName)
        val db = database(dbName)
        try {
            val createdAt = Instant.now().minusSeconds(5).toString()
            seedWorkContext(db, createdAt)
            val steps = listOf(
                Triple("parity-shift-start", "shift_start", "idle"),
                Triple("parity-trip-create", "trip_create", "shift_active"),
                Triple("parity-ride-start", "start_ride", "going_to_pickup"),
                Triple("parity-ride-end", "end_ride", "trip_active"),
                Triple("parity-trip-cancel-create", "trip_create", "shift_active"),
                Triple("parity-trip-cancel", "cancel_ride", "going_to_pickup"),
                Triple("parity-shift-end", "shift_end", "shift_active"),
            )
            val origins = listOf("pwa", "native_overlay", "pwa", "native_overlay", "pwa", "native_overlay", "pwa")
            val snapshots = JSONArray()
            steps.forEachIndexed { index, (id, eventType, priorState) ->
                val at = Instant.now().toString()
                val next = DriverWorkflowStore.queue(
                    db, command(id, eventType, priorState, index, origins[index], at),
                )
                assertEquals("pending_location", next.getString("status"))
                val snapshot = DriverWorkflowStore.complete(db, id, gps(at))
                snapshots.put(normalizedSnapshot(snapshot))
            }

            val expectedSnapshots = oracle.getJSONArray("snapshots")
            assertEquals(expectedSnapshots.length(), snapshots.length())
            for (index in 0 until snapshots.length()) {
                assertTrue("Room snapshot differs from Dexie oracle at revision ${index + 1}",
                    expectedSnapshots.getJSONObject(index).similar(snapshots.getJSONObject(index)))
            }

            val events = DriverWorkflowStore.listEvents(db).sortedBy { it.optInt("revision") }
            val expectedEvents = oracle.getJSONArray("events")
            assertEquals(expectedEvents.length(), events.size)
            events.forEachIndexed { index, event ->
                assertTrue("Room event differs from Dexie oracle at revision ${index + 1}",
                    expectedEvents.getJSONObject(index).similar(normalizedEvent(event)))
            }
            val selected = JSONObject(db.records().get("work:selected-driver")!!.json).getJSONObject("data")
            assertFalse(selected.has("lockedShiftId"))
            assertEquals(oracle.getBoolean("selectedDriverUnlocked"), !selected.has("lockedShiftId"))
        } finally {
            db.close()
            context.deleteDatabase(dbName)
        }
    }

    @Test fun pendingTransitionDuringAnActiveTripSurvivesRoomReopenAndRecoversExactlyOnce() {
        val dbName = "driver-workflow-active-trip-recovery.db"
        context.deleteDatabase(dbName)
        var db = database(dbName)
        try {
            val createdAt = Instant.now().minusSeconds(5).toString()
            seedWorkContext(db, createdAt)
            val firstSteps = listOf(
                Triple("restart-shift", "shift_start", "idle"),
                Triple("restart-trip", "trip_create", "shift_active"),
                Triple("restart-ride", "start_ride", "going_to_pickup"),
            )
            firstSteps.forEachIndexed { index, (id, eventType, priorState) ->
                val at = Instant.now().toString()
                DriverWorkflowStore.queue(db, command(id, eventType, priorState, index, "pwa", at))
                DriverWorkflowStore.complete(db, id, gps(at))
            }

            val pendingAt = Instant.now().toString()
            DriverWorkflowStore.queue(
                db,
                command("restart-ride-end", "end_ride", "trip_active", 3, "native_overlay", pendingAt),
            )
            assertEquals("trip_active", DriverWorkflowStore.snapshot(db).getString("state"))
            assertEquals(3, DriverWorkflowStore.listEvents(db).size)
            db.close()

            db = database(dbName)
            assertEquals("trip_active", DriverWorkflowStore.snapshot(db).getString("state"))
            assertEquals(3, DriverWorkflowStore.snapshot(db).getInt("revision"))
            assertEquals(1, DriverWorkflowStore.listPending(db).size)
            assertEquals("pending_location", DriverWorkflowStore.listPending(db).single().getString("status"))

            DriverWorkflowStore.reactivate(db, "restart-ride-end")
            val recovered = DriverWorkflowStore.complete(db, "restart-ride-end", gps(pendingAt))
            assertEquals("shift_active", recovered.getString("state"))
            assertEquals(4, recovered.getInt("revision"))
            assertEquals(4, DriverWorkflowStore.listEvents(db).size)
            assertEquals(4, db.records().list().count { it.id.startsWith("driver-outbox:") })

            val replayed = DriverWorkflowStore.complete(db, "restart-ride-end", gps(pendingAt))
            assertTrue(recovered.similar(replayed))
            assertEquals(4, DriverWorkflowStore.listEvents(db).size)
            assertEquals(4, db.records().list().count { it.id.startsWith("driver-outbox:") })
        } finally {
            db.close()
            context.deleteDatabase(dbName)
        }
    }
}
