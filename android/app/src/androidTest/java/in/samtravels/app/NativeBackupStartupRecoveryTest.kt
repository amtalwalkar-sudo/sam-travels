package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class NativeBackupStartupRecoveryTest {
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

    @Test fun recoversRestoredUnverifiedRoomCheckpointAfterDatabaseReopen() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "backup-restore-startup-recovery.db"
        context.deleteDatabase(databaseName)
        val registration = NativeBackupCoverage.registerFeatureRecordParticipant(
            id = "restore-recovery-addon-records",
            featureId = "restore-recovery-addon",
            snapshotVersion = 1,
            recordIdPrefix = "feature:restore-recovery-addon:",
            validateRelationships = { _, _ -> },
        )
        val timestamp = "2026-11-11T00:00:00.000Z"
        val checkpointId = java.util.UUID.randomUUID().toString()
        try {
            val prepared = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
                .allowMainThreadQueries().build()
            prepared.records().put(featureRecord(
                "feature:restore-recovery-addon:row", JSONObject().put("value", "original"), timestamp,
            ))
            val originalSnapshot = NativeBackupCoverage.exportBusinessRecords(prepared) { false }
            prepared.records().put(featureRecord(
                "feature:restore-recovery-addon:row", JSONObject().put("value", "restored-new"), "2026-11-11T00:01:00.000Z",
            ))
            prepared.records().put(StoredRecord(
                NativeBackupRecovery.CHECKPOINT_PREFIX + checkpointId,
                JSONObject().put("records", originalSnapshot).toString(), 1, timestamp,
            ))
            prepared.records().put(StoredRecord(
                NativeBackupRecovery.JOURNAL_PREFIX + checkpointId,
                JSONObject().put("id", checkpointId).put("createdAt", timestamp).put("status", "restored_unverified").toString(),
                1, timestamp,
            ))
            prepared.close()

            // A new Room handle reopens the same durable file, as after app process restart.
            val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
                .allowMainThreadQueries().build()
            try {
                assertEquals(listOf(checkpointId), NativeStartupRecovery.ensure(reopened))
                assertEquals("original", JSONObject(reopened.records().get("feature:restore-recovery-addon:row")!!.json)
                    .getJSONObject("data").getString("value"))
                assertEquals("rollback_complete", JSONObject(reopened.records()
                    .get(NativeBackupRecovery.JOURNAL_PREFIX + checkpointId)!!.json).getString("status"))
                assertEquals(emptyList<String>(), NativeStartupRecovery.ensure(reopened))
            } finally { reopened.close() }
        } finally {
            registration.close()
            context.deleteDatabase(databaseName)
        }
    }

}
