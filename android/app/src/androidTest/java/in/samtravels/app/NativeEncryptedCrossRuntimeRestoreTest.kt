package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class NativeEncryptedCrossRuntimeRestoreTest {
    @Test fun typescriptProducedPackageAuthenticatesBeforeProductionRoomReplacement() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val participants = listOf(
            NativeBusinessSettingsBackup.register(),
            NativeVehicleBackup.register(),
            NativeDriverRecordsBackup.register(),
            NativeComplianceBackup.register(),
            NativeMaintenanceBackup.register(),
            NativeFinanceBackup.register(),
            NativeBusinessExpensesBackup.register(),
            NativePerformanceBackup.register(),
        )
        try {
            val at = "2026-11-04T00:00:00.000Z"
            val sentinelId = "destination-only-sentinel"
            database.records().put(StoredRecord(
                sentinelId,
                JSONObject().put("id", sentinelId).put("schemaVersion", 1)
                    .put("createdAt", at).put("updatedAt", at).put("source", "android")
                    .put("revision", 4).put("data", JSONObject().put("value", "must-survive")).toString(),
                1, at,
            ))
            fun snapshot() = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "cross-runtime-restore-test",
            )
            val fixture = JSONObject(
                InstrumentationRegistry.getInstrumentation().context.assets
                    .open("cross-platform-backup-v2.json").bufferedReader().use { it.readText() },
            )
            val backup = fixture.getJSONObject("backup")
            val recoveryKey = fixture.getString("recoveryKey")

            // Wrong recovery material and altered payload must fail before the
            // production Room coordinator creates a checkpoint or replaces rows.
            assertThrows(Exception::class.java) {
                NativeBackupRestoreCoordinator.restoreEncrypted(
                    database, backup, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", ::snapshot,
                )
            }
            assertEquals("must-survive", JSONObject(database.records().get(sentinelId)!!.json)
                .getJSONObject("data").getString("value"))
            assertEquals(0, database.records().list().count {
                it.id.startsWith(NativeBackupRecovery.CHECKPOINT_PREFIX) ||
                    it.id.startsWith(NativeBackupRecovery.JOURNAL_PREFIX)
            })

            val tampered = JSONObject(backup.toString())
            tampered.getJSONObject("payload").put("ciphertext", "AA==")
            assertThrows(Exception::class.java) {
                NativeBackupRestoreCoordinator.restoreEncrypted(database, tampered, recoveryKey, ::snapshot)
            }
            assertEquals("must-survive", JSONObject(database.records().get(sentinelId)!!.json)
                .getJSONObject("data").getString("value"))
            assertEquals(0, database.records().list().count {
                it.id.startsWith(NativeBackupRecovery.CHECKPOINT_PREFIX) ||
                    it.id.startsWith(NativeBackupRecovery.JOURNAL_PREFIX)
            })

            val restored = NativeBackupRestoreCoordinator.restoreEncrypted(
                database, backup, recoveryKey, ::snapshot,
            )
            assertEquals(1, restored.restoredCount)
            assertNull(database.records().get(sentinelId))
            val imported = JSONObject(database.records().get("fixture-ts-to-android")!!.json)
            assertEquals("typescript-writer", imported.getJSONObject("data").getString("value"))
            NativeBackupRestoreCoordinator.markVerified(database, restored.checkpointId)
            NativeBackupRestoreCoordinator.discardVerified(database, restored.checkpointId)
        } finally {
            participants.asReversed().forEach { it.close() }
            database.close()
        }
    }
}
