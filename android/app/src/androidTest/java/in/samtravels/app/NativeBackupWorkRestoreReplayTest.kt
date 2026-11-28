package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeBackupWorkRestoreReplayTest {
    private fun envelope(id: String, data: JSONObject, at: String, revision: Int = 1) = StoredRecord(
        id,
        JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", at)
            .put("updatedAt", at).put("source", "android").put("revision", revision)
            .put("data", data).toString(),
        1, at,
    )

    @Test fun pendingWorkIntentSurvivesEncryptedRestoreAndCreatesOneEventAndOutboxEffect() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "stage5-work-encrypted-restore.db"
        context.deleteDatabase(name)
        val vehicleRegistration = NativeVehicleBackup.register()
        val driverRegistration = NativeDriverRecordsBackup.register()
        val at = java.time.Instant.now().minusSeconds(8).toString()
        val recoveryKey = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA="
        var db = Room.databaseBuilder(context, LocalDatabase::class.java, name)
            .allowMainThreadQueries().build()
        try {
            DriverWorkflowIdentityTestFixtures.seed(db, "stage5-driver", "stage5-person")
            val vehicleId = "feature:vehicle:MH01ST5678"
            db.records().put(envelope(vehicleId, JSONObject()
                .put("schemaVersion", 1).put("registrationNumber", "MH01ST5678")
                .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
                .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
                .put("ownership", "Owned").put("lifecycleState", "active"), at))
            db.records().put(envelope("feature:driver-records:assignment:stage5-driver", JSONObject()
                .put("schemaVersion", 1).put("driverId", "stage5-driver")
                .put("assignments", org.json.JSONArray().put(JSONObject()
                    .put("assignmentId", "stage5-assignment").put("vehicleId", vehicleId)
                    .put("assignedAt", at))), at))

            fun command(id: String, event: String, state: String, revision: Int, transitionAt: String) =
                JSONObject().put("schemaVersion", 1).put("workflowVersion", 2)
                    .put("commandId", id).put("eventId", id).put("eventType", event)
                    .put("originSurface", "native_overlay").put("transitionAt", transitionAt)
                    .put("expectedPriorState", state).put("expectedRevision", revision)
                    .put("idempotencyKey", id).apply {
                        if (event == "shift_start") put("odometer", JSONObject()
                            .put("schemaVersion", 1).put("readingKm", 12000))
                    }

            val shiftAt = java.time.Instant.now().minusSeconds(4)
            DriverWorkflowStore.queue(db, command("stage5-shift-start", "shift_start", "idle", 0, shiftAt.toString()), shiftAt)
            DriverWorkflowStore.complete(db, "stage5-shift-start",
                JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
                    .put("horizontalAccuracyM", 8.0).put("fixAt", shiftAt.toString())
                    .put("provider", "stage5-test"), shiftAt.plusSeconds(1))
            DriverWorkflowOutbox.markEventDelivered(db, "stage5-shift-start")

            val pendingAt = java.time.Instant.now().minusSeconds(2)
            DriverWorkflowStore.queue(db, command("stage5-pending-trip", "trip_create", "shift_active", 1, pendingAt.toString()), pendingAt)
            val source = NativeSnapshotBuilder.build(db, NativeBackupRecovery::isInternalRecord, "stage5-test", at)
            val encrypted = NativeBackupV2Package.create(
                source.snapshot.toString().toByteArray(Charsets.UTF_8), source.manifest, recoveryKey,
            )

            // Preserve Android-local selected-driver/person bindings as the production
            // replacement contract requires; clear portable state before encrypted restore.
            db.records().list().filterNot { row ->
                row.id == "work:selected-driver" || row.id.startsWith("identity:driver-person-link:") ||
                    row.id.startsWith("identity:person:")
            }.forEach { db.records().remove(it.id) }
            db.logBookEvents().clear()
            val restored = NativeBackupRestoreCoordinator.restoreEncrypted(
                db, encrypted, recoveryKey,
                { NativeSnapshotBuilder.build(db, NativeBackupRecovery::isInternalRecord, "stage5-reopen", at) },
            )
            NativeBackupRestoreCoordinator.markVerified(db, restored.checkpointId)
            NativeBackupRestoreCoordinator.discardVerified(db, restored.checkpointId)
            db.close()

            db = Room.databaseBuilder(context, LocalDatabase::class.java, name)
                .allowMainThreadQueries().build()
            assertEquals(emptyList<String>(), NativeStartupRecovery.ensure(db))
            val pending = DriverWorkflowStore.reactivate(db, "stage5-pending-trip")
            assertEquals("pending_location", pending.getString("status"))
            val gps = JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
                .put("horizontalAccuracyM", 8.0).put("fixAt", pendingAt.toString())
                .put("provider", "stage5-restored-test")
            val completed = DriverWorkflowStore.complete(db, "stage5-pending-trip", gps, pendingAt.plusSeconds(1))
            val replayed = DriverWorkflowStore.complete(db, "stage5-pending-trip", gps, pendingAt.plusSeconds(2))
            assertEquals("going_to_pickup", completed.getString("state"))
            assertEquals(2, completed.getInt("revision"))
            assertEquals(2, replayed.getInt("revision"))

            val committed = DriverWorkflowStore.listEvents(db).filter { it.optString("eventId") == "stage5-pending-trip" }
            val outbox = db.records().list().filter { it.id.startsWith("driver-outbox:") &&
                JSONObject(it.json).optString("eventId") == "stage5-pending-trip" }
            assertEquals(1, committed.size)
            assertEquals(1, outbox.size)
            assertEquals(2, db.logBookEvents().list().size)

            // Model the receiving integration's durable eventId dedupe and acknowledge
            // the outbox; a second replay must have no remaining business effect.
            val appliedEventIds = mutableSetOf<String>()
            var effects = 0
            repeat(2) {
                DriverWorkflowOutbox.listUndeliveredEvents(db).forEach { event ->
                    if (appliedEventIds.add(event.optString("eventId"))) effects += 1
                    DriverWorkflowOutbox.markEventDelivered(db, event.optString("eventId"))
                }
            }
            assertEquals(setOf("stage5-pending-trip"), appliedEventIds)
            assertEquals(1, effects)
            assertEquals(emptyList<JSONObject>(), DriverWorkflowOutbox.listUndeliveredEvents(db))
            assertEquals(1, db.records().list().count { it.id.startsWith("driver-outbox:") &&
                JSONObject(it.json).optString("eventId") == "stage5-pending-trip" })
        } finally {
            db.close()
            vehicleRegistration.close()
            driverRegistration.close()
            context.deleteDatabase(name)
        }
    }
}
