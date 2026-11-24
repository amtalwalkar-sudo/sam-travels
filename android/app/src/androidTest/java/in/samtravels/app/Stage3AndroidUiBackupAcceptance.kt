package `in`.samtravels.app

import org.json.JSONObject

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue

/** Same-record Stage 3 proof for records created by the rendered Android Admin UI. */
internal object Stage3AndroidUiBackupAcceptance {
    fun assertPerformanceAndRestore(
        db: LocalDatabase,
        vehicleRecordId: String,
        fuelRecordId: String? = null,
        fuelRecordIds: List<String> = emptyList(),
        adminFeeRecordId: String? = null,
        evaluate: (String) -> Unit,
        waitFor: (String, Long) -> Boolean,
        click: (String) -> Unit,
        readCalculation: () -> String,
    ) {
        val fuelData = JSONObject(db.records().get(fuelRecordId ?: error("stage3_fuel_record_id_missing"))!!.json).getJSONObject("data")
        val nextDate = java.time.LocalDate.parse(fuelData.getString("businessDate")).plusDays(1).toString()
        val shiftStart = nextDate + "T05:00:00+05:30"
        val shiftEnd = nextDate + "T06:00:00+05:30"
        val shift = JSONObject().put("state", "shift_active").put("shiftId", "stage3-fuel-shift")
            .put("shiftStartedAt", shiftStart).put("shiftStartOdometerKm", 56042)
            .put("shiftContext", JSONObject().put("driverId", "stage3-driver")
                .put("assignmentId", "stage3-assignment").put("vehicleId", vehicleRecordId))
        val end = JSONObject().put("eventType", "shift_end").put("transitionAt", shiftEnd)
            .put("odometer", JSONObject().put("readingKm", 56084).put("businessKm", 42))
        WorkDailyBusinessKilometreStore.append(db, shift, end, "stage3-fuel-shift-end", shiftEnd)
        val dailyId = "work:daily-business-km:" + java.net.URLEncoder.encode(vehicleRecordId, "UTF-8") + ":" + nextDate
        val daily = db.records().get(dailyId) ?: error("stage3_daily_business_km_missing")
        val dailyData = JSONObject(daily.json).getJSONObject("data")
        val vehicle = db.records().get(vehicleRecordId) ?: error("stage3_vehicle_missing")
        val rateEffectiveFrom = java.time.Instant.parse(JSONObject(vehicle.json).getString("createdAt"))
            .atZone(java.time.ZoneId.of("Asia/Kolkata")).minusHours(4).toLocalDate().toString()
        val accrualId = "feature:maintenance:daily-accrual:" +
            java.net.URLEncoder.encode(vehicleRecordId, "UTF-8") + ":" + nextDate
        val timestamp = java.time.Instant.now().toString()
        val accrualData = JSONObject().put("schemaVersion", 1).put("kind", "daily_accrual")
            .put("vehicleId", vehicleRecordId).put("operationalDate", nextDate)
            .put("dailyBusinessKmRecordId", dailyId).put("dailyBusinessKmRevision", JSONObject(daily.json).getInt("revision"))
            .put("businessKm", dailyData.getInt("totalBusinessKm")).put("personalKm", 0)
            .put("personalAmountPaise", 0).put("rateEffectiveFrom", rateEffectiveFrom)
            .put("ratePaisePerKm", 250).put("amountPaise", dailyData.getInt("totalBusinessKm") * 250)
        val accrualEnvelope = JSONObject().put("id", accrualId).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp).put("source", "integration")
            .put("revision", 1).put("data", accrualData)
        db.records().put(StoredRecord(accrualId, accrualEnvelope.toString(), 1, timestamp))
        // A real Performance calculation requires the Admin-configured monthly Driver Target.
        evaluate("document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Admin'&&!n.classList.contains('active'))n.click()})")
        org.junit.Assert.assertTrue("Admin workspace remains available for Performance setup",
            waitFor("!!document.querySelector('.admin-replacement-shell')", 20000))
        evaluate("""(()=>{const b=document.getElementById('admin-section-trigger-performance');if(b&&b.getAttribute('aria-expanded')!=='true')b.click()})()""")
        org.junit.Assert.assertTrue("Admin Performance section expands before calculation",
            waitFor("document.getElementById('admin-section-trigger-performance')?.getAttribute('aria-expanded')==='true'&&!document.getElementById('admin-section-panel-performance')?.hidden", 15000))
        org.junit.Assert.assertTrue("Admin Performance settings render before calculation",
            waitFor("[...document.querySelectorAll('#admin-section-panel-performance label')].some(l=>l.textContent.includes('Monthly Driver Target'))", 20000))
        evaluate("""(()=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Monthly Driver Target'));const i=l?.querySelector('input');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'5000');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
        click("Save monthly target")
        org.junit.Assert.assertTrue("Monthly Driver Target is saved through the rendered Admin form",
            waitFor("document.body.innerText.includes('Monthly Driver Target saved.')", 15000))
        evaluate("document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Performance')n.click()})")
        org.junit.Assert.assertTrue("Performance screen consumes UI-created Admin sources",
            waitFor("!!document.querySelector('.performance-dashboard')", 20000))
        evaluate("""(()=>{const i=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Period to'))?.querySelector('input');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'$nextDate');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
        click("Refresh performance|Calculating")
        org.junit.Assert.assertTrue("Performance calculation completes before same-record backup",
            waitFor("!!document.querySelector('.performance-dashboard')&&!document.querySelector('.performance-loading')", 30000))
        val calculationBeforeRestore = readCalculation()
        assertTrue("Pre-restore calculation snapshot includes the production provenance contract: " + calculationBeforeRestore,
            calculationBeforeRestore.contains("Calculation ID"))
        val fuelSources = (fuelRecordIds + listOfNotNull(fuelRecordId)).distinct()
        assertTrue("Performance provenance names a UI-created Fuel source " + fuelSources,
            fuelSources.any(calculationBeforeRestore::contains))
        adminFeeRecordId?.let { id ->
            assertTrue("Performance provenance names the exact UI-created Admin expense record",
                calculationBeforeRestore.contains(id))
        }
        fuelRecordId?.let { assertNotNull("The rendered Fuel purchase is persisted before backup", db.records().get(it)) }
        val stage3Source = NativeSnapshotBuilder.build(
            db, NativeBackupRecovery::isInternalRecord, "stage3-android-ui-golden-journey",
        )
        val stage3ExpectedRecordCount = stage3Source.snapshot.getJSONArray("records").length()
        val stage3RecoveryKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
        // Use the same production runtime entry point as BackupPanel. On Android
        // this exports the authoritative Room snapshot through NativeBackup,
        // then encrypts it with the shared TypeScript backup-encryption-v2 code.
        evaluate("""(async()=>{try {
            const runtime=await import('/apps/web/src/backup-runtime.ts');
            const created=await runtime.createBackupForCurrentRuntime({
                applicationVersion:'stage3-android-ui-golden-journey',
                recoveryKey:'$stage3RecoveryKey'
            });
            window.__stage3EncryptedBackup=created.backup;
            window.__stage3BackupCreated=created.backup?.manifest?.format==='backup-encryption-v2';
        } catch(error) { window.__stage3BackupError=String(error?.stack||error); }})()""")
        assertTrue("Production Android backup runtime exports and encrypts the UI-created Room graph",
            waitFor("window.__stage3BackupCreated===true", 30000))

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
        // Restore through the production runtime adapter too. Its native branch
        // authenticates the JS-created package in BackupPlugin and delegates to
        // the production Room restore coordinator.
        evaluate("""(async()=>{try {
            const runtime=await import('/apps/web/src/backup-runtime.ts');
            window.__stage3RestoreResult=await runtime.restoreBackupForCurrentRuntime({
                backup:window.__stage3EncryptedBackup,
                secret:{recoveryKey:'$stage3RecoveryKey'},
                confirmed:true
            });
            window.__stage3RestoreComplete=true;
        } catch(error) { window.__stage3RestoreError=String(error?.stack||error); }})()""")
        assertTrue("Production Android backup runtime restores the authenticated encrypted package",
            waitFor("window.__stage3RestoreComplete===true", 30000))
        assertTrue("Production encrypted restore reports the populated Room graph",
            waitFor("window.__stage3RestoreResult?.restoredCount >= $stage3ExpectedRecordCount", 1000))
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
        evaluate("""(async()=>{try {
            const runtime=await import('/apps/web/src/backup-runtime.ts');
            await runtime.markRestoreVerified(window.__stage3RestoreResult.checkpointId);
            await runtime.discardVerifiedRecoveryCheckpoint(window.__stage3RestoreResult.checkpointId);
            window.__stage3CheckpointFinalized=true;
        } catch(error) { window.__stage3FinalizeError=String(error?.stack||error); }})()""")
        assertTrue("Production backup runtime verifies and discards its restore checkpoint",
            waitFor("window.__stage3CheckpointFinalized===true", 15000))
        
    }
}
