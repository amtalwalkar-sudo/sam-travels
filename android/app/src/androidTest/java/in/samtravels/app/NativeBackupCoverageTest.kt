package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class NativeBackupCoverageTest {
    @Test fun discoversTwoFeatureOwnedRoomEntitiesAndCoversEveryPhysicalTable() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            NativeBackupCoverage.assertRoomSchemaCovered(database)
            val participants = NativeBackupCoverage.discoverParticipants()
            assertEquals(setOf("platform-records", "work-driver-state", "logbook-events"), participants.map { it.id }.toSet())
            assertEquals(setOf("records", "logbook_events"), participants.map { it.roomTable }.toSet())
            assertEquals(setOf("platform-records", "work-driver-state", "logbook-events"), NativeBackupCoverage.registeredParticipantIds())
        } finally { database.close() }
    }

    @Test fun executableAdaptersExportValidateAndRestoreBothFeatureTables() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.records().put(StoredRecord("platform-1", """{"id":"platform-1","value":"sample"}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-state", """{"value":{"revision":1,"state":"shift_active"}}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-intent:event-1", """{"status":"recorded","eventId":"event-1"}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-outbox:1", """{"eventId":"event-1"}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-state", """{"value":{"revision":1,"state":"shift_active"}}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-intent:event-1", """{"status":"recorded"}""", 1, "2026-11-04T00:00:00.000Z"))
            database.records().put(StoredRecord("driver-outbox:1", """{"eventId":"event-1"}""", 1, "2026-11-04T00:00:00.000Z"))
            database.logBookEvents().put(LogBookEventRecord("event-1", """{"eventId":"event-1","kind":"trip_completed"}""", 1, "2026-11-04T00:00:01.000Z"))
            val exported = NativeBackupCoverage.exportBusinessRecords(database) { false }
            assertEquals(5, exported.length())
            assertEquals(setOf("platform-records", "work-driver-state", "logbook-events"),
                (0 until exported.length()).map { exported.getJSONObject(it).getString("participantId") }.toSet())
            NativeBackupCoverage.validateBusinessRecords(exported)

            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertTrue(database.records().get("platform-1") == null)
            assertTrue(database.records().get("driver-state") == null)
            assertTrue(database.records().get("driver-intent:event-1") == null)
            assertTrue(database.records().get("driver-outbox:1") == null)
            assertTrue(database.logBookEvents().list().isEmpty())
            NativeBackupCoverage.replaceBusinessRecords(database, exported)
            assertEquals("sample", JSONObject(database.records().get("platform-1")!!.json).getString("value"))
            assertEquals("shift_active", JSONObject(database.records().get("driver-state")!!.json).getJSONObject("value").getString("state"))
            assertEquals("event-1", JSONObject(database.records().get("driver-intent:event-1")!!.json).getString("eventId"))
            assertEquals("event-1", JSONObject(database.records().get("driver-outbox:1")!!.json).getString("eventId"))
            assertEquals("event-1", JSONObject(database.logBookEvents().list().single().json).getString("eventId"))
            NativeBackupCoverage.validateBusinessRecords(NativeBackupCoverage.exportBusinessRecords(database) { false })
        } finally { database.close() }
    }

    @Test fun convertsLegacySharedRecordsToCurrentFeatureOwnershipBeforeRestore() {
        val legacy = JSONArray()
            .put(JSONObject().put("id", "driver-state")
                .put("json", """{"value":{"revision":1,"state":"shift_active"}}""")
                .put("schemaVersion", 1).put("updatedAt", "now"))
            .put(JSONObject().put("id", "driver-event:event-legacy")
                .put("json", """{"eventId":"event-legacy","kind":"trip_completed"}""")
                .put("schemaVersion", 1).put("updatedAt", "now"))
            .put(JSONObject().put("id", "platform-record")
                .put("json", """{"id":"platform-record","value":1}""")
                .put("schemaVersion", 1).put("updatedAt", "now"))
            .put(JSONObject().put("id", "event-already-logbook")
                .put("json", """{"eventId":"event-already-logbook","kind":"trip_completed"}""")
                .put("schemaVersion", 1).put("updatedAt", "now").put("participantId", "logbook-events"))
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
        assertEquals(3, manifest.length())
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
            .put("json", """{"id":"platform-row","value":1}""")
            .put("schemaVersion", 1).put("updatedAt", "now")
            .put("participantId", "platform-records"))
        val altered = valid.getJSONObject(0).put("schemaVersion", 2)
        val failure = runCatching { NativeBackupCoverage.validateBusinessRecords(valid) }.exceptionOrNull()
        assertEquals("backup_participant_snapshot_version_mismatch:platform-records", failure?.message)
    }

    @Test fun rejectsUnknownParticipantAndDuplicateRows() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val unknown = JSONArray().put(JSONObject().put("id", "x").put("json", """{"id":"x"}""")
                .put("schemaVersion", 1).put("updatedAt", "now").put("participantId", "unknown"))
            val failure = runCatching { NativeBackupCoverage.validateBusinessRecords(unknown) }.exceptionOrNull()
            assertEquals("backup_unknown_participant:unknown", failure?.message)

            val duplicate = JSONArray()
                .put(JSONObject().put("id", "x").put("json", """{"id":"x"}""").put("schemaVersion", 1).put("updatedAt", "now").put("participantId", "platform-records"))
                .put(JSONObject().put("id", "x").put("json", """{"id":"x"}""").put("schemaVersion", 1).put("updatedAt", "now").put("participantId", "platform-records"))
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
}
