package `in`.samtravels.app
import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
            val transitions = listOf(
                Triple("shift_start", "event-shift-start-001", at),
                Triple("trip_start", "event-trip-start-001", "2026-11-01T05:00:00.000Z"),
                Triple("trip_end", "event-trip-end-001", "2026-11-01T05:30:00.000Z"),
            )
            for ((eventType, eventId, transitionAt) in transitions) {
                val current = DriverWorkflowStore.snapshot(database)
                val command = JSONObject()
                    .put("schemaVersion", 1)
                    .put("commandId", eventId)
                    .put("eventId", eventId)
                    .put("eventType", eventType)
                    .put("originSurface", "pwa")
                    .put("transitionAt", transitionAt)
                    .put("expectedPriorState", current.getString("state"))
                    .put("expectedRevision", current.getInt("revision"))
                    .put("idempotencyKey", eventId)
                DriverWorkflowStore.queue(database, command, java.time.Instant.parse(transitionAt))
                val gps = JSONObject()
                    .put("latitude", 19.076)
                    .put("longitude", 72.8777)
                    .put("horizontalAccuracyM", 8)
                    .put("fixAt", transitionAt)
                    .put("provider", "android-test")
                DriverWorkflowStore.complete(database, eventId, gps, java.time.Instant.parse(transitionAt))
            }

            val source = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "shared-seven-domain-fixture",
            )
            assertEquals(fixture.getJSONObject("canonicalSnapshotContract").getString("format"), source.snapshot.getString("format"))
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
            assertTrue(participantIds.containsAll(setOf(
                "business-settings-records", "vehicle-records", "driver-records",
                "compliance-records", "maintenance-records", "finance-records",
                "business-expenses-records", "performance-records",
            )))
            val snapshotRows = source.snapshot.getJSONArray("records")
            assertTrue((0 until snapshotRows.length()).none {
                snapshotRows.getJSONObject(it).optString("participantId") == "business-settings-records"
            })
            assertTrue((0 until source.snapshot.getJSONArray("participants").length()).any {
                source.snapshot.getJSONArray("participants").getJSONObject(it).optString("id") == "business-settings-records"
            })
            assertEquals(3, database.logBookEvents().list().size)
            val paymentLedger = JSONObject(database.records().get(
                "feature:finance:payments:123e4567-e89b-42d3-a456-426614174000")!!.json)
                .getJSONObject("data").getJSONArray("entries")
            assertEquals(1, paymentLedger.length())
            assertEquals("fixture-payment-001", paymentLedger.getJSONObject(0).getString("id"))
            val expectedWorkIds = (0 until fixture.getJSONObject("populatedGraph").getJSONObject("work").getJSONArray("eventIds").length())
                .map { fixture.getJSONObject("populatedGraph").getJSONObject("work").getJSONArray("eventIds").getString(it) }
            assertEquals(expectedWorkIds.toSet(), database.logBookEvents().list().map { it.eventId }.toSet())
            assertEquals(3, database.records().list().count { it.id.startsWith("driver-intent:") })
            assertEquals(3, database.records().list().count { it.id.startsWith("driver-outbox:") })

            // A destination-only sentinel proves the production replacement is
            // authoritative and removes rows absent from the imported snapshot.
            database.records().put(StoredRecord(
                "pre-restore-only-sentinel",
                JSONObject().put("id", "pre-restore-only-sentinel").put("schemaVersion", 1)
                    .put("createdAt", at).put("updatedAt", at).put("source", "android")
                    .put("revision", 1).put("data", JSONObject().put("sentinel", true)).toString(),
                1, at,
            ))
            val emptyOwnerStale = JSONObject()
                .put("id", "feature:business-settings:business").put("schemaVersion", 1)
                .put("createdAt", at).put("updatedAt", at).put("source", "android")
                .put("revision", 1).put("data", JSONObject().put("schemaVersion", 1).put("businessStartDate", "2026-01-01"))
            database.records().put(StoredRecord(
                "feature:business-settings:business", emptyOwnerStale.toString(), 1, at,
            ))
            // Import the TypeScript-produced package containing this same
            // populated seven-domain + Work + Log Book canonical graph.
            val typescriptPackage = JSONObject(
                InstrumentationRegistry.getInstrumentation().context.assets
                    .open("generated/ts-populated-semantic-backup-v2.json")
                    .bufferedReader().use { it.readText() },
            )
            val typescriptRestore = NativeBackupRestoreCoordinator.restoreEncrypted(
                database,
                typescriptPackage.getJSONObject("backup"),
                typescriptPackage.getString("recoveryKey"),
                { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "read-back-ts") },
            )
            assertEquals(source.snapshot.getJSONArray("records").length(), typescriptRestore.restoredCount)
            val afterTypescriptRestore = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "after-typescript-restore",
            )
            assertEquals(
                canonical(source.snapshot.getJSONArray("records")),
                canonical(afterTypescriptRestore.snapshot.getJSONArray("records")),
            )
            NativeBackupRestoreCoordinator.markVerified(database, typescriptRestore.checkpointId)
            NativeBackupRestoreCoordinator.discardVerified(database, typescriptRestore.checkpointId)

            // Exercise the Android writer through the same production Room path.
            val encrypted = NativeBackupV2Package.create(
                source.snapshot.toString().toByteArray(Charsets.UTF_8),
                source.manifest,
                "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            )
            val recoveryKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
            context.openFileOutput("android-populated-semantic-backup-v2.json", Context.MODE_PRIVATE).use { output ->
                output.write(JSONObject().put("recoveryKey", recoveryKey).put("backup", encrypted)
                    .toString().toByteArray(Charsets.UTF_8))
            }
            val decryptedForAssertion = NativeBackupV2Package.decrypt(encrypted, recoveryKey)
            assertEquals(source.snapshot.toString(), decryptedForAssertion.toString(Charsets.UTF_8))

            // Every pre-authentication/validation failure must leave the exact
            // destination graph untouched and must not create a recovery journal.
            val destinationBeforeRejectedPackages = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "before-rejected-package",
            )
            fun assertRejectedWithoutMutation(candidate: JSONObject, key: String = recoveryKey) {
                assertTrue(runCatching {
                    NativeBackupRestoreCoordinator.restoreEncrypted(
                        database, candidate, key,
                        { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "rejected-readback") },
                    )
                }.isFailure)
                val after = NativeSnapshotBuilder.build(
                    database, NativeBackupRecovery::isInternalRecord, "after-rejected-package",
                )
                assertEquals(
                    canonical(destinationBeforeRejectedPackages.snapshot.getJSONArray("records")),
                    canonical(after.snapshot.getJSONArray("records")),
                )
                assertEquals(0, database.records().list().count {
                    it.id.startsWith(NativeBackupRecovery.CHECKPOINT_PREFIX) ||
                        it.id.startsWith(NativeBackupRecovery.JOURNAL_PREFIX)
                })
            }
            assertRejectedWithoutMutation(JSONObject(encrypted.toString()), "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            assertRejectedWithoutMutation(JSONObject(encrypted.toString()).apply {
                getJSONObject("payload").put("ciphertext", "AA==")
            })
            assertRejectedWithoutMutation(JSONObject(encrypted.toString()).apply {
                getJSONObject("manifest").put("snapshotRevision", 999)
            })
            assertRejectedWithoutMutation(JSONObject(encrypted.toString()).apply {
                remove("payload")
            })
            assertRejectedWithoutMutation(JSONObject(encrypted.toString()).apply {
                getJSONObject("manifest").put("format", "backup-encryption-v99")
            })

            val restored = NativeBackupRestoreCoordinator.restoreEncrypted(
                database, encrypted, "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
                { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "read-back") },
            )
            assertEquals(source.snapshot.getJSONArray("records").length(), restored.restoredCount)
            assertNull(database.records().get("pre-restore-only-sentinel"))
            assertNull(database.records().get("feature:business-settings:business"))
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
            assertEquals(3, database.logBookEvents().list().size)
            assertEquals(3, database.records().list().count { it.id.startsWith("driver-outbox:") })
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
