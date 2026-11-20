package `in`.samtravels.app

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
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
        assertEquals("feature:vehicle:MH01AB1234", operating.getJSONObject("vehicle").getString("recordId"))
        assertEquals("exactly_one_active", operating.getJSONObject("driver").getString("cardinality"))
        assertEquals("feature:driver-records:driver:driver-001", operating.getJSONObject("driver").getString("profileRecordId"))
        assertEquals("work:selected-driver", operating.getJSONObject("driver").getString("selectionRecordId"))
        val pairing = operating.getJSONObject("currentPairing")
        assertEquals("exactly_one_current_assignment", pairing.getString("cardinality"))
        assertEquals("feature:driver-records:assignment:driver-001", pairing.getString("assignmentHistoryRecordId"))
        assertEquals("feature:vehicle:MH01AB1234", pairing.getString("vehicleId"))
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
        assertEquals("contract_seed_only", fixture.getString("status"))
    }
}
