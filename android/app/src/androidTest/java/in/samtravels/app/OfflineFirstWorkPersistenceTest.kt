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
                .put("originSurface", "native_overlay")
                .put("transitionAt", at.toString())
                .put("expectedPriorState", "idle")
                .put("expectedRevision", 0)
                .put("idempotencyKey", "offline-shift-start")
                .put("odometer", JSONObject().put("schemaVersion", 1).put("readingKm", 1200))
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
            assertEquals(1, DriverWorkflowStore.listEvents(db).size)
            assertEquals(1, DriverWorkflowOutbox.listUndeliveredEvents(db).size)
            assertEquals(false, JSONObject(db.records().get("network-policy")!!.json)
                .getJSONObject("data").getBoolean("enabled"))
            db.close()

            db = builder.build()
            assertEquals("shift_active", DriverWorkflowStore.snapshot(db).getString("state"))
            assertEquals(1, DriverWorkflowStore.listEvents(db).size)
            assertEquals(1, DriverWorkflowOutbox.listUndeliveredEvents(db).size)
            assertNotNull(db.records().get("driver-intent:offline-shift-start"))
        } finally {
            db.close()
            context.deleteDatabase(databaseName)
        }
    }
}
