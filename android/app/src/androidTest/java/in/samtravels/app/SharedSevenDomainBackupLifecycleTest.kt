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
        val workFixture = graph.getJSONObject("work")
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

            SharedFixtureWorkSeeder.seed(database, workFixture)

            val source = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "shared-seven-domain-fixture",
            )

            SharedFixtureNegativeValidatorAssertions.assertRejected(source.snapshot.getJSONArray("records"))
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
            assertEquals(6, database.logBookEvents().list().size)
            val paymentLedger = JSONObject(database.records().get(
                "feature:finance:payments:123e4567-e89b-42d3-a456-426614174000")!!.json)
                .getJSONObject("data").getJSONArray("entries")
            assertEquals(5, paymentLedger.length())
            assertEquals("fixture-payment-001", paymentLedger.getJSONObject(0).getString("id"))
            assertEquals("reversal", paymentLedger.getJSONObject(1).getString("kind"))
            assertEquals("fixture-settlement-001", paymentLedger.getJSONObject(4).getString("id"))
            val prepayment = database.records().get("feature:finance:prepayments:123e4567-e89b-42d3-a456-426614174000") ?: error("fixture prepayment state missing")
            assertEquals(2, JSONObject(prepayment.json).getJSONObject("data").getInt("currentScheduleVersion"))
            val tf = workFixture.getJSONObject("tripFinancial"); val op = tf.getString("operationId")
            val tripFinancial = JSONObject(database.records().get(tf.getString("recordId"))!!.json).getJSONObject("data")
            assertEquals(listOf<Any>("submitted", 252000L, 32000L, 25000L, op), listOf(tripFinancial.getString("status"), tripFinancial.getLong("farePaise"), tripFinancial.getLong("tollPaise"), tripFinancial.getLong("parkingPaise"), tripFinancial.getString("operationId")))
            val draftId = "__sam_travels_form_working_copy__:work.trip-completed-financials:" + tf.getString("tripId"); val draft = JSONObject(database.records().get(draftId)!!.json).getJSONObject("data")
            assertEquals(listOf<Any>(9, "submitted", op, 252000L), listOf(draft.getInt("revision"), draft.getString("status"), draft.getString("operationId"), draft.getJSONObject("values").getLong("farePaise")))
            val expectedWorkIds = (0 until fixture.getJSONObject("populatedGraph").getJSONObject("work").getJSONArray("eventIds").length())
                .map { fixture.getJSONObject("populatedGraph").getJSONObject("work").getJSONArray("eventIds").getString(it) }
            assertEquals(expectedWorkIds.toSet(), database.logBookEvents().list().map { it.eventId }.toSet())
            val intentRows = database.records().list().filter { it.id.startsWith("driver-intent:") }
            assertEquals(workFixture.getJSONArray("intentIds").length(), intentRows.size)
            assertEquals(1, intentRows.count { JSONObject(it.json).optString("status") == "pending_location" })
            assertEquals(1, intentRows.count { JSONObject(it.json).optString("status") == "needs_attention" })
            val outboxRows = database.records().list().filter { it.id.startsWith("driver-outbox:") }
            assertEquals(workFixture.getJSONArray("outboxIds").length(), outboxRows.size)
            assertEquals(5, outboxRows.count { JSONObject(it.json).optBoolean("delivered") })
            assertEquals(1, outboxRows.count { !JSONObject(it.json).optBoolean("delivered") })

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
            // Room's selected-driver pointer and person-link records are local
            // runtime identity bindings, not portable business records. They
            // must survive replacement while the canonical business graph is
            // restored exactly from the TypeScript package.
            assertTrue(database.records().get("work:selected-driver") != null)
            assertTrue(database.records().get("identity:driver-person-link:driver-001") != null)
            val afterTypescriptRestore = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "after-typescript-restore",
            )
            SharedBackupFixtureAssertions.assertCanonicalRecordsEqual(
                "after TypeScript restore",
                source.snapshot.getJSONArray("records"),
                afterTypescriptRestore.snapshot.getJSONArray("records"),
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

            SharedCleanBackupDestinationAssertions.assertEncryptedRoomRestore(
                context, source.snapshot.getJSONArray("records"), encrypted, recoveryKey,
                "shared-seven-domain-clean-destination.db",
            )
            context.openFileOutput("android-populated-semantic-backup-v2.json", Context.MODE_PRIVATE).use { output ->
                val artifact = "{\"recoveryKey\":${JSONObject.quote(recoveryKey)},\"backup\":${NativeBackupV2Package.serialize(encrypted)}}"
                output.write(artifact.toByteArray(Charsets.UTF_8))
            }
            val decryptedForAssertion = NativeBackupV2Package.decrypt(encrypted, recoveryKey)
            assertEquals(source.snapshot.toString(), decryptedForAssertion.toString(Charsets.UTF_8))

            // Every pre-authentication/validation failure must leave the exact
            // destination graph untouched and must not create a recovery journal.
            val destinationBeforeRejectedPackages = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "before-rejected-package",
            )
            fun assertRejectedWithoutMutation(
                candidate: JSONObject,
                key: String = recoveryKey,
                maxPackageBytes: Long = MAX_BACKUP_PACKAGE_BYTES,
            ) {
                assertTrue(runCatching {
                    NativeBackupRestoreCoordinator.restoreEncrypted(
                        database, candidate, key,
                        { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "rejected-readback") },
                        maxPackageBytes = maxPackageBytes,
                    )
                }.isFailure)
                val after = NativeSnapshotBuilder.build(
                    database, NativeBackupRecovery::isInternalRecord, "after-rejected-package",
                )
                assertEquals(
                    SharedBackupFixtureAssertions.canonicalRecords(destinationBeforeRejectedPackages.snapshot.getJSONArray("records")),
                    SharedBackupFixtureAssertions.canonicalRecords(after.snapshot.getJSONArray("records")),
                )
                assertEquals(0, database.records().list().count {
                    it.id.startsWith(NativeBackupRecovery.CHECKPOINT_PREFIX) ||
                        it.id.startsWith(NativeBackupRecovery.JOURNAL_PREFIX)
                })
            }
            assertRejectedWithoutMutation(JSONObject(encrypted.toString()), "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            assertRejectedWithoutMutation(JSONObject(encrypted.toString()), maxPackageBytes = 16L)
            val unsupportedSchemaPackage = NativeBackupV2Package.create(
                source.snapshot.toString().toByteArray(Charsets.UTF_8),
                JSONObject(source.manifest.toString()).put("schemaVersion", 99),
                recoveryKey,
            )
            assertRejectedWithoutMutation(unsupportedSchemaPackage)
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
            val futureSchemaManifest = JSONObject(source.manifest.toString())
                .put("schemaVersion", BackupSnapshotContract.CURRENT_SCHEMA_VERSION + 1)
            val futureSchemaSnapshot = JSONObject(source.snapshot.toString())
                .put("schemaVersion", BackupSnapshotContract.CURRENT_SCHEMA_VERSION + 1)
            val futureSchemaPackage = NativeBackupV2Package.create(
                futureSchemaSnapshot.toString().toByteArray(Charsets.UTF_8),
                futureSchemaManifest,
                recoveryKey,
            )
            assertRejectedWithoutMutation(futureSchemaPackage)
            val futureSnapshotFormat = JSONObject(source.snapshot.toString())
                .put("format", "sam-travels-canonical-snapshot-v99")
            val futureSnapshotFormatPackage = NativeBackupV2Package.create(
                futureSnapshotFormat.toString().toByteArray(Charsets.UTF_8),
                source.manifest,
                recoveryKey,
            )
            assertRejectedWithoutMutation(futureSnapshotFormatPackage)

            // A correctly authenticated package with a dangling Driver→Vehicle
            // reference must fail semantic validation before startup recovery.
            val invalidSemanticSnapshot = JSONObject(source.snapshot.toString())
            val invalidRows = invalidSemanticSnapshot.getJSONArray("records")
            val assignmentRow = (0 until invalidRows.length()).map { invalidRows.getJSONObject(it) }
                .single { it.optString("id").startsWith("feature:driver-records:assignment:") }
            val assignmentEnvelope = JSONObject(assignmentRow.getString("json"))
            assignmentEnvelope.getJSONObject("data").getJSONArray("assignments")
                .getJSONObject(0).put("vehicleId", "feature:vehicle:MISSING")
            assignmentRow.put("json", assignmentEnvelope.toString())
            val invalidSemanticPackage = NativeBackupV2Package.create(
                invalidSemanticSnapshot.toString().toByteArray(Charsets.UTF_8),
                source.manifest,
                recoveryKey,
            )
            var startupRecoveryCalls = 0
            assertTrue(runCatching {
                NativeBackupRestoreCoordinator.restoreEncrypted(
                    database, invalidSemanticPackage, recoveryKey,
                    { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "invalid-semantic-readback") },
                    beforeRestore = { startupRecoveryCalls += 1 },
                )
            }.isFailure)
            assertEquals(0, startupRecoveryCalls)
            assertEquals(
                SharedBackupFixtureAssertions.canonicalRecords(destinationBeforeRejectedPackages.snapshot.getJSONArray("records")),
                SharedBackupFixtureAssertions.canonicalRecords(NativeSnapshotBuilder.build(
                    database, NativeBackupRecovery::isInternalRecord, "invalid-semantic-after",
                ).snapshot.getJSONArray("records")),
            )
            assertEquals(0, database.records().list().count {
                it.id.startsWith(NativeBackupRecovery.CHECKPOINT_PREFIX) ||
                    it.id.startsWith(NativeBackupRecovery.JOURNAL_PREFIX)
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

            assertEncryptedRoomRestoreRollbackAfterInterruption(
                database, encrypted, recoveryKey, at,
            )
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
                SharedBackupFixtureAssertions.canonicalRecords(source.snapshot.getJSONArray("records")),
                SharedBackupFixtureAssertions.canonicalRecords(reopened.snapshot.getJSONArray("records")),
            )
            assertEquals(6, database.logBookEvents().list().size)
            assertEquals(6, database.records().list().count { it.id.startsWith("driver-outbox:") })
            val reexported = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "reexport",
            )
            SharedBackupFixtureAssertions.assertCanonicalRecordsEqual(
                "reopened Room re-export",
                source.snapshot.getJSONArray("records"),
                reexported.snapshot.getJSONArray("records"),
            )

            // Publish the Android-produced package and semantic oracle for the
            // downstream Browser/Dexie production-restore job.
            val androidArtifact = JSONObject()
                .put("recoveryKey", recoveryKey)
                .put("backup", encrypted)
                .put("expectedSnapshot", source.snapshot)
            context.filesDir.resolve("android-populated-semantic-backup-v2.json")
                .writeText(androidArtifact.toString())

            // Restore the matching TypeScript-produced encrypted package into
            // this same populated Room database through the production path.
            val tsFixture = JSONObject(
                InstrumentationRegistry.getInstrumentation().context.assets
                    .open("generated/ts-populated-semantic-backup-v2.json")
                    .bufferedReader().use { it.readText() },
            )
            val tsParticipants = tsFixture.getJSONObject("backup").getJSONObject("manifest")
                .getJSONArray("participants")
            assertEquals(SharedBackupFixtureAssertions.canonicalParticipants(tsParticipants), SharedBackupFixtureAssertions.canonicalParticipants(source.snapshot.getJSONArray("participants")))
            database.records().put(StoredRecord(
                "typescript-import-destination-sentinel",
                JSONObject().put("id", "typescript-import-destination-sentinel")
                    .put("schemaVersion", 1).put("createdAt", at).put("updatedAt", at)
                    .put("source", "android").put("revision", 1)
                    .put("data", JSONObject().put("sentinel", true)).toString(),
                1, at,
            ))
            val tsExpected = tsFixture.getJSONObject("expectedSnapshot")
            val tsRestored = NativeBackupRestoreCoordinator.restoreEncrypted(
                database,
                tsFixture.getJSONObject("backup"),
                tsFixture.getString("recoveryKey"),
                { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "ts-import-readback") },
            )
            assertEquals(tsExpected.getJSONArray("records").length(), tsRestored.restoredCount)
            assertNull(database.records().get("typescript-import-destination-sentinel"))
            val tsReadback = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "ts-import-reexport",
            )
            SharedBackupFixtureAssertions.assertCanonicalRecordsEqual(
                "TypeScript import readback",
                tsExpected.getJSONArray("records"),
                tsReadback.snapshot.getJSONArray("records"),
            )
            NativeBackupRestoreCoordinator.markVerified(database, tsRestored.checkpointId)
            NativeBackupRestoreCoordinator.discardVerified(database, tsRestored.checkpointId)
            database.close()
            database = builder.build()
            NativeStartupRecovery.invalidate(database)
            assertEquals(emptyList<String>(), NativeStartupRecovery.ensure(database))
            val tsReopened = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "ts-import-reopened",
            )
            SharedBackupFixtureAssertions.assertCanonicalRecordsEqual(
                "TypeScript import after reopen",
                tsExpected.getJSONArray("records"),
                tsReopened.snapshot.getJSONArray("records"),
            )
        } finally {
            database.close()
            context.deleteDatabase(name)
        }
    }

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
