package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class DriverWorkflowAtomicFailureTest {
    private data class Boundary(val name: String, val sql: String)

    private val boundaries = listOf(
        Boundary(
            "event",
            "CREATE TRIGGER fail_event BEFORE INSERT ON logbook_events BEGIN SELECT RAISE(ABORT, 'injected_event_write_failure'); END",
        ),
        Boundary(
            "state",
            "CREATE TRIGGER fail_state BEFORE INSERT ON records WHEN NEW.id = 'driver-state' BEGIN SELECT RAISE(ABORT, 'injected_state_write_failure'); END",
        ),
        Boundary(
            "intent",
            "CREATE TRIGGER fail_intent BEFORE INSERT ON records WHEN NEW.id = 'driver-intent:atomic-failure' BEGIN SELECT RAISE(ABORT, 'injected_intent_write_failure'); END",
        ),
        Boundary(
            "outbox",
            "CREATE TRIGGER fail_outbox BEFORE INSERT ON records WHEN NEW.id = 'driver-outbox:1' BEGIN SELECT RAISE(ABORT, 'injected_outbox_write_failure'); END",
        ),
    )

    @Test fun everyCompletionWriteFailureRollsBackTheWholeNativeTransitionAcrossReopen() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        boundaries.forEachIndexed { index, boundary ->
            val databaseName = "driver-workflow-atomic-failure-$index.db"
            context.deleteDatabase(databaseName)
            val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
                .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
                .allowMainThreadQueries()
            var db = builder.build()
            val at = Instant.now()
            try {
                DriverWorkflowIdentityTestFixtures.seed(db, "atomic-driver", "atomic-person")
                val command = JSONObject()
                    .put("schemaVersion", 1)
                    .put("commandId", "atomic-failure")
                    .put("eventId", "atomic-failure")
                    .put("eventType", "shift_start")
                    .put("originSurface", "native_overlay")
                    .put("transitionAt", at.toString())
                    .put("expectedPriorState", "idle")
                    .put("expectedRevision", 0)
                    .put("idempotencyKey", "atomic-failure")
                DriverWorkflowStore.queue(db, command, at)
                db.openHelper.writableDatabase.execSQL(boundary.sql)

                val failure = runCatching {
                    DriverWorkflowStore.complete(
                        db,
                        "atomic-failure",
                        JSONObject()
                            .put("latitude", 19.076)
                            .put("longitude", 72.8777)
                            .put("horizontalAccuracyM", 8.0)
                            .put("fixAt", at.toString())
                            .put("provider", "android-atomic-failure-test"),
                        at,
                    )
                }.exceptionOrNull()
                assertTrue("${boundary.name} write must fail", failure != null)

                db.openHelper.writableDatabase.execSQL(
                    "DROP TRIGGER ${if (index == 0) "fail_event" else "fail_${boundary.name}"}",
                )
                assertUncommitted(db)
                db.close()

                db = builder.build()
                assertUncommitted(db)
            } finally {
                db.close()
                context.deleteDatabase(databaseName)
            }
        }
    }

    private fun assertUncommitted(db: LocalDatabase) {
        assertEquals("idle", DriverWorkflowStore.snapshot(db).getString("state"))
        assertEquals(0, DriverWorkflowStore.snapshot(db).getInt("revision"))
        assertEquals(0, DriverWorkflowStore.listEvents(db).size)
        assertEquals(
            "pending_location",
            JSONObject(db.records().get("driver-intent:atomic-failure")!!.json).getString("status"),
        )
        assertEquals(0, db.records().list().count { it.id.startsWith("driver-outbox:") })
    }
}
