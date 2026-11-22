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
class SharedSemanticBackupFixtureTest {
    @Test fun emptyRegisteredParticipantsAreAcceptedAndUnknownOwnersAreRejected() {
        NativeVehicleBackup.ensureRegistered()
        NativeComplianceBackup.ensureRegistered()
        NativeBackupCoverage.validateBusinessRecords(JSONArray(), requireExplicitOwnerTags = true)

        val unknownOwner = JSONArray().put(JSONObject()
            .put("id", "synthetic-unknown-record")
            .put("json", JSONObject().put("id", "synthetic-unknown-record").toString())
            .put("schemaVersion", 1)
            .put("updatedAt", "2026-11-20T00:00:00.000Z")
            .put("participantId", "synthetic-unknown-participant"))
        try {
            NativeBackupCoverage.validateBusinessRecords(unknownOwner, requireExplicitOwnerTags = true)
            throw AssertionError("unknown participant owner must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertEquals(true, expected.message.orEmpty().contains("backup_unknown_participant"))
        }
    }


    @Test fun restoringEmptyParticipantsClearsTheirPreviouslyStoredRows() {
        NativeVehicleBackup.ensureRegistered()
        NativeComplianceBackup.ensureRegistered()
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val at = "2026-11-20T00:00:00.000Z"
            val vehicleId = "feature:vehicle:SYNTHETIC-EMPTY-001"
            val complianceId = "feature:compliance:123e4567-e89b-42d3-a456-426614174000"
            database.records().put(StoredRecord(vehicleId,
                JSONObject().put("id", vehicleId).put("schemaVersion", 1)
                    .put("createdAt", at).put("updatedAt", at).put("source", "test")
                    .put("revision", 1).put("data", JSONObject()).toString(), 1, at))
            database.records().put(StoredRecord(complianceId,
                JSONObject().put("id", complianceId).put("schemaVersion", 1)
                    .put("createdAt", at).put("updatedAt", at).put("source", "test")
                    .put("revision", 1).put("data", JSONObject()).toString(), 1, at))

            database.runInTransaction {
                NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            }

            assertNull(database.records().get(vehicleId))
            assertNull(database.records().get(complianceId))
            NativeBackupCoverage.validateBusinessRecords(
                NativeBackupCoverage.exportBusinessRecords(database) { false },
                requireExplicitOwnerTags = true,
            )
        } finally {
            database.close()
        }
    }

    @Test fun sharedSemanticLifecycleFixtureDeclaresAllParityDomains() {
        // Instrumentation assets are packaged in the test APK, not the target app APK.
        val context = InstrumentationRegistry.getInstrumentation().context
        val fixture = context.assets.open("semantic-backup-lifecycle-v1.json")
            .bufferedReader().use { JSONObject(it.readText()) }
        assertEquals(1, fixture.getInt("schemaVersion"))
        assertEquals("sam-travels-cross-platform-semantic-restore-v1", fixture.getString("fixtureId"))
        assertEquals(listOf("export", "restore", "database_reopen", "startup_recovery", "re_export"),
            (0 until fixture.getJSONArray("lifecycle").length()).map { fixture.getJSONArray("lifecycle").getString(it) })
        assertEquals(listOf("record_ids", "revisions", "references", "event_ordering", "correction_chain_heads",
            "pending_work_and_outbox_state", "calculation_outputs", "source_provenance"),
            (0 until fixture.getJSONArray("comparison").length()).map { fixture.getJSONArray("comparison").getString(it) })
        val operating = fixture.getJSONObject("operatingConfiguration")
        assertEquals("single_vehicle_single_driver", operating.getString("mode"))
        assertEquals("exactly_one_active", operating.getJSONObject("vehicle").getString("cardinality"))
        assertEquals("feature:vehicle:SYNTHETICVEHICLE001", operating.getJSONObject("vehicle").getString("recordId"))
        assertEquals("exactly_one_active", operating.getJSONObject("driver").getString("cardinality"))
        assertEquals("feature:driver-records:driver:driver-001", operating.getJSONObject("driver").getString("profileRecordId"))
        assertEquals("work:selected-driver", operating.getJSONObject("driver").getString("selectionRecordId"))
        val pairing = operating.getJSONObject("currentPairing")
        assertEquals("exactly_one_current_assignment", pairing.getString("cardinality"))
        assertEquals("feature:driver-records:assignment:driver-001", pairing.getString("assignmentHistoryRecordId"))
        assertEquals("feature:vehicle:SYNTHETICVEHICLE001", pairing.getString("vehicleId"))
        assertEquals("driver-001", pairing.getString("driverId"))
        assertEquals("deferred_until_separately_approved", operating.getString("fleetExpansion"))
        val workLineage = fixture.getJSONObject("domains").getJSONObject("work").getJSONArray("lineage")
        assertEquals(true, (0 until workLineage.length()).map { workLineage.getString(it) }
            .containsAll(listOf("configuredDriverId", "configuredVehicleId")))
        val domains = fixture.getJSONObject("domains")
        assertEquals(setOf("finance", "compliance", "maintenance", "businessExpenses", "performance", "work", "logBook"),
            domains.keys().asSequence().toSet())
        val emptyPolicy = fixture.getJSONObject("emptyParticipantPolicy")
        assertEquals(true, emptyPolicy.getString("required").contains("zero records is valid"))
        assertEquals(true, emptyPolicy.getString("restore").contains("clear stale rows"))
        assertEquals(true, emptyPolicy.getString("negative").contains("Unknown participant IDs"))
        assertEquals("populated_production_lifecycle_verified", fixture.getString("status"))
        val graph = fixture.getJSONObject("populatedGraph")
        assertEquals(29, graph.getInt("recordCount"))
        assertEquals(29, graph.getJSONArray("records").length())
        assertEquals(3, graph.getJSONObject("work").getJSONArray("eventIds").length())
        assertEquals(2, graph.getJSONObject("logBook").getJSONArray("events").length())
        assertEquals("driver-001", graph.getJSONObject("work").getString("selectedDriverId"))
        val records = graph.getJSONArray("records")
        val byId = (0 until records.length()).associate { index ->
            val row = records.getJSONObject(index)
            row.getString("id") to row.getJSONObject("data")
        }
        val vehicleId = operating.getJSONObject("vehicle").getString("recordId")
        assertEquals("SYNTHETICVEHICLE001", byId.getValue(vehicleId).getString("registrationNumber"))
        assertEquals(vehicleId, pairing.getString("vehicleId"))
        val assignment = byId.getValue(pairing.getString("assignmentHistoryRecordId"))
        assertEquals(vehicleId, assignment.getJSONArray("assignments").getJSONObject(0).getString("vehicleId"))
        val work = graph.getJSONObject("work")
        assertEquals("driver-001", work.getString("driverId"))
        val events = graph.getJSONObject("logBook").getJSONArray("events")
        assertEquals(2, events.length())
        for (index in 0 until events.length()) {
            val event = events.getJSONObject(index)
            assertEquals(vehicleId, event.getString("vehicleId"))
            assertEquals("driver-001", event.getString("driverId"))
            assertEquals(work.getJSONArray("eventIds").getString(index + 1), event.getString("eventId"))
        }
    }
}
