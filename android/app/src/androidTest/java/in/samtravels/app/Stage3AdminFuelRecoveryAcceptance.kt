package `in`.samtravels.app

/** Keeps the Stage 3 UI journey readable while reusing the shared Room recovery assertions. */
internal data class Stage3AdminFuelRecoveryResult(
    val activity: MainActivity,
    val adminFeeRecordId: String,
    val fuelRecordId: String,
)

internal object Stage3AdminFuelRecoveryAcceptance {
    fun recoverAdminAndFuel(
        startingActivity: MainActivity,
        support: AdminFormsCapacitorAcceptanceTest,
        db: LocalDatabase,
        marker: String,
        vehicleRecordId: String,
        registration: String,
    ): Stage3AdminFuelRecoveryResult {
        support.eval(startingActivity, "(()=>{const p=document.getElementById('admin-section-panel-finance');if(p?.hidden)document.getElementById('admin-section-trigger-finance')?.click()})()")
        check(support.await(startingActivity,
            """(()=>{const s=document.querySelector('#admin-vehicle');return !!s&&[...s.options].some(o=>o.textContent.includes('$registration'))})()""",
            15000,
        )) { "Finance Vehicle option must load before Admin expense entry" }
        check(support.javascriptValue(startingActivity,
            """(()=>{const s=document.querySelector('#admin-vehicle');const o=[...s.options].find(x=>x.textContent.includes('$registration'));if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true})()""") == "true") {
            "Finance Vehicle must be selected before Admin expense entry"
        }
        AdminEntryPathAuditTestSupport.setInPanel(startingActivity, support, "section.admin-capability-panel", "Platform Fees", "Fee date", "2026-11-15")
        AdminEntryPathAuditTestSupport.setInPanel(startingActivity, support, "section.admin-capability-panel", "Platform Fees", "Vehicle", vehicleRecordId)
        AdminEntryPathAuditTestSupport.setInPanel(startingActivity, support, "section.admin-capability-panel", "Platform Fees", "Fee amount (₹)", "150")
        AdminEntryPathAuditTestSupport.setInPanel(startingActivity, support, "section.admin-capability-panel", "Platform Fees", "Trip / settlement reference", "FEE-" + marker)
        AdminEntryPathAuditTestSupport.setInPanel(startingActivity, support, "section.admin-capability-panel", "Platform Fees", "Note", marker + " platform fee")
        check(support.await(startingActivity,
            """(()=>{const p=[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees');const b=p?.querySelector('form button[type=submit]');return !!b&&!b.disabled})()""",
            15000,
        )) { "Platform Fee form must be ready before the injected completion failure" }
        val platformFee = AdminEntryPathAuditTestSupport.assertPlatformFeePostCommitRecovery(
            startingActivity, support, db, marker, marker + " Admin",
        )
        val fuel = AdminEntryPathAuditTestSupport.assertFuelDraftAndPostCommitRecovery(
            platformFee.first, support, db, vehicleRecordId, marker + " Admin",
        )
        check(support.await(fuel.first,
            """(()=>{const s=document.querySelector('#admin-vehicle');return !!s&&[...s.options].some(o=>o.textContent.includes('$registration'))})()""",
            15000,
        )) { "Finance Vehicle option must survive both form recovery journeys" }
        check(support.javascriptValue(fuel.first,
            """(()=>{const s=document.querySelector('#admin-vehicle');const o=[...s.options].find(x=>x.textContent.includes('$registration'));if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true})()""") == "true") {
            "Finance Vehicle must be selected after both recovery journeys"
        }
        return Stage3AdminFuelRecoveryResult(fuel.first, platformFee.second, fuel.second)
    }

    fun assertPerformanceAndRestore(
        activity: MainActivity,
        support: AdminFormsCapacitorAcceptanceTest,
        db: LocalDatabase,
        vehicleRecordId: String,
        fuelRecordId: String,
        fuelRecordIds: List<String>,
        adminFeeRecordId: String?,
    ) {
        Stage3AndroidUiBackupAcceptance.assertPerformanceAndRestore(
            db,
            vehicleRecordId,
            fuelRecordId = fuelRecordId,
            fuelRecordIds = fuelRecordIds,
            adminFeeRecordId = adminFeeRecordId,
            evaluate = { script -> support.eval(activity, script) },
            waitFor = { script, timeout -> support.await(activity, script, timeout) },
            click = { label -> support.clickMatching(activity, label) },
            readCalculation = {
                support.javascriptValue(activity,
                    "JSON.stringify({dashboard:document.querySelector('.performance-dashboard')?.innerText??'',provenance:document.querySelector('#performance-provenance')?.textContent??''})").orEmpty()
            },
        )
    }
}
