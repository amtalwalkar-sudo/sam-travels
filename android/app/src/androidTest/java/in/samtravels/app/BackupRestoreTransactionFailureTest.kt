package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BackupRestoreTransactionFailureTest {
    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),
        LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase() = db.close()

    @Test fun injectedFailureDuringReplacementRollsBackTheRoomTransaction() {
        val before = StoredRecord(
            id = "business-record-before",
            json = "{\"value\":\"preserve-me\"}",
            schemaVersion = 1,
            updatedAt = "2026-11-04T00:00:00.000Z",
        )
        db.records().put(before)
        val logBookEvent = LogBookEventRecord("event-before", """{"eventId":"event-before","kind":"trip_completed"}""", 1, before.updatedAt)
        db.logBookEvents().put(logBookEvent)

        var injected = false
        try {
            db.runInTransaction {
                db.records().remove(before.id)
                db.logBookEvents().clear()
                // Simulate an interruption/failure between destructive replacement steps.
                throw IllegalStateException("injected_restore_replacement_failure")
            }
        } catch (error: IllegalStateException) {
            injected = error.message == "injected_restore_replacement_failure"
        }

        assertEquals(true, injected)
        assertNotNull("Room must roll back the deletion after the injected failure", db.records().get(before.id))
        assertEquals(before, db.records().get(before.id))
        assertEquals(listOf(logBookEvent), db.logBookEvents().list())
    }

    @Test fun preRestoreCheckpointSurvivesRoomRestartAndRestoresAuthoritativeRecords() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "stage-four-recovery-checkpoint.db"
        context.deleteDatabase(databaseName)
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()

        fun driverStateRecord(revision: Int, state: String, updatedAt: String): StoredRecord {
            val payload = org.json.JSONObject().put(
                "value",
                org.json.JSONObject().put("schemaVersion", 1).put("revision", revision).put("state", state),
            )
            return StoredRecord("driver-state", payload.toString(), 1, updatedAt)
        }

        var durable = builder.build()
        try {
            durable.records().put(driverStateRecord(0, "idle", "2026-11-06T10:00:00.000Z"))
            val checkpointRecords = NativeBackupCoverage.exportBusinessRecords(durable) { id ->
                id.startsWith("__sam_travels_recovery_checkpoint__:") ||
                    id.startsWith("__sam_travels_recovery_journal__:")
            }
            assertEquals(1, checkpointRecords.length())
            val checkpointId = "stage-four-checkpoint"
            val checkpointKey = "__sam_travels_recovery_checkpoint__:$checkpointId"
            val journalKey = "__sam_travels_recovery_journal__:$checkpointId"
            val now = "2026-11-06T10:02:00.000Z"
            durable.runInTransaction {
                durable.records().put(StoredRecord(
                    checkpointKey,
                    org.json.JSONObject().put("records", checkpointRecords).toString(),
                    1,
                    now,
                ))
                durable.records().put(StoredRecord(
                    journalKey,
                    org.json.JSONObject().put("id", checkpointId).put("createdAt", now)
                        .put("status", "checkpoint").toString(),
                    1,
                    now,
                ))
            }

            val replacement = org.json.JSONArray().put(
                org.json.JSONObject(checkpointRecords.getJSONObject(0).toString())
                    .put("id", "driver-state")
                    .put("json", driverStateRecord(1, "shift_active", "2026-11-06T10:01:00.000Z").json)
                    .put("updatedAt", "2026-11-06T10:01:00.000Z"),
            )
            NativeBackupCoverage.validateBusinessRecords(replacement, requireExplicitOwnerTags = true)
            durable.runInTransaction {
                NativeBackupCoverage.replaceBusinessRecords(durable, replacement)
                durable.records().put(StoredRecord(
                    journalKey,
                    org.json.JSONObject().put("id", checkpointId).put("createdAt", now)
                        .put("status", "restored_unverified").toString(),
                    1,
                    now,
                ))
            }
            assertEquals(1, org.json.JSONObject(
                durable.records().get("driver-state")!!.json,
            ).getJSONObject("value").getInt("revision"))
        } finally {
            durable.close()
        }

        // A new Room instance models process death after replacement but before verification.
        durable = builder.build()
        try {
            val checkpointId = "stage-four-checkpoint"
            val checkpointKey = "__sam_travels_recovery_checkpoint__:$checkpointId"
            val journalKey = "__sam_travels_recovery_journal__:$checkpointId"
            val persistedCheckpoint = durable.records().get(checkpointKey)
            assertNotNull("Pre-restore checkpoint must survive process restart", persistedCheckpoint)
            val checkpointRecords = org.json.JSONObject(persistedCheckpoint!!.json).getJSONArray("records")
            assertEquals("restored_unverified", org.json.JSONObject(
                durable.records().get(journalKey)!!.json,
            ).getString("status"))

            durable.runInTransaction {
                NativeBackupCoverage.replaceBusinessRecords(durable, checkpointRecords)
                durable.records().put(StoredRecord(
                    journalKey,
                    org.json.JSONObject().put("id", checkpointId)
                        .put("createdAt", "2026-11-06T10:02:00.000Z")
                        .put("status", "rollback_complete").toString(),
                    1,
                    "2026-11-06T10:03:00.000Z",
                ))
            }

            val recovered = NativeBackupCoverage.exportBusinessRecords(durable) { id ->
                id.startsWith("__sam_travels_recovery_checkpoint__:") ||
                    id.startsWith("__sam_travels_recovery_journal__:")
            }
            assertEquals(1, recovered.length())
            val restoredPayload = org.json.JSONObject(recovered.getJSONObject(0).getString("json"))
            assertEquals(0, restoredPayload.getJSONObject("value").getInt("revision"))
            assertEquals("idle", restoredPayload.getJSONObject("value").getString("state"))
            assertEquals("rollback_complete", org.json.JSONObject(
                durable.records().get(journalKey)!!.json,
            ).getString("status"))
        } finally {
            durable.close()
            context.deleteDatabase(databaseName)
        }
    }

}
