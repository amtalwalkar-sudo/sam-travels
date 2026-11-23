package `in`.samtravels.app
import android.content.Intent
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
@RunWith(AndroidJUnit4::class)
class AdminEntryPathAuditCapacitorAcceptanceTest {
@Test fun calculationAndExpenseEntryPathsCommitThroughRoomBackedWebView() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val app = instrumentation.targetContext.applicationContext
    var db = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
        .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
        .enableMultiInstanceInvalidation().allowMainThreadQueries().build()
    val support = AdminFormsCapacitorAcceptanceTest()
    val marker = "Entry audit " + UUID.randomUUID().toString().take(8)
    var fuelRecordId: String? = null
    val fuelRecordIds = mutableListOf<String>()
    var vehicleRecordId: String? = null
    val previousPerformanceSettings = db.records().get("feature:performance:settings")
    val financeRecordIds = mutableListOf<String>()
    var assignmentRecordId: String? = null
    val previousWorkSelection = db.records().get("work:selected-driver")
    val activity = instrumentation.startActivitySync(
        Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    ) as MainActivity
    try {
        assertTrue("Drive loads", support.await(activity, "!!document.querySelector('.driver-card')", 30000))
        support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Admin')n.click()})")
        assertTrue("Admin shell", support.await(activity, "!!document.querySelector('.admin-replacement-shell')", 15000))
        support.eval(activity, "[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Admin role'))?.querySelector('input[type=checkbox]')?.click()")
        support.set(activity, "Person name", "$marker Admin")
        support.set(activity, "Set initial Admin PIN", "4831")
        support.eval(activity, "document.querySelector('form button')?.click()")
        assertTrue("Enrollment", support.await(activity, "document.querySelector('[role=status]')?.textContent.includes('Person enrolled')", 15000))
        assertTrue("Activation controls", support.await(activity,
            "(()=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Select person'));return !!l?.querySelector('select')&&[...l.querySelectorAll('option')].some(o=>o.textContent.trim()==='$marker Admin')})()", 15000))
        check(support.javascriptValue(activity, """(()=>{const p=[...document.querySelectorAll('select')].find(s=>s.closest('label')?.textContent.includes('Select person'));const r=[...document.querySelectorAll('select')].find(s=>s.closest('label')?.textContent.includes('Active role'));const o=[...p?.options??[]].find(o=>o.textContent.trim()==='$marker Admin');if(!p||!r||!o)return false;for(const [s,v] of [[p,o.value],[r,'admin']]){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,v);s.dispatchEvent(new Event('change',{bubbles:true}))}return true})()""") == "true")
        assertTrue("Admin PIN appears", support.await(activity, "[...document.querySelectorAll('label')].some(n=>n.textContent.trim()==='Admin PIN')", 5000))
        check(support.javascriptValue(activity, """(()=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.trim()==='Admin PIN');const i=l?.querySelector('input');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'4831');i.dispatchEvent(new Event('input',{bubbles:true}));l.closest('form')?.querySelector('button')?.click();return true})()""") == "true")
        assertTrue("Admin activated", support.await(activity, "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 15000))
        support.eval(activity, "document.getElementById('admin-section-trigger-vehicle')?.click()")
        support.click(activity, "Add vehicle")
        val registration = "MH" + UUID.randomUUID().toString().replace("-", "").take(8).uppercase()
        support.set(activity, "Registration number", registration)
        support.set(activity, "Make", "Acceptance")
        support.set(activity, "Model", "Car")
        support.set(activity, "Vehicle type", "Car")
        support.set(activity, "Fuel type", "CNG")
        support.set(activity, "Year of manufacture", "2024")
        support.set(activity, "Ownership", "Owned")
        support.click(activity, "Create vehicle")
        assertTrue("Vehicle saved", support.await(activity, "document.body.innerText.includes('$registration')", 15000))
        vehicleRecordId = "feature:vehicle:" + registration
        assertNotNull("Vehicle persists in Room", db.records().get(vehicleRecordId!!))
        support.eval(activity, "document.getElementById('admin-section-trigger-business-setup')?.click()")
        support.set(activity, "Business start date", "2026-11-15")
        support.click(activity, "Set business start date")
        assertTrue("Start date saved",
            support.await(activity, "document.body.innerText.includes('Business start date saved.')", 15000))
        support.eval(activity, "document.getElementById('admin-section-trigger-driver')?.click()")
        support.click(activity, "Add driver")
        support.set(activity, "Driver name", marker + " Driver")
        support.set(activity, "Driving licence number", "LIC-" + marker)
        support.set(activity, "Mobile number", "9990001111")
        support.click(activity, "Save driver")
        assertTrue("Driver saved", support.await(activity, "document.body.innerText.includes('Driver created')", 15000))
        val driverRows = db.records().list().filter { row ->
            row.id.startsWith("feature:driver-records:driver:") &&
                JSONObject(row.json).getJSONObject("data").optString("name") == marker + " Driver"
        }
        assertEquals("One Driver profile", 1, driverRows.size)
        val driverRecord = driverRows.single()
        val driverData = JSONObject(driverRecord.json).getJSONObject("data")
        support.click(activity, "Configure for Work")
        assertTrue("Work Driver selection saved", support.await(activity,
            "document.body.innerText.includes('$marker Driver is configured with $registration for Work.')", 15000))
        val selectedDriver = db.records().get("work:selected-driver")
        assertNotNull("D",selectedDriver)
        assertEquals("Selected Driver identity is the saved Driver",
            driverData.getString("driverId"), JSONObject(selectedDriver!!.json).getJSONObject("data").getString("driverId"))
        assignmentRecordId = "feature:driver-records:assignment:" + driverData.getString("driverId")
        assertNotNull("Driver–Vehicle assignment persisted", db.records().get(assignmentRecordId!!))
        support.eval(activity, "document.getElementById('admin-section-trigger-compliance')?.click()")
        support.click(activity, "Add compliance / renewal")
        support.set(activity, "Compliance type / name", marker + " Insurance")
        support.set(activity, "Valid from", "2026-11-15")
        support.set(activity, "Valid until", "2027-11-15")
        support.set(activity, "Total cost (₹)", "12000")
        support.click(activity, "Save record")
        assertTrue("Initial Compliance saved", support.await(activity, "document.body.innerText.includes('Compliance record saved')", 15000))
        val initialComplianceRows = db.records().list().filter { row ->
            row.id.startsWith("feature:compliance:") &&
                JSONObject(row.json).getJSONObject("data").optString("complianceName") == marker + " Insurance"
        }
        assertEquals("Initial Compliance", 1, initialComplianceRows.size)
        val initialCompliance = initialComplianceRows.single()
        val initialComplianceData = JSONObject(initialCompliance.json).getJSONObject("data")
        assertEquals("Compliance is bound to the configured Vehicle", vehicleRecordId, initialComplianceData.getString("vehicleId"))
        support.click(activity, "Add compliance / renewal")
        support.set(activity, "Compliance type / name", marker + " Insurance")
        support.set(activity, "Valid from", "2027-11-16")
        support.set(activity, "Valid until", "2028-11-16")
        support.set(activity, "Total cost (₹)", "12500")
        assertTrue("Renewal predecessor is available", support.await(activity,
            "(()=>{const s=[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Renewing previous record'))?.querySelector('select');return !!s&&[...s.options].some(o=>o.value==='" + initialCompliance.id + "')})()", 10000))
        support.set(activity, "Renewing previous record", initialCompliance.id)
        support.click(activity, "Save record")
        assertTrue("Compliance renewal saved", support.await(activity, "document.body.innerText.includes('Compliance record saved')", 15000))
        val renewalRows = db.records().list().filter { row ->
            row.id.startsWith("feature:compliance:") &&
                JSONObject(row.json).getJSONObject("data").optString("renewedFromRecordId") == initialCompliance.id
        }
        assertEquals("One linked renewal", 1, renewalRows.size)
        val renewal = renewalRows.single()
        assertEquals("Renewal keeps immutable predecessor link", initialCompliance.id,
            JSONObject(renewal.json).getJSONObject("data").getString("renewedFromRecordId"))
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "section.admin-capability-panel", "Traffic Challans", "Issue date", "2026-11-15")
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "section.admin-capability-panel", "Traffic Challans", "Vehicle", vehicleRecordId!!)
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "section.admin-capability-panel", "Traffic Challans", "Challan amount (₹)", "300")
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "section.admin-capability-panel", "Traffic Challans", "Reason", marker + " traffic challan")
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "section.admin-capability-panel", "Traffic Challans", "Challan / transaction reference", "CHALLAN-" + marker)
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "section.admin-capability-panel", "Traffic Challans", "Payment status", "paid")
        AdminEntryPathAuditTestSupport.clickInPanel(activity, support, "section.admin-capability-panel", "Traffic Challans", "Save expense")
        assertTrue("Traffic Challan submitted", support.await(activity,
            "(()=>{const p=[...document.querySelectorAll('section.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent.trim()==='Traffic Challans');return p?.querySelector('[role=status]')?.textContent.includes('Saved.')===true})()", 15000))
        val challanRows = db.records().list().filter { row ->
            row.id.startsWith("feature:business-expenses:entry:") &&
                JSONObject(row.json).getJSONObject("data").let { data ->
                    data.optString("sourceKind") == "traffic_challan" &&
                        data.optString("description") == marker + " traffic challan"
                }
        }
        assertEquals("One challan", 1, challanRows.size)
        val challan = challanRows.single()
        val challanData = JSONObject(challan.json).getJSONObject("data")
        assertEquals("Challan amount", 30000, challanData.getInt("amountPaise"))
        assertEquals("Challan vehicle", vehicleRecordId, challanData.getString("vehicleId"))
        assertEquals("Challan status", "paid", challanData.getString("paymentStatus"))
        assertEquals("Challan ref", "CHALLAN-" + marker, challanData.getString("reference"))
        support.eval(activity, "document.getElementById('admin-section-trigger-finance')?.click()")
        assertTrue("Finance Vehicle selector", support.await(activity, "!!document.querySelector('#admin-vehicle')", 10000))
        support.eval(activity, """(()=>{const s=document.querySelector('#admin-vehicle');const o=[...s.options].find(x=>x.textContent.includes('$registration'));if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true})()""")
        support.click(activity, "Add loan")
        support.set(activity, "Loan name", marker + " Loan")
        support.set(activity, "Lender name", "Acceptance Bank")
        support.set(activity, "Original principal (₹)", "100000")
        support.set(activity, "Annual interest rate (%)", "12")
        support.set(activity, "Tenure (months)", "12")
        support.set(activity, "Loan start date", "2026-01-01")
        support.set(activity, "First EMI date (first day of month)", "2026-02-01")
        support.click(activity, "Save loan details")
        assertTrue("Loan saved", support.await(activity, "document.body.innerText.includes('$marker Loan')", 15000))
        val loanRows = db.records().list().filter { row ->
            row.id.startsWith("feature:finance:loan:") &&
                JSONObject(row.json).getJSONObject("data").optJSONObject("details")?.optString("loanName") == marker + " Loan"
        }
        assertEquals("One Loan record", 1, loanRows.size)
        val loan = loanRows.single()
        val loanUuid = loan.id.removePrefix("feature:finance:loan:")
        val paymentLedgerId = "feature:finance:payments:" + loanUuid
        financeRecordIds.add(paymentLedgerId)
        val originalSchedule = JSONObject(loan.json).getJSONObject("data").getJSONArray("scheduleVersions").getJSONObject(0).getJSONObject("output")
        val emiPaise = originalSchedule.getInt("regularEmiPaise")
        val originalRows = originalSchedule.getJSONArray("rows")
        val originalFinalDate = originalRows.getJSONObject(originalRows.length() - 1).getString("dueDate")
        support.click(activity, "Prepay principal")
        support.set(activity, "Prepayment date", "2026-01-15")
        support.set(activity, "Principal amount (₹)", "30000")
        support.click(activity, "Preview prepayment")
        assertTrue("Prepayment preview shown", support.await(activity, "document.body.innerText.includes('Review before confirmation')", 15000))
        support.click(activity, "Confirm prepayment")
        assertTrue("Prepayment committed", support.await(activity,
            "document.body.innerText.includes('Principal prepayment and revised schedule committed atomically')", 15000))
        val prepaymentId = "feature:finance:prepayments:" + loanUuid
        financeRecordIds.add(prepaymentId)
        val prepaymentRecord = db.records().get(prepaymentId)
        assertNotNull("Prepayment history persisted", prepaymentRecord)
        val revision = JSONObject(prepaymentRecord!!.json).getJSONObject("data").getJSONArray("revisions").getJSONObject(0)
        val prepaymentOutput = revision.getJSONObject("output")
        assertEquals("Prepayment mode", "reduce_tenure", revision.getString("mode"))
        AdminEntryPathAuditTestSupport.assertAdminActor(revision.optJSONObject("createdBy"), "Prepayment")
        assertEquals("Regular EMI unchanged", emiPaise, prepaymentOutput.getInt("regularEmiPaise"))
        assertTrue("Prepayment moves final instalment earlier", prepaymentOutput.getString("finalDueDate") < originalFinalDate)
        assertEquals("Next EMI due date unchanged", originalRows.getJSONObject(0).getString("dueDate"),
            prepaymentOutput.getJSONArray("rows").getJSONObject(0).getString("dueDate"))
        support.click(activity, "Record payment")
        assertTrue("Revised schedule version is available for payment", support.await(activity,
            """(()=>{const s=[...document.querySelectorAll("label")].find(n=>n.textContent.includes("Schedule version"))?.querySelector("select");return !!s&&[...s.options].some(o=>o.value==="2")})()""", 15000))
        support.set(activity, "Schedule version", "2")
        support.set(activity, "Payment date", "2026-02-01")
        support.set(activity, "Amount paid (₹)", String.format(java.util.Locale.US, "%.2f", emiPaise / 100.0))
        support.click(activity, "Suggest oldest-due-first allocation")
        assertTrue("Allocation suggested", support.await(activity,
            "document.body.innerText.includes('Suggested oldest-due-first allocation')", 15000))
        support.click(activity, "Save payment")
        assertTrue("Finance payment committed", support.await(activity,
            "document.body.innerText.includes('Payment recorded atomically')", 15000))
        val ledger = db.records().get(paymentLedgerId)
        assertNotNull("Payment ledger persisted", ledger)
        val paymentEntries = JSONObject(ledger!!.json).getJSONObject("data").getJSONArray("entries")
        val paymentRows = (0 until paymentEntries.length()).map { paymentEntries.getJSONObject(it) }
            .filter { it.optString("kind") == "payment" }
        assertEquals("One recorded payment", 1, paymentRows.size)
        val payment = paymentRows.single()
        assertEquals("Payment uses revised schedule", 2, payment.getInt("scheduleVersion"))
        AdminEntryPathAuditTestSupport.assertAdminActor(payment.optJSONObject("createdBy"), "Payment")
        assertEquals("Payment allocation retains regular EMI amount", emiPaise,
            payment.getJSONArray("allocations").getJSONObject(0).getInt("amountPaise"))
        support.click(activity, "Settle & close")
        support.set(activity, "Settlement date", "2026-02-01")
        support.click(activity, "Check settlement amount")
        assertTrue("Settlement preview shown", support.await(activity, "document.body.innerText.includes('Settlement amount:')", 15000))
        support.eval(activity, "window.confirm = () => true")
        AdminEntryPathAuditTestSupport.clickEnabled(activity, support, "Confirm settlement and close Loan")
        assertTrue("Settlement committed", support.await(activity, "document.body.innerText.includes('Final settlement recorded and Loan closed')", 15000))
        assertEquals("Loan closed in Room", "closed",
            JSONObject(db.records().get(loan.id)!!.json).getJSONObject("data").getString("lifecycleState"))
        val settledLedger = db.records().get(paymentLedgerId)!!
        val settlementEntry = JSONObject(settledLedger.json).getJSONObject("data").getJSONArray("entries").let { rows ->
            (0 until rows.length()).map { rows.getJSONObject(it) }.singleOrNull { it.optString("kind") == "settlement" }
        }
        assertNotNull("Settlement entry", settlementEntry)
        AdminEntryPathAuditTestSupport.assertAdminActor(settlementEntry?.optJSONObject("createdBy"), "Settlement")
        support.eval(activity, "document.getElementById('admin-section-trigger-performance')?.click()")
        support.set(activity, "Monthly Driver Target (₹)", "9000")
        support.click(activity, "Save monthly target")
        assertTrue("Performance target saved", support.await(activity, "document.body.innerText.includes('Monthly Driver Target saved')", 15000))
        assertEquals("Performance target persisted in Room", 900000,
            JSONObject(db.records().get("feature:performance:settings")!!.json).getJSONObject("data").getInt("monthlyDriverTargetPaise"))
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "div.admin-capability-panel", "Pre-business costs", "Amount (₹)", "200")
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, "div.admin-capability-panel", "Pre-business costs", "What was this cost for?", marker + " pre-business cost")
        AdminEntryPathAuditTestSupport.clickInPanel(activity, support, "div.admin-capability-panel", "Pre-business costs", "Add pre-business cost")
        assertTrue("Pre-business cost saved", support.await(activity,
            "(()=>{const p=[...document.querySelectorAll('div.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent.trim()==='Pre-business costs');return p?.querySelector('[role=status]')?.textContent.includes('Pre-business cost entry saved')===true})()", 15000))
        val preBusinessCost = db.records().list().singleOrNull {
            it.id.startsWith("feature:performance:pre-business-cost:") && it.json.contains(marker)
        }
        assertNotNull("Pre-business cost source persisted in Room", preBusinessCost)
        support.click(activity, "＋ Fuel entry")
        assertTrue("Fuel form ready", support.await(activity,
            "!!document.querySelector('.fuel-entry-panel button[type=submit]:not(:disabled)')", 15000))
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Vehicle", vehicleRecordId!!)
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Odometer (km)", "56000")
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Price per kg (₹)", "82.5")
        AdminEntryPathAuditTestSupport.setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Amount paid (₹)", "825")
        assertTrue("Full refill default", support.await(activity,
            "!document.querySelector('.fuel-entry-panel label.fuel-partial-choice input')?.checked", 5000))
        AdminEntryPathAuditTestSupport.clickInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Submit fuel purchase")
        assertTrue("Fuel saved", support.await(activity,
            "document.querySelector('.fuel-entry-panel [role=status]')?.textContent.includes('Fuel purchase saved')", 15000))
        val fuel = db.records().list().singleOrNull { row ->
            row.id.startsWith("feature:business-expenses:fuel:") &&
                JSONObject(row.json).getJSONObject("data").optInt("odometerKm") == 56000
        }
        assertNotNull("First Fuel checkpoint",fuel)
        fuelRecordId = fuel!!.id
        fuelRecordIds.add(fuelRecordId!!)
        assertRoomOperationReceiptExists(db, fuelRecordId!!)
        val fuelData = JSONObject(fuel.json).getJSONObject("data")
        assertEquals("Amount", 82500, fuelData.getInt("amountPaise"))
        assertEquals("Price/kg", 8250, fuelData.getInt("pricePaisePerKg"))
        assertEquals("Odometer", 56000, fuelData.getInt("odometerKm"))
        assertEquals("Full refill", false, fuelData.getBoolean("partialRefill"))
        fuelRecordIds.add(AdminEntryPathAuditTestSupport.submitClosingFuelCheckpoint(activity, support, db, vehicleRecordId!!))
        Stage3AndroidUiBackupAcceptance.assertPerformanceAndRestore(
            db,
            vehicleRecordId!!,
            fuelRecordId = fuelRecordId!!,
            evaluate = { script -> support.eval(activity, script) },
            waitFor = { script, timeout -> support.await(activity, script, timeout) },
            click = { label -> support.clickMatching(activity, label) },
            readCalculation = {
                support.javascriptValue(activity,
                    "JSON.stringify({dashboard:document.querySelector('.performance-dashboard')?.innerText??'',provenance:document.querySelector('#performance-provenance')?.textContent??''})").orEmpty()
            },
        )
    } finally {
        db.records().list().filter { it.json.contains(marker) || it.id in fuelRecordIds ||
            it.id == vehicleRecordId || it.id in financeRecordIds || it.id == assignmentRecordId ||
            it.id == "feature:business-settings:business" ||
            (it.id.startsWith("__sam_travels_feature_operation__:") &&
                JSONObject(it.json).getJSONObject("data").optString("targetRecordId") == "feature:business-settings:business") }.forEach { db.records().remove(it.id) }
        if (previousWorkSelection != null) db.records().put(previousWorkSelection)
        else db.records().remove("work:selected-driver")
        if (previousPerformanceSettings != null) db.records().put(previousPerformanceSettings)
        else db.records().remove("feature:performance:settings")
        runCatching { SecureCredentialVault(app).remove("sam-travels-admin-pin-v1") }
        NativeStartupRecovery.invalidate(db)
        instrumentation.runOnMainSync { activity.finish() }
        db.close()
    }
}
}
