package `in`.samtravels.app

import android.content.Context
import android.os.Process
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * CI runs these two methods in separate instrumentation invocations and force-stops
 * both app/test packages between them. This exercises a real target-process death,
 * not merely closing and reopening a Room instance in one process.
 */
@RunWith(AndroidJUnit4::class)
class DriverWorkflowProcessRestartTest {
    private val databaseName = "driver-workflow-process-restart.db"
    private val preferenceName = "driver-workflow-process-restart"

    @Test fun preparePendingWorkflowForProcessRestart() {
        val app = ApplicationProvider.getApplicationContext<Context>()
        val testContext = InstrumentationRegistry.getInstrumentation().context
        app.deleteDatabase(databaseName)
        testContext.getSharedPreferences(preferenceName, Context.MODE_PRIVATE).edit()
            .putInt("prepared_pid", Process.myPid()).commit()
        val db = Room.databaseBuilder(app, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries().build()
        val created = java.time.Instant.now().minusSeconds(120).toString()
        fun putRecord(id: String, data: JSONObject) {
            val envelope = JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", created)
                .put("updatedAt", created).put("source", "android").put("revision", 1).put("data", data)
            db.records().put(StoredRecord(id, envelope.toString(), 1, created))
        }
        fun command(id: String, event: String, state: String, revision: Int, at: String) = JSONObject()
            .put("schemaVersion", 1).put("workflowVersion", 2).put("commandId", id).put("eventId", id)
            .put("eventType", event).put("originSurface", "native_overlay").put("transitionAt", at)
            .put("expectedPriorState", state).put("expectedRevision", revision).put("idempotencyKey", id)
        try {
            putRecord("work:selected-driver", JSONObject().put("schemaVersion", 1).put("driverId", "restart-driver"))
            putRecord("feature:driver-records:driver:restart-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "restart-driver").put("name", "Restart Driver").put("lifecycleState", "active"))
            putRecord("feature:driver-records:assignment:restart-driver", JSONObject().put("schemaVersion", 1)
                .put("driverId", "restart-driver").put("assignments", JSONArray().put(JSONObject()
                    .put("assignmentId", "restart-assignment").put("vehicleId", "feature:vehicle:MH01JK7890")
                    .put("assignedAt", created))))
            putRecord("feature:vehicle:MH01JK7890", JSONObject().put("schemaVersion", 1)
                .put("registrationNumber", "MH01JK7890").put("make", "Make").put("model", "Model")
                .put("vehicleType", "Sedan").put("fuelType", "Petrol").put("yearOfManufacture", 2024)
                .put("ownership", "Owned").put("lifecycleState", "active"))

            val shiftAt = java.time.Instant.now().minusSeconds(3).toString()
            DriverWorkflowStore.queue(db, command("restart-active-shift", "shift_start", "idle", 0, shiftAt))
            DriverWorkflowStore.complete(db, "restart-active-shift", JSONObject().put("latitude", 19.076)
                .put("longitude", 72.8777).put("horizontalAccuracyM", 8.0).put("fixAt", shiftAt).put("provider", "android-test"))
            val pendingAt = java.time.Instant.now().toString()
            DriverWorkflowStore.queue(db, command("restart-pending-trip", "trip_create", "shift_active", 1, pendingAt))
            assertEquals("shift_active", DriverWorkflowStore.snapshot(db).getString("state"))
            assertEquals("pending_location", JSONObject(db.records().get("driver-intent:restart-pending-trip")!!.json)
                .getString("status"))
        } finally {
            db.close()
        }
    }

    @Test fun recoverPendingWorkflowAfterProcessRestart() {
        val app = ApplicationProvider.getApplicationContext<Context>()
        val testContext = InstrumentationRegistry.getInstrumentation().context
        val prefs = testContext.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)
        val previousPid = prefs.getInt("prepared_pid", -1)
        assertNotEquals("CI must restart the instrumentation/app process between phases", previousPid, Process.myPid())
        val db = Room.databaseBuilder(app, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries().build()
        try {
            assertEquals(emptyList<String>(), NativeStartupRecovery.ensure(db))
            assertEquals("shift_active", DriverWorkflowStore.snapshot(db).getString("state"))
            val pending = DriverWorkflowStore.listPending(db)
                .singleOrNull { it.getJSONObject("command").getString("eventId") == "restart-pending-trip" }
            assertNotNull("Pending transition must survive actual process death", pending)
            assertEquals("pending_location", pending!!.getString("status"))
            val recovered = DriverWorkflowStore.reactivate(db, "restart-pending-trip")
            assertEquals("pending_location", recovered.getString("status"))
        } finally {
            db.close()
            app.deleteDatabase(databaseName)
            prefs.edit().remove("prepared_pid").commit()
        }
    }
}
