package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNotNull
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
            putRecord("identity:driver-person-link:parity-driver", JSONObject().put("schemaVersion", 1).put("driverId", "parity-driver").put("personId", "parity-person"))
            putRecord("identity:person:parity-person", JSONObject().put("schemaVersion", 1).put("personId", "parity-person")
                .put("displayName", "Parity Driver").put("roles", JSONArray().put("driver")).put("status", "active"))
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

            assertEquals("parity-driver", DriverWorkflowStore.selectedWorkContext(durable, true).getString("driverId"))
            val states = mutableListOf<String>()
            states.add(complete("parity-shift-start", "shift_start", "idle", 0).getString("state"))
            states.add(complete("parity-trip-create", "trip_create", "shift_active", 1).getString("state"))

            val pendingCommand = command("parity-ride-start", "start_ride", "going_to_pickup", 2)
            DriverWorkflowStore.queue(durable, pendingCommand)
            durable.close()

            // This verifies durable Room reopen only; CI separately force-stops the app process.
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

    @Test fun operationalDayBoundarySurvivesRoomReopenAndUsesFourAmIndiaCutover() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "driver-workflow-04-boundary-reopen.db"
        context.deleteDatabase(databaseName)
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName).allowMainThreadQueries()
        var durable = builder.build()
        val created = "2026-11-08T00:00:00.000Z"
        fun putRecord(id: String, data: JSONObject) {
            val envelope = JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", created)
                .put("updatedAt", created).put("source", "android").put("revision", 1).put("data", data)
            durable.records().put(StoredRecord(id, envelope.toString(), 1, created))
        }
        fun command(id: String, event: String, state: String, revision: Int, at: String) = JSONObject()
            .put("schemaVersion", 1).put("workflowVersion", 2).put("commandId", id).put("eventId", id)
            .put("eventType", event).put("originSurface", "native_overlay").put("transitionAt", at)
            .put("expectedPriorState", state).put("expectedRevision", revision).put("idempotencyKey", id)
        fun completeAt(id: String, event: String, state: String, revision: Int, at: String): JSONObject {
            DriverWorkflowStore.queue(durable, command(id, event, state, revision, at), java.time.Instant.parse(at))
            return DriverWorkflowStore.complete(durable, id, JSONObject().put("latitude", 19.076)
                .put("longitude", 72.8777).put("horizontalAccuracyM", 8.0).put("fixAt", at).put("provider", "android-test"),
                java.time.Instant.parse(at))
        }
        try {
            putRecord("work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", "boundary-driver"))
            putRecord("identity:driver-person-link:boundary-driver", JSONObject().put("schemaVersion", 1).put("driverId", "boundary-driver").put("personId", "boundary-person"))
            putRecord("identity:person:boundary-person", JSONObject().put("schemaVersion", 1).put("personId", "boundary-person")
                .put("displayName", "Boundary Driver").put("roles", JSONArray().put("driver")).put("status", "active"))
            putRecord("feature:driver-records:driver:boundary-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "boundary-driver").put("name", "Boundary Driver").put("lifecycleState", "active"))
            putRecord("feature:driver-records:assignment:boundary-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "boundary-driver").put("assignments", JSONArray().put(JSONObject()
                    .put("assignmentId", "boundary-assignment").put("vehicleId", "feature:vehicle:MH01EF9012")
                    .put("assignedAt", created))))
            putRecord("feature:vehicle:MH01EF9012", JSONObject().put("schemaVersion", 1)
                .put("registrationNumber", "MH01EF9012").put("make", "Make").put("model", "Model")
                .put("vehicleType", "Sedan").put("fuelType", "Petrol").put("yearOfManufacture", 2024)
                .put("ownership", "Owned").put("lifecycleState", "active"))

            completeAt("boundary-shift-start", "shift_start", "idle", 0, "2026-11-08T22:29:59.000Z")
            durable.close()
            durable = builder.build()
            val trip = completeAt("boundary-trip-create", "trip_create", "shift_active", 1, "2026-11-08T22:30:00.000Z")
            assertEquals("2026-11-09", trip.getJSONObject("tripContext").getString("operationalDate"))
            assertEquals("going_to_pickup", trip.getString("state"))
            completeAt("boundary-ride-start", "start_ride", "going_to_pickup", 2, "2026-11-08T22:30:01.000Z")
            completeAt("boundary-ride-end", "end_ride", "trip_active", 3, "2026-11-08T22:30:02.000Z")
            val ended = completeAt("boundary-shift-end", "shift_end", "shift_active", 4, "2026-11-08T22:30:03.000Z")
            assertEquals("idle", ended.getString("state"))
            assertEquals(5, ended.getInt("revision"))
        } finally {
            durable.close()
            context.deleteDatabase(databaseName)
        }
    }

    @Test fun nativeRestoreKeepsActiveShiftAndPendingIntentTogether() {
        // Keep feature participant registrations scoped to this test. Process-wide registrations
        // are appropriate for the app, but must not leak into later instrumentation test classes.
        val driverRegistration = NativeDriverRecordsBackup.register()
        val vehicleRegistration = NativeVehicleBackup.register()
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "driver-workflow-restore-active-pending.db"
        context.deleteDatabase(databaseName)
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3).allowMainThreadQueries()
        var durable = builder.build()
        val created = java.time.Instant.now().minusSeconds(120).toString()
        fun putRecord(id: String, data: JSONObject) {
            val envelope = JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", created)
                .put("updatedAt", created).put("source", "android").put("revision", 1).put("data", data)
            durable.records().put(StoredRecord(id, envelope.toString(), 1, created))
        }
        fun command(id: String, event: String, state: String, revision: Int, at: String) = JSONObject()
            .put("schemaVersion", 1).put("workflowVersion", 2).put("commandId", id).put("eventId", id)
            .put("eventType", event).put("originSurface", "native_overlay").put("transitionAt", at)
            .put("expectedPriorState", state).put("expectedRevision", revision).put("idempotencyKey", id)
        fun gps(at: String) = JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
            .put("horizontalAccuracyM", 8.0).put("fixAt", at).put("provider", "android-test")
        try {
            putRecord("work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", "restore-driver"))
            putRecord("identity:driver-person-link:restore-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "restore-driver").put("personId", "restore-person"))
            putRecord("identity:person:restore-person", JSONObject().put("schemaVersion", 1)
                .put("personId", "restore-person").put("displayName", "Restore Driver")
                .put("roles", JSONArray().put("driver")).put("status", "active"))
            putRecord("feature:driver-records:driver:restore-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "restore-driver").put("name", "Restore Driver").put("lifecycleState", "active"))
            putRecord("feature:driver-records:assignment:restore-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "restore-driver").put("assignments", JSONArray().put(JSONObject()
                    .put("assignmentId", "restore-assignment").put("vehicleId", "feature:vehicle:MH01GH3456")
                    .put("assignedAt", created))))
            putRecord("feature:vehicle:MH01GH3456", JSONObject().put("schemaVersion", 1)
                .put("registrationNumber", "MH01GH3456").put("make", "Make").put("model", "Model")
                .put("vehicleType", "Sedan").put("fuelType", "Petrol").put("yearOfManufacture", 2024)
                .put("ownership", "Owned").put("lifecycleState", "active"))

            val shiftAt = java.time.Instant.now().minusSeconds(4).toString()
            DriverWorkflowStore.queue(durable, command("restore-active-shift", "shift_start", "idle", 0, shiftAt))
            DriverWorkflowStore.complete(durable, "restore-active-shift", gps(shiftAt))
            val pendingAt = java.time.Instant.now().minusSeconds(2).toString()
            DriverWorkflowStore.queue(durable, command("restore-pending-trip", "trip_create", "shift_active", 1, pendingAt))
            val backup = NativeBackupCoverage.exportBusinessRecords(durable, NativeBackupRecovery::isInternalRecord)

            durable.runInTransaction { NativeBackupCoverage.replaceBusinessRecords(durable, JSONArray()) }
            durable.runInTransaction { NativeBackupCoverage.replaceBusinessRecords(durable, backup) }
            assertEquals("shift_active", DriverWorkflowStore.snapshot(durable).getString("state"))
            assertEquals("pending_location", DriverWorkflowStore.listPending(durable)
                .single { it.getJSONObject("command").getString("eventId") == "restore-pending-trip" }.getString("status"))

            durable.close()
            durable = builder.build()
            NativeStartupRecovery.invalidate()
            NativeStartupRecovery.ensure(durable)
            assertEquals("shift_active", DriverWorkflowStore.snapshot(durable).getString("state"))
            assertNotNull(DriverWorkflowStore.listPending(durable)
                .singleOrNull { it.getJSONObject("command").getString("eventId") == "restore-pending-trip" })
            DriverWorkflowStore.reactivate(durable, "restore-pending-trip")
            // Completion time must not precede the intent's persisted createdAt/updatedAt timestamps.
            val completed = DriverWorkflowStore.complete(durable, "restore-pending-trip", gps(pendingAt), java.time.Instant.now())
            assertEquals("going_to_pickup", completed.getString("state"))
            assertEquals(2, completed.getInt("revision"))
        } finally {
            durable.close()
            context.deleteDatabase(databaseName)
            vehicleRegistration.close()
            driverRegistration.close()
        }
    }

}
