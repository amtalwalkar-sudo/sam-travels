package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class OfflineFirstWorkPersistenceTest {
    @Test fun shiftCommitAndOutboxRemainDurableWithNetworkPolicyDisabled() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "offline-first-work-persistence.db"
        context.deleteDatabase(databaseName)
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()
        var db = builder.build()
        val at = Instant.parse("2026-11-17T10:00:00Z")
        try {
            DriverWorkflowIdentityTestFixtures.seed(db, "offline-driver", "offline-person")
            val vehicleId = "feature:vehicle:MH01AB1234"
            fun putBusinessRecord(id: String, data: JSONObject) {
                val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
                    .put("createdAt", at.toString()).put("updatedAt", at.toString())
                    .put("source", "android").put("revision", 1).put("data", data)
                db.records().put(StoredRecord(id, envelope.toString(), 1, at.toString()))
            }
            putBusinessRecord("feature:driver-records:assignment:offline-driver",
                JSONObject().put("schemaVersion", 1).put("driverId", "offline-driver")
                    .put("assignments", org.json.JSONArray().put(JSONObject()
                        .put("assignmentId", "offline-assignment").put("vehicleId", vehicleId)
                        .put("assignedAt", at.toString()))))
            putBusinessRecord(vehicleId, JSONObject().put("schemaVersion", 1)
                .put("registrationNumber", "MH01AB1234").put("make", "Make").put("model", "Model")
                .put("vehicleType", "Sedan").put("fuelType", "CNG").put("yearOfManufacture", 2024)
                .put("ownership", "Owned").put("lifecycleState", "active"))
            db.records().put(StoredRecord(
                "network-policy",
                JSONObject().put("id", "network-policy").put("schemaVersion", 1)
                    .put("createdAt", at.toString()).put("updatedAt", at.toString())
                    .put("source", "android").put("revision", 1)
                    .put("data", JSONObject().put("enabled", false)).toString(),
                1,
                at.toString(),
            ))
            val command = JSONObject()
                .put("schemaVersion", 1)
                .put("commandId", "offline-shift-start")
                .put("eventId", "offline-shift-start")
                .put("eventType", "shift_start")
                .put("workflowVersion", 2)
                .put("originSurface", "native_overlay")
                .put("transitionAt", at.toString())
                .put("expectedPriorState", "idle")
                .put("expectedRevision", 0)
                .put("idempotencyKey", "offline-shift-start")
                .put("odometer", JSONObject().put("schemaVersion", 1).put("readingKm", 45100))
            DriverWorkflowStore.queue(db, command, at)
            val completed = DriverWorkflowStore.complete(
                db,
                "offline-shift-start",
                JSONObject().put("latitude", 19.076).put("longitude", 72.8777)
                    .put("horizontalAccuracyM", 8.0).put("fixAt", at.toString())
                    .put("provider", "android-offline-test"),
                at,
            )
            assertEquals("shift_active", completed.getString("state"))
            assertEquals(45100, completed.getLong("shiftStartOdometerKm"))
            assertEquals(1, DriverWorkflowStore.listEvents(db).size)
            assertEquals(1, DriverWorkflowOutbox.listUndeliveredEvents(db).size)
            assertEquals(false, JSONObject(db.records().get("network-policy")!!.json)
                .getJSONObject("data").getBoolean("enabled"))

            val vehicleId = "feature:vehicle:MH01AB1234"
            val fuelId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174099"
            val fuelEnvelope = JSONObject().put("id", fuelId).put("schemaVersion", 1)
                .put("createdAt", at.toString()).put("updatedAt", at.toString())
                .put("source", "android").put("revision", 1)
                .put("businessDate", "2026-11-17")
                .put("data", JSONObject().put("schemaVersion", 1).put("kind", "fuel_purchase")
                    .put("id", fuelId).put("revision", 1).put("businessDate", "2026-11-17")
                    .put("occurredAt", at.toString()).put("vehicleId", vehicleId)
                    .put("odometerKm", 45100).put("pricePaisePerKg", 9000)
                    .put("amountPaise", 18000).put("partialRefill", false))
            db.records().put(StoredRecord(fuelId, fuelEnvelope.toString(), 1, at.toString()))
            db.close()

            db = builder.build()
            assertEquals("shift_active", DriverWorkflowStore.snapshot(db).getString("state"))
            assertEquals(45100, DriverWorkflowStore.snapshot(db).getLong("shiftStartOdometerKm"))
            assertEquals(1, DriverWorkflowStore.listEvents(db).size)
            assertEquals(1, DriverWorkflowOutbox.listUndeliveredEvents(db).size)
            assertNotNull(db.records().get("driver-intent:offline-shift-start"))
            assertEquals(18_000, JSONObject(db.records().get(fuelId)!!.json)
                .getJSONObject("data").getInt("amountPaise"))
        } finally {
            db.close()
            context.deleteDatabase(databaseName)
        }
    }
}
