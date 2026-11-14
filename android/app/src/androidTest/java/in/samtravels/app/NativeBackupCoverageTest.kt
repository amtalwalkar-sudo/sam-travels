package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class NativeBackupCoverageTest {
    @Before fun ensureAllFeatureParticipants() {
        NativeBusinessSettingsBackup.ensureRegistered(); NativeVehicleBackup.ensureRegistered()
        NativeDriverRecordsBackup.ensureRegistered(); NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered(); NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered()
    }
    @Test fun sharedSnapshotManifestIncludesLogBook() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.logBookEvents().put(LogBookEventRecord(
                "scheduled-backup-event",
                """{"eventId":"scheduled-backup-event","kind":"trip_completed"}""",
                1,
                "2026-11-10T04:00:00.000Z",
            ))
            var bundle: NativeSnapshotBundle? = null
            database.runInTransaction {
                bundle = NativeSnapshotBuilder.build(
                    database, NativeBackupRecovery::isInternalRecord, "test-version", "2026-11-10T04:01:00.000Z",
                )
            }
            val result = bundle ?: error("snapshot_bundle_missing")
            val records = result.snapshot.getJSONArray("records")
            val logBookRow = (0 until records.length()).map { records.getJSONObject(it) }
                .single { it.optString("id") == "scheduled-backup-event" }
            assertEquals("logbook-events", logBookRow.getString("participantId"))
            assertEquals(12, result.manifest.getJSONArray("participants").length())
            assertEquals(1, result.manifest.getJSONObject("recordCounts").getInt("records"))
            assertEquals(1, result.snapshot.getInt("schemaVersion"))
        } finally { database.close() }
    }
    @Test fun cancellationFeeBackupRoundTrip() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val now = "2026-11-10T04:00:00.000Z"
            DriverCancellationFeeStore.createPendingObligation(database, "cancelled-trip-1", "cancel-event-1", now, JSONObject("""{"schemaVersion":1,"shiftId":"test-shift","driverId":"test-driver","assignmentId":"test-assignment","vehicleId":"feature:vehicle:test","operationalDate":"2026-11-14"}"""))
            DriverCancellationFeeStore.ensureCancellationFeeDraft(database, "cancelled-trip-1")
            DriverCancellationFeeStore.updateCancellationFeeDraft(database, "cancelled-trip-1", 0L)

            val exported = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
            NativeBackupCoverage.validateBusinessRecords(exported)
            val obligationId = "work:trip-financial-obligation:cancelled-trip-1"
            val draftId = "__sam_travels_form_working_copy__:work.trip-cancellation-fee:cancelled-trip-1"
            val rows = (0 until exported.length()).map { exported.getJSONObject(it) }
            assertTrue(rows.any { it.optString("id") == obligationId })
            assertTrue(rows.any { it.optString("id") == draftId })

            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertTrue(database.records().get(obligationId) == null)
            assertTrue(database.records().get(draftId) == null)
            NativeBackupCoverage.replaceBusinessRecords(database, exported)

            val restoredObligation = JSONObject(database.records().get(obligationId)!!.json)
            assertEquals("pending", restoredObligation.getJSONObject("data").getString("status"))
            val restoredDraft = JSONObject(database.records().get(draftId)!!.json).getJSONObject("data")
            assertEquals("work.trip-cancellation-fee", restoredDraft.getString("formId"))
            assertEquals(0L, restoredDraft.getJSONObject("values").getLong("cancellationFeePaise"))
            assertEquals("in_progress", restoredDraft.getString("status"))
        } finally { database.close() }
    }

    private fun featureRecord(id: String, data: JSONObject, timestamp: String): StoredRecord {
        val envelope = JSONObject()
            .put("id", id)
            .put("schemaVersion", 1)
            .put("createdAt", timestamp)
            .put("updatedAt", timestamp)
            .put("source", "web")
            .put("revision", 1)
            .put("data", data)
        return StoredRecord(id, envelope.toString(), 1, timestamp)
    }

    @Test fun discoversFeatureTables() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            NativeBackupCoverage.assertRoomSchemaCovered(database)
            val participants = NativeBackupCoverage.discoverParticipants()
            assertEquals(setOf(
                "platform-records", "work-driver-state", "logbook-events",
                "business-settings-records", "vehicle-records", "driver-records",
                "compliance-records", "maintenance-records", "finance-records",
                "finance-payment-records", "finance-prepayment-records", "business-expenses-records",
            ), participants.map { it.id }.toSet())
            assertEquals(setOf("records", "logbook_events"), participants.map { it.roomTable }.toSet())
            assertEquals(participants.map { it.id }.toSet(), NativeBackupCoverage.registeredParticipantIds())
        } finally { database.close() }
    }

    @Test fun featureTableBackupRoundTrip() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.records().put(StoredRecord("platform-1", """{"id":"platform-1","schemaVersion":1,"createdAt":"2026-11-04T00:00:00.000Z","updatedAt":"2026-11-04T00:00:00.000Z","source":"web","revision":1,"data":{"value":"sample"}}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-state", """{"value":{"schemaVersion":1,"revision":1,"state":"shift_active"}}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-intent:event-1", """{"status":"recorded","eventId":"event-1","command":{"schemaVersion":1,"commandId":"command-1","eventId":"event-1","eventType":"shift_end","originSurface":"pwa","transitionAt":"2026-11-04T00:00:00.000Z","expectedPriorState":"shift_active","expectedRevision":1,"idempotencyKey":"idem-1"},"createdAt":"2026-11-04T00:00:00.000Z","updatedAt":"2026-11-04T00:00:00.000Z"}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-outbox:2", """{"id":"driver-state:2","eventId":"event-1","revision":2,"integrationId":"logbook.work-driver-events.v1","contractVersion":1,"eventName":"work.driver-event-committed","payloadVersion":1,"delivered":false,"createdAt":"2026-11-04T00:00:00.000Z"}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(featureRecord(
                "timeline-enrichment:event-1",
                JSONObject().put("eventId", "event-1").put("latitude", 19.076).put("longitude", 72.8777)
                    .put("status", "pending").put("provider", "geoapify").put("attempts", 0)
                    .put("createdAt", "2026-11-04T00:00:00.000Z"),
                "2026-11-04T00:00:00.000Z",
            ))
            database.logBookEvents().put(LogBookEventRecord("event-1", """{"eventId":"event-1","kind":"trip_completed"}""", 1, "2026-11-04T00:00:01.000Z"))
            val exported = NativeBackupCoverage.exportBusinessRecords(database) { false }
            assertEquals(6, exported.length())
            assertEquals(setOf("platform-records", "work-driver-state", "logbook-events"),
                (0 until exported.length()).map { exported.getJSONObject(it).getString("participantId") }.toSet())
            NativeBackupCoverage.validateBusinessRecords(exported)

            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertTrue(database.records().get("platform-1") == null)
            assertTrue(database.records().get("driver-state") == null)
            assertTrue(database.records().get("driver-intent:event-1") == null)
            assertTrue(database.records().get("driver-outbox:2") == null)
            assertTrue(database.records().get("timeline-enrichment:event-1") == null)
            assertTrue(database.logBookEvents().list().isEmpty())
            NativeBackupCoverage.replaceBusinessRecords(database, exported)
            assertEquals("sample", JSONObject(database.records().get("platform-1")!!.json).getJSONObject("data").getString("value"))
            assertEquals("shift_active", JSONObject(database.records().get("driver-state")!!.json).getJSONObject("value").getString("state"))
            assertEquals("event-1", JSONObject(database.records().get("driver-intent:event-1")!!.json).getString("eventId"))
            assertEquals("event-1", JSONObject(database.records().get("driver-outbox:2")!!.json).getString("eventId"))
            assertEquals("pending", JSONObject(database.records().get("timeline-enrichment:event-1")!!.json)
                .getJSONObject("data").getString("status"))
            assertEquals("event-1", JSONObject(database.logBookEvents().list().single().json).getString("eventId"))
            NativeBackupCoverage.validateBusinessRecords(NativeBackupCoverage.exportBusinessRecords(database) { false })
        } finally { database.close() }
    }

    @Test fun convertsLegacySharedRecordsToCurrentFeatureOwnershipBeforeRestore() {
        val legacy = JSONArray()
            .put(JSONObject().put("id", "driver-state")
                .put("json", """{"value":{"schemaVersion":1,"revision":1,"state":"shift_active"}}""")
                .put("schemaVersion", 1).put("updatedAt", "now"))
            .put(JSONObject().put("id", "driver-event:event-legacy")
                .put("json", """{"eventId":"event-legacy","kind":"trip_completed"}""")
                .put("schemaVersion", 1).put("updatedAt", "now"))
            .put(JSONObject().put("id", "platform-record")
                .put("json", """{"id":"platform-record","schemaVersion":1,"createdAt":"2026-11-04T00:00:00.000Z","updatedAt":"2026-11-04T00:00:00.000Z","source":"import","revision":1,"data":{"value":1}}""")
                .put("schemaVersion", 1).put("updatedAt", "2026-11-04T00:00:00.000Z"))
            .put(JSONObject().put("id", "event-already-logbook")
                .put("json", """{"eventId":"event-already-logbook","kind":"trip_completed"}""")
                .put("schemaVersion", 1).put("updatedAt", "2026-11-04T00:00:01.000Z").put("participantId", "logbook-events"))
        val normalized = NativeBackupCoverage.normalizeLegacyRecords(legacy)
        assertEquals("work-driver-state", normalized.getJSONObject(0).getString("participantId"))
        assertEquals("event-legacy", normalized.getJSONObject(1).getString("id"))
        assertEquals("logbook-events", normalized.getJSONObject(1).getString("participantId"))
        assertEquals("platform-records", normalized.getJSONObject(2).getString("participantId"))
        assertEquals("event-already-logbook", normalized.getJSONObject(3).getString("id"))
        assertEquals("logbook-events", normalized.getJSONObject(3).getString("participantId"))
        NativeBackupCoverage.validateBusinessRecords(normalized, requireExplicitOwnerTags = true)
    }

    @Test fun nativeParticipantManifestIsVersionedAndOwnershipSpecific() {
        val manifest = NativeBackupCoverage.participantManifest()
        assertEquals(12, manifest.length())
        NativeBackupCoverage.validateParticipantManifest(manifest)
        val changed = JSONArray()
        for (index in 0 until manifest.length()) {
            val row = JSONObject(manifest.getJSONObject(index).toString())
            if (row.getString("id") == "work-driver-state") row.put("featureId", "platform")
            changed.put(row)
        }
        assertEquals("backup_participant_manifest_mismatch",
            runCatching { NativeBackupCoverage.validateParticipantManifest(changed) }.exceptionOrNull()?.message)
    }

    @Test fun rejectsParticipantSnapshotVersionMismatch() {
        val valid = JSONArray().put(JSONObject().put("id", "platform-row")
            .put("json", """{"id":"platform-row","schemaVersion":1,"createdAt":"2026-11-04T00:00:00.000Z","updatedAt":"2026-11-04T00:00:00.000Z","source":"web","revision":1,"data":{"value":1}}""")
            .put("schemaVersion", 1).put("updatedAt", "2026-11-04T00:00:00.000Z")
            .put("participantId", "platform-records"))
        val altered = valid.getJSONObject(0).put("schemaVersion", 2)
        val failure = runCatching { NativeBackupCoverage.validateBusinessRecords(valid) }.exceptionOrNull()
        assertEquals("backup_participant_snapshot_version_mismatch:platform-records", failure?.message)
    }

    @Test fun rejectsSnapshotRevisionThatDoesNotMatchThePersistedDriverState() {
        val records = JSONArray().put(JSONObject()
            .put("id", "driver-state")
            .put("json", JSONObject().put("value", JSONObject()
                .put("schemaVersion", 1).put("revision", 4).put("state", "shift_active")).toString())
            .put("schemaVersion", 1)
            .put("updatedAt", "2026-11-06T10:00:00Z")
            .put("participantId", "work-driver-state"))
        NativeBackupCoverage.validateSnapshotRevision(records, 4)
        assertEquals("backup_snapshot_revision_mismatch",
            runCatching { NativeBackupCoverage.validateSnapshotRevision(records, 5) }.exceptionOrNull()?.message)
        assertEquals("backup_snapshot_revision_mismatch",
            runCatching { NativeBackupCoverage.validateSnapshotRevision(JSONArray(), 1) }.exceptionOrNull()?.message)
    }

    @Test fun rejectsUnknownParticipantAndDuplicateRows() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val unknown = JSONArray().put(JSONObject().put("id", "x").put("json", """{"id":"x","schemaVersion":1,"createdAt":"2026-11-04T00:00:00.000Z","updatedAt":"2026-11-04T00:00:00.000Z","source":"web","revision":1,"data":{}}""")
                .put("schemaVersion", 1).put("updatedAt", "now").put("participantId", "unknown"))
            val failure = runCatching { NativeBackupCoverage.validateBusinessRecords(unknown) }.exceptionOrNull()
            assertEquals("backup_unknown_participant:unknown", failure?.message)

            val duplicate = JSONArray()
                .put(JSONObject().put("id", "x").put("json", """{"id":"x","schemaVersion":1,"createdAt":"2026-11-04T00:00:00.000Z","updatedAt":"2026-11-04T00:00:00.000Z","source":"web","revision":1,"data":{}}""").put("schemaVersion", 1).put("updatedAt", "2026-11-04T00:00:00.000Z").put("participantId", "platform-records"))
                .put(JSONObject().put("id", "x").put("json", """{"id":"x","schemaVersion":1,"createdAt":"2026-11-04T00:00:00.000Z","updatedAt":"2026-11-04T00:00:00.000Z","source":"web","revision":1,"data":{}}""").put("schemaVersion", 1).put("updatedAt", "2026-11-04T00:00:00.000Z").put("participantId", "platform-records"))
            assertEquals("backup_duplicate_participant_record_id",
                runCatching { NativeBackupCoverage.validateBusinessRecords(duplicate) }.exceptionOrNull()?.message)
        } finally { database.close() }
    }

    @Test fun failsClosedWhenARoomEntityHasNoParticipantContract() {
        val failure = runCatching { NativeBackupCoverage.discoverEntityTypesForTest(listOf(UnregisteredRoomEntity::class.java)) }.exceptionOrNull()
        assertTrue(failure?.message?.startsWith("backup_room_entity_missing_participant:") == true)
    }

    @Test fun failsClosedWhenParticipantHasNoExecutableSnapshotAdapter() {
        val failure = runCatching { NativeBackupCoverage.discoverEntityTypesForTest(listOf(UnsupportedAdapterEntity::class.java)) }.exceptionOrNull()
        assertEquals("backup_room_snapshot_adapter_missing:unimplemented-adapter", failure?.message)
    }

    class UnregisteredRoomEntity
    @NativeBackupParticipant(id = "future-feature", featureId = "future-feature", roomTable = "future_records", snapshotVersion = 1, adapterId = "unimplemented-adapter")
    class UnsupportedAdapterEntity
    @Test fun isolatedPersistentFeatureUsesRoomOwnedBackupAdapterAndRestoresIntoCleanStore() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val registration = NativeBackupCoverage.registerFeatureRecordParticipant(
            id = "sample-addon-records",
            featureId = "sample-addon",
            snapshotVersion = 1,
            recordIdPrefix = "feature:sample-addon:",
            validateRelationships = { rows, _ ->
                val ids = rows.map { it.getString("id") }.toSet()
                rows.forEach { row ->
                    val parentId = JSONObject(row.getString("json")).getJSONObject("data").optString("parentId")
                    require(parentId.isBlank() || parentId in ids) { "sample_addon_parent_missing" }
                }
            },
        )
        try {
            val timestamp = "2026-11-06T00:00:00.000Z"
            database.records().put(featureRecord(
                "feature:sample-addon:parent", JSONObject().put("kind", "parent"), timestamp,
            ))
            database.records().put(featureRecord(
                "feature:sample-addon:child",
                JSONObject().put("kind", "child").put("parentId", "feature:sample-addon:parent"), timestamp,
            ))
            val snapshot = NativeBackupCoverage.exportBusinessRecords(database) { false }
            assertTrue((0 until snapshot.length()).any {
                snapshot.getJSONObject(it).optString("participantId") == "sample-addon-records"
            })
            NativeBackupCoverage.validateBusinessRecords(snapshot)

            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertTrue(database.records().get("feature:sample-addon:parent") == null)
            assertTrue(database.records().get("feature:sample-addon:child") == null)
            NativeBackupCoverage.replaceBusinessRecords(database, snapshot)
            assertEquals("parent", JSONObject(database.records().get("feature:sample-addon:parent")!!.json).getJSONObject("data").getString("kind"))
            assertEquals("feature:sample-addon:parent",
                JSONObject(database.records().get("feature:sample-addon:child")!!.json).getJSONObject("data").getString("parentId"))

            val broken = JSONArray()
            for (index in 0 until snapshot.length()) {
                val row = JSONObject(snapshot.getJSONObject(index).toString())
                if (row.optString("id") == "feature:sample-addon:child") {
                    val envelope = JSONObject(row.getString("json"))
                    envelope.getJSONObject("data").put("parentId", "feature:sample-addon:missing")
                    row.put("json", envelope.toString())
                }
                broken.put(row)
            }
            assertEquals("sample_addon_parent_missing",
                runCatching { NativeBackupCoverage.validateBusinessRecords(broken) }.exceptionOrNull()?.message)
            assertEquals("parent", JSONObject(database.records().get("feature:sample-addon:parent")!!.json).getJSONObject("data").getString("kind"))
        } finally {
            registration.close()
            database.close()
        }
    }

    @Test fun rejectsFeatureOwnedRowsThatDoNotSatisfyTheSharedRecordEnvelope() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val registration = NativeBackupCoverage.registerFeatureRecordParticipant(
            id = "invalid-envelope-records",
            featureId = "invalid-envelope",
            snapshotVersion = 1,
            recordIdPrefix = "feature:invalid-envelope:",
            validateRelationships = { _, _ -> },
        )
        try {
            val timestamp = "2026-11-06T00:00:00.000Z"
            val invalid = JSONObject()
                .put("id", "feature:invalid-envelope:row")
                .put("schemaVersion", 1)
                .put("createdAt", timestamp)
                .put("updatedAt", timestamp)
                .put("source", "untrusted")
                .put("revision", 1)
                .put("data", JSONObject().put("value", true))
            database.records().put(StoredRecord(
                "feature:invalid-envelope:row", invalid.toString(), 1, timestamp,
            ))
            assertEquals("record_invalid_source",
                runCatching { NativeBackupCoverage.exportBusinessRecords(database) { false } }.exceptionOrNull()?.message)
        } finally {
            registration.close()
            database.close()
        }
    }

    @Test fun refusesToExportFeatureRecordsWithoutTheirRegisteredOwnerAdapter() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.records().put(StoredRecord(
                "feature:orphan-addon:row", """{"retained":true}""", 1, "2026-11-06T00:00:00.000Z",
            ))
            assertEquals("backup_unregistered_feature_record:feature:orphan-addon:row",
                runCatching { NativeBackupCoverage.exportBusinessRecords(database) { false } }.exceptionOrNull()?.message)
        } finally { database.close() }
    }

    @Test fun rollsBackFeatureOwnedRoomRestoreWhenAnInjectedFailureInterruptsReplacement() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val registration = NativeBackupCoverage.registerFeatureRecordParticipant(
            id = "failure-addon-records",
            featureId = "failure-addon",
            snapshotVersion = 1,
            recordIdPrefix = "feature:failure-addon:",
            validateRelationships = { _, _ -> },
        )
        try {
            val timestamp = "2026-11-06T00:00:00.000Z"
            database.records().put(featureRecord(
                "feature:failure-addon:row", JSONObject().put("value", "snapshot"), timestamp,
            ))
            val snapshot = NativeBackupCoverage.exportBusinessRecords(database) { false }
            database.records().put(featureRecord(
                "feature:failure-addon:row", JSONObject().put("value", "current"), "2026-11-06T00:01:00.000Z",
            ))
            val failure = runCatching {
                database.runInTransaction {
                    NativeBackupCoverage.replaceBusinessRecords(database, snapshot)
                    throw IllegalStateException("sample_addon_restore_interrupted")
                }
            }.exceptionOrNull()
            assertEquals("sample_addon_restore_interrupted", failure?.message)
            assertEquals("current", JSONObject(database.records().get("feature:failure-addon:row")!!.json)
                .getJSONObject("data").getString("value"))
        } finally {
            registration.close()
            database.close()
        }
    }


}
