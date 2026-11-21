package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeBackupRecordLimitAcceptanceTest {
    @Before fun registerParticipants() {
        NativeBusinessSettingsBackup.ensureRegistered()
        NativeVehicleBackup.ensureRegistered()
        NativeDriverRecordsBackup.ensureRegistered()
        NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered()
        NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered()
        NativePerformanceBackup.ensureRegistered()
    }

    @Test fun productionSnapshotBuilderRejectsOverLimitExport() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.logBookEvents().put(LogBookEventRecord(
                "limit-event",
                """{"eventId":"limit-event","kind":"trip_completed"}""",
                1,
                "2026-11-10T04:00:00.000Z",
            ))
            val failure = runCatching {
                NativeSnapshotBuilder.build(
                    database, NativeBackupRecovery::isInternalRecord, "test-version",
                    "2026-11-10T04:01:00.000Z", maxRecordCount = 0,
                )
            }.exceptionOrNull()
            assertEquals("backup_record_count_limit", failure?.message)
        } finally { database.close() }
    }

    @Test fun productionRestoreRejectsRawRecordCountBeforeValidationOrCheckpoint() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val at = "2026-11-17T08:00:00.000Z"
            val snapshot = JSONObject()
                .put("schemaVersion", BackupSnapshotContract.CURRENT_SCHEMA_VERSION)
                .put("snapshotRevision", 0)
                .put("records", JSONArray().put(JSONObject().put("id", "unvalidated-row")))
            val manifest = JSONObject()
                .put("schemaVersion", BackupSnapshotContract.CURRENT_SCHEMA_VERSION)
                .put("applicationVersion", "test")
                .put("createdAt", at)
                .put("businessTimezone", "Asia/Kolkata")
                .put("snapshotRevision", 0)
                .put("recordCounts", JSONObject().put("records", 1))
            val failure = runCatching {
                NativeBackupRestoreCoordinator.restore(
                    database, snapshot, manifest, {
                        NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "test")
                    }, maxRecordCount = 0,
                )
            }.exceptionOrNull()
            assertEquals("backup_record_count_limit", failure?.message)
            assertEquals(0, database.records().list().count {
                it.id.startsWith(NativeBackupRecovery.CHECKPOINT_PREFIX) ||
                    it.id.startsWith(NativeBackupRecovery.JOURNAL_PREFIX)
            })
        } finally { database.close() }
    }
}
