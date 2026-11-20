package `in`.samtravels.app
import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4
@RunWith(AndroidJUnit4::class)
class SharedSevenDomainBackupLifecycleTest {
    @Test fun sharedSevenDomainFixtureSurvivesProductionRoomRestoreReopenAndReexport() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "shared-seven-domain-lifecycle.db"
        context.deleteDatabase(name)

        // Register every feature-owned Room participant before snapshot creation.
        NativeBusinessSettingsBackup.ensureRegistered()
        NativeVehicleBackup.ensureRegistered()
        NativeDriverRecordsBackup.ensureRegistered()
        NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered()
        NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered()
        NativePerformanceBackup.ensureRegistered()

        val fixture = InstrumentationRegistry.getInstrumentation().context.assets
            .open("semantic-backup-lifecycle-v1.json")
            .bufferedReader().use { JSONObject(it.readText()) }
        val graph = fixture.getJSONObject("populatedGraph")
        val at = "2026-11-01T04:45:00.000Z"
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, name)
            .allowMainThreadQueries()
        var database = builder.build()
        try {
            val records = graph.getJSONArray("records")
            for (index in 0 until records.length()) {
                val row = records.getJSONObject(index)
                val id = row.getString("id")
                val envelope = JSONObject(row.toString())
                database.records().put(StoredRecord(
                    id, envelope.toString(), row.getInt("schemaVersion"), row.getString("updatedAt"),
                ))
            }

            // Populate real Work intent/state/outbox and Log Book event rows via
            // the Room workflow transaction, using the fixture's configured pair.
            DriverWorkflowIdentityTestFixtures.seed(database, "driver-001", "synthetic-person-001")
            val eventId = "event-shift-start-001"
            val command = JSONObject()
                .put("schemaVersion", 1)
                .put("commandId", eventId)
                .put("eventId", eventId)
                .put("eventType", "shift_start")
                .put("originSurface", "native_overlay")
                .put("transitionAt", at)
                .put("expectedPriorState", "idle")
                .put("expectedRevision", 0)
                .put("idempotencyKey", eventId)
            DriverWorkflowStore.queue(database, command, java.time.Instant.parse(at))
            val gps = JSONObject()
                .put("latitude", 19.076)
                .put("longitude", 72.8777)
                .put("horizontalAccuracyM", 8)
                .put("fixAt", at)
                .put("provider", "android-test")
            DriverWorkflowStore.complete(database, eventId, gps, java.time.Instant.parse(at))

            val source = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "shared-seven-domain-fixture",
            )
            // Compare every exported platform record to the exact shared fixture
            // envelope, not merely its ID or the later Room round-trip snapshot.
            val expectedFixtureRecords = (0 until records.length()).associate { index ->
                val row = records.getJSONObject(index)
                row.getString("id") to canonicalJson(row)
            }
            val exportedFixtureRecords = (0 until source.snapshot.getJSONArray("records").length()).mapNotNull { index ->
                val row = source.snapshot.getJSONArray("records").getJSONObject(index)
                val id = row.optString("id")
                if (expectedFixtureRecords.containsKey(id)) id to canonicalJson(JSONObject(row.getString("json"))) else null
            }.toMap()
            assertEquals(expectedFixtureRecords, exportedFixtureRecords)
            val participantIds = NativeBackupCoverage.registeredParticipantIds()
            assertEquals(true, participantIds.containsAll(setOf(
                "business-settings-records", "vehicle-records", "driver-records",
                "compliance-records", "maintenance-records", "finance-records",
                "business-expenses-records", "performance-records",
            )))
            assertEquals(1, database.logBookEvents().list().size)
            assertEquals(1, database.records().list().count { it.id.startsWith("driver-intent:") })
            assertEquals(1, database.records().list().count { it.id.startsWith("driver-outbox:") })

            // A destination-only sentinel proves the production replacement is
            // authoritative and removes rows absent from the imported snapshot.
            database.records().put(StoredRecord(
                "pre-restore-only-sentinel",
                JSONObject().put("id", "pre-restore-only-sentinel").put("schemaVersion", 1)
                    .put("createdAt", at).put("updatedAt", at).put("source", "android")
                    .put("revision", 1).put("data", JSONObject().put("sentinel", true)).toString(),
                1, at,
            ))
            val restored = NativeBackupRestoreCoordinator.restore(
                database, source.snapshot, source.manifest,
                { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "read-back") },
            )
            assertEquals(source.snapshot.getJSONArray("records").length(), restored.restoredCount)
            assertNull(database.records().get("pre-restore-only-sentinel"))
            NativeBackupRestoreCoordinator.markVerified(database, restored.checkpointId)
            NativeBackupRestoreCoordinator.discardVerified(database, restored.checkpointId)
            database.close()

            // Reopen the same durable Room file, run the production startup gate,
            // and compare the full normalized feature + Work + Log Book snapshot.
            database = builder.build()
            NativeStartupRecovery.invalidate(database)
            assertEquals(emptyList<String>(), NativeStartupRecovery.ensure(database))
            val reopened = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "reopened",
            )
            assertEquals(
                canonical(source.snapshot.getJSONArray("records")),
                canonical(reopened.snapshot.getJSONArray("records")),
            )
            assertEquals(1, database.logBookEvents().list().size)
            assertEquals(1, database.records().list().count { it.id.startsWith("driver-outbox:") })
            val reexported = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "reexport",
            )
            assertEquals(
                canonical(reopened.snapshot.getJSONArray("records")),
                canonical(reexported.snapshot.getJSONArray("records")),
            )
        } finally {
            database.close()
            context.deleteDatabase(name)
        }
    }

    private fun canonical(records: JSONArray): List<String> =
        (0 until records.length()).map { index ->
            val row = records.getJSONObject(index)
            listOf(row.getString("participantId"), row.getString("id"), row.getString("json"),
                row.getInt("schemaVersion").toString(), row.getString("updatedAt")).joinToString("|")
        }.sorted()

    private fun canonicalJson(value: Any?): String = when (value) {
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(
            prefix = "{", postfix = "}",
        ) { key -> JSONObject.quote(key) + ":" + canonicalJson(value.get(key)) }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") {
            canonicalJson(value.get(it))
        }
        JSONObject.NULL -> "null"
        is String -> JSONObject.quote(value)
        else -> value.toString()
    }
}
