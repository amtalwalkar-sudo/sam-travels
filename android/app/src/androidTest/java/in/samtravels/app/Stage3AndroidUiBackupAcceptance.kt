package `in`.samtravels.app

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue

/** Same-record Stage 3 proof for records created by the rendered Android Admin UI. */
internal object Stage3AndroidUiBackupAcceptance {
    fun assertSameUiRecordsSurviveEncryptedRestore(db: LocalDatabase, vehicleRecordId: String) {
        val stage3Source = NativeSnapshotBuilder.build(
        db, NativeBackupRecovery::isInternalRecord, "stage3-android-ui-golden-journey",
        )
        val stage3RecoveryKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
        val stage3Encrypted = NativeBackupV2Package.create(
        stage3Source.snapshot.toString().toByteArray(Charsets.UTF_8),
        stage3Source.manifest,
        stage3RecoveryKey,
        )
        val stage3VehicleId = vehicleRecordId
        db.records().remove(stage3VehicleId)
        assertEquals("Golden journey probe proves restore must reinstate the UI-created Vehicle",
        null, db.records().get(stage3VehicleId))
        val stage3Restored = NativeBackupRestoreCoordinator.restoreEncrypted(
        db, stage3Encrypted, stage3RecoveryKey,
        { NativeSnapshotBuilder.build(db, NativeBackupRecovery::isInternalRecord, "stage3-android-readback") },
        )
        assertTrue("Production encrypted restore reports the populated Room graph",
        stage3Restored.restoredCount >= stage3Source.snapshot.getJSONArray("records").length())
        val stage3Readback = NativeSnapshotBuilder.build(
        db, NativeBackupRecovery::isInternalRecord, "stage3-android-restored",
        )
        SharedBackupFixtureAssertions.assertCanonicalRecordsEqual(
        "Android UI-created records survive production calculation and encrypted restore",
        stage3Source.snapshot.getJSONArray("records"),
        stage3Readback.snapshot.getJSONArray("records"),
        )
        assertNotNull("The exact UI-created Vehicle identity is restored", db.records().get(stage3VehicleId))
        NativeBackupRestoreCoordinator.markVerified(db, stage3Restored.checkpointId)
        NativeBackupRestoreCoordinator.discardVerified(db, stage3Restored.checkpointId)
        
    }
}
