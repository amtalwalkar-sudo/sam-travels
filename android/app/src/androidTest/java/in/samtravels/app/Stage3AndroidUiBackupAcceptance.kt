package `in`.samtravels.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue

/** Same-record Stage 3 proof for records created by the rendered Android Admin UI. */
internal object Stage3AndroidUiBackupAcceptance {
    fun assertPerformanceAndRestore(
        db: LocalDatabase,
        vehicleRecordId: String,
        fuelRecordId: String? = null,
        adminFeeRecordId: String? = null,
        evaluate: (String) -> Unit,
        waitFor: (String, Long) -> Boolean,
        click: (String) -> Unit,
        readCalculation: () -> String,
    ) {
        evaluate("document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Performance')n.click()})")
        org.junit.Assert.assertTrue("Performance screen consumes UI-created Admin sources",
            waitFor("!!document.querySelector('.performance-dashboard')", 20000))
        click("Refresh performance|Calculating")
        org.junit.Assert.assertTrue("Performance calculation completes before same-record backup",
            waitFor("!!document.querySelector('.performance-dashboard')&&!document.querySelector('.performance-loading')", 30000))
        val calculationBeforeRestore = readCalculation()
        assertTrue("Pre-restore calculation snapshot includes the production provenance contract",
            calculationBeforeRestore.contains("Calculation ID"))
        fuelRecordId?.let { id ->
            assertTrue("Performance provenance names the exact UI-created Fuel record",
                calculationBeforeRestore.contains(id))
        }
        adminFeeRecordId?.let { id ->
            assertTrue("Performance provenance names the exact UI-created Admin expense record",
                calculationBeforeRestore.contains(id))
        }
        fuelRecordId?.let { assertNotNull("The rendered Fuel purchase is persisted before backup", db.records().get(it)) }
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
        // Remove the Vehicle and every persisted record that refers to it. The
        // restore destination must itself remain a valid graph while the source
        // package proves that all removed identities are reinstated.
        val stage3AllRows = db.records().list()
        val stage3VehicleRows = stage3AllRows.filter { row ->
            row.id != stage3VehicleId && row.json.contains(stage3VehicleId)
        }
        // Finance ledgers refer to their Loan identity, not directly to the Vehicle.
        // Remove those transitive dependants with the Loan so the intermediate Room
        // graph never contains an orphan payment/prepayment ledger during restore.
        val stage3LoanIds = stage3VehicleRows.filter {
            it.id.startsWith("feature:finance:loan:")
        }.map { it.id }
        val stage3FinanceLedgerRows = stage3AllRows.filter { row ->
            (row.id.startsWith("feature:finance:payments:") ||
                row.id.startsWith(NativeFinancePrepaymentBackup.RECORD_ID_PREFIX)) &&
                stage3LoanIds.any { loanId -> row.json.contains(loanId) }
        }
        val stage3DependentRows = (stage3VehicleRows + stage3FinanceLedgerRows).distinctBy { it.id }
        val stage3AssignmentIds = stage3DependentRows.filter {
            it.id.startsWith("feature:driver-records:assignment:")
        }.map { it.id }
        assertTrue("Golden journey must include the Driver–Vehicle assignment", stage3AssignmentIds.isNotEmpty())
        assertTrue("Golden journey must include dependent Compliance records",
            stage3DependentRows.any { it.id.startsWith("feature:compliance:") })
        stage3DependentRows.forEach { db.records().remove(it.id) }
        db.records().remove(stage3VehicleId)
        assertEquals("Golden journey probe proves restore must reinstate the UI-created Vehicle",
            null, db.records().get(stage3VehicleId))
        (stage3DependentRows.map { it.id } + stage3VehicleId).forEach { id ->
            assertEquals("Dependent record removed before restore: " + id, null, db.records().get(id))
        }
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
        fuelRecordId?.let { assertNotNull("The exact UI-created Fuel purchase identity is restored", db.records().get(it)) }
        (stage3DependentRows.map { it.id } + stage3VehicleId).forEach { id ->
            assertNotNull("The exact dependent record identity is restored: " + id, db.records().get(id))
        }
        click("Refresh performance|Calculating")
        assertTrue("Restored Room records recalculate in the rendered Performance screen",
            waitFor("!!document.querySelector('.performance-dashboard')&&!document.querySelector('.performance-loading')", 30000))
        val calculationAfterRestore = readCalculation()
        assertEquals("Calculation output and provenance remain identical for the same restored source identities",
            calculationBeforeRestore, calculationAfterRestore)
        NativeBackupRestoreCoordinator.markVerified(db, stage3Restored.checkpointId)
        NativeBackupRestoreCoordinator.discardVerified(db, stage3Restored.checkpointId)
        
    }
}
