package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class NativeBackupExclusionTest {
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

    @Test fun portableSnapshotExcludesRoomLocalIdentityAndRestoreRecoveryRows() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val at = "2026-11-24T00:00:00.000Z"
            fun row(id: String) = StoredRecord(
                id,
                JSONObject().put("id", id).put("schemaVersion", 1).put("createdAt", at)
                    .put("updatedAt", at).put("source", "android").put("revision", 1)
                    .put("data", JSONObject().put("value", id)).toString(),
                1, at,
            )
            listOf(
                "portable-platform-record",
                "work:selected-driver",
                "identity:driver-person-link:driver-1",
                "identity:person:person-1",
                NativeBackupRecovery.CHECKPOINT_PREFIX + "restore-1",
                NativeBackupRecovery.JOURNAL_PREFIX + "restore-1",
            ).forEach { database.records().put(row(it)) }

            val exported = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
            val ids = (0 until exported.length()).map { exported.getJSONObject(it).getString("id") }
            assertEquals(listOf("portable-platform-record"), ids)
        } finally { database.close() }
    }
}
