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
        val financeRecordIds = mutableListOf<String>()
        var assignmentRecordId: String? = null
        val previousWorkSelection = db.records().get("work:selected-driver")
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        try {
            assertTrue("Drive loads", support.await(activity, "!!document.querySelector('.driver-card')", 30000))
            support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Admin')n.click()})")
            assertTrue("Admin shell loads", support.await(activity, "!!document.querySelector('.admin-replacement-shell')", 15000))
            check(support.javascriptValue(activity, """(()=>{const set=(labelText,value)=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes(labelText));const i=l?.querySelector('input');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,value);i.dispatchEvent(new Event('input',{bubbles:true}));return true};const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Admin role'));const i=l?.querySelector('input[type=checkbox]');if(!i)return false;i.click();return set('Person name','$marker Admin')&&set('Set initial Admin PIN','4831')})()""") == "true")
            support.eval(activity, "document.querySelector('form button')?.click()")
            assertTrue("Admin enrollment", support.await(activity, "document.querySelector('[role=status]')?.textContent.includes('Person enrolled')", 15000))
            assertTrue("Admin activation controls", support.await(activity,
                "(()=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Select person'));return !!l?.querySelector('select')&&[...l.querySelectorAll('option')].some(o=>o.textContent.trim()==='$marker Admin')})()", 15000))
            check(support.javascriptValue(activity, """(()=>{const find=t=>[...document.querySelectorAll('label')].find(n=>n.textContent.includes(t));const p=find('Select person')?.querySelector('select');const r=find('Active role')?.querySelector('select');if(!p||!r)return false;const set=(s,v)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,v);s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}))};const o=[...p.options].find(o=>o.textContent.trim()==='$marker Admin');if(!o)return false;set(p,o.value);set(r,'admin');return true})()""") == "true")
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
            val vehicleRecordId = "feature:vehicle:" + registration
            assertNotNull("Vehicle persists in Room", db.records().get(vehicleRecordId))

            support.eval(activity, "document.getElementById('admin-section-trigger-driver')?.click()")
            support.click(activity, "Add driver")
            support.set(activity, "Driver name", marker + " Driver")
            support.set(activity, "Driving licence number", "LIC-" + marker)
            support.set(activity, "Mobile number", "9990001111")
            support.click(activity, "Save driver")
            assertTrue("Driver saved", support.await(activity, "document.body.innerText.includes('Driver created')", 15000))
            val driverRecord = db.records().list().single { it.json.contains(marker + " Driver") }
            val driverData = JSONObject(driverRecord.json).getJSONObject("data")
            support.click(activity, "Configure for Work")
            assertTrue("Work Driver selection saved", support.await(activity,
                "document.body.innerText.includes('$marker Driver is configured with $registration for Work.')", 15000))
            val selectedDriver = db.records().get("work:selected-driver")
            assertNotNull("Selected Driver persisted", selectedDriver)
            assertEquals("Selected Driver identity is the saved Driver",
                driverData.getString("driverId"), JSONObject(selectedDriver!!.json).getJSONObject("data").getString("driverId"))
            assignmentRecordId = "feature:driver-records:assignment:" + driverData.getString("driverId")

            support.eval(activity, "document.getElementById('admin-section-trigger-compliance')?.click()")
            support.click(activity, "Add compliance / renewal")
            support.set(activity, "Compliance type / name", marker + " Insurance")
            support.set(activity, "Valid from", "2026-11-15")
            support.set(activity, "Valid until", "2027-11-15")
            support.set(activity, "Total cost (₹)", "12000")
            support.click(activity, "Save record")
            assertTrue("Initial Compliance saved", support.await(activity, "document.body.innerText.includes('Compliance record saved')", 15000))
            val initialCompliance = db.records().list().single { it.json.contains(marker + " Insurance") }
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
            val renewal = db.records().list().single { row ->
                JSONObject(row.json).getJSONObject("data").optString("renewedFromRecordId") == initialCompliance.id
            }
            assertEquals("Renewal keeps immutable predecessor link", initialCompliance.id,
                JSONObject(renewal.json).getJSONObject("data").getString("renewedFromRecordId"))

            support.set(activity, "Issue date", "2026-11-15")
            support.set(activity, "Vehicle", vehicleRecordId)
            support.set(activity, "Challan amount (₹)", "300")
            support.set(activity, "Reason", marker + " traffic challan")
            support.set(activity, "Challan / transaction reference", "CHALLAN-" + marker)
            support.set(activity, "Payment status", "paid")
            support.click(activity, "Save expense")
            assertTrue("Traffic Challan submitted", support.await(activity, "document.body.innerText.includes('Saved.')", 15000))
            val challan = db.records().list().singleOrNull { it.json.contains("CHALLAN-" + marker) }
            assertNotNull("Traffic Challan persisted in Room", challan)

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
            val loan = db.records().list().single { it.json.contains(marker + " Loan") }
            val loanUuid = loan.id.removePrefix("feature:finance:loan:")
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
            assertEquals("Regular EMI unchanged", emiPaise, prepaymentOutput.getInt("regularEmiPaise"))
            assertTrue("Prepayment moves final instalment earlier", prepaymentOutput.getString("finalDueDate") < originalFinalDate)
            assertEquals("Next EMI due date unchanged", originalRows.getJSONObject(0).getString("dueDate"),
                prepaymentOutput.getJSONArray("rows").getJSONObject(0).getString("dueDate"))

            support.click(activity, "Record payment")
            support.set(activity, "Payment date", "2026-02-01")
            support.set(activity, "Amount paid (₹)", String.format(java.util.Locale.US, "%.2f", emiPaise / 100.0))
            support.click(activity, "Suggest oldest-due-first allocation")
            assertTrue("Payment allocation suggested", support.await(activity,
                "document.body.innerText.includes('Suggested oldest-due-first allocation')", 15000))
            support.click(activity, "Save payment")
            assertTrue("Finance payment committed", support.await(activity,
                "document.body.innerText.includes('Payment recorded atomically')", 15000))
            val paymentLedgerId = "feature:finance:payments:" + loanUuid
            financeRecordIds.add(paymentLedgerId)
            val ledger = db.records().get(paymentLedgerId)
            assertNotNull("Payment ledger persisted", ledger)
            val paymentEntries = JSONObject(ledger!!.json).getJSONObject("data").getJSONArray("entries")
            val payment = (0 until paymentEntries.length()).map { paymentEntries.getJSONObject(it) }.single { it.optString("kind") == "payment" }
            assertEquals("Payment uses revised schedule", 2, payment.getInt("scheduleVersion"))
            assertEquals("Payment allocation retains regular EMI amount", emiPaise,
                payment.getJSONArray("allocations").getJSONObject(0).getInt("amountPaise"))

            support.click(activity, "Settle & close")
            support.set(activity, "Settlement date", "2026-02-01")
            support.click(activity, "Check settlement amount")
            assertTrue("Settlement preview shown", support.await(activity, "document.body.innerText.includes('Settlement amount:')", 15000))
            support.click(activity, "Confirm settlement and close Loan")
            assertTrue("Settlement committed", support.await(activity, "document.body.innerText.includes('Final settlement recorded and Loan closed')", 15000))
            assertEquals("Loan closed in Room", "closed",
                JSONObject(db.records().get(loan.id)!!.json).getJSONObject("data").getString("lifecycleState"))
            val settledLedger = db.records().get(paymentLedgerId)!!
            assertTrue("Settlement ledger entry persisted",
                JSONObject(settledLedger.json).getJSONObject("data").getJSONArray("entries").let { rows ->
                    (0 until rows.length()).any { rows.getJSONObject(it).optString("kind") == "settlement" }
                })

            support.eval(activity, "document.getElementById('admin-section-trigger-performance')?.click()")
            support.set(activity, "Monthly Driver Target (₹)", "9000")
            support.click(activity, "Save monthly target")
            assertTrue("Performance target saved", support.await(activity, "document.body.innerText.includes('Monthly Driver Target saved')", 15000))
            assertEquals("Performance target persisted in Room", 900000,
                JSONObject(db.records().get("feature:performance:settings")!!.json).getJSONObject("data").getInt("monthlyDriverTargetPaise"))
            support.set(activity, "Amount (₹)", "200")
            support.set(activity, "What was this cost for?", marker + " pre-business cost")
            support.click(activity, "Add pre-business cost")
            assertTrue("Pre-business cost saved", support.await(activity, "document.body.innerText.includes('Pre-business cost entry saved')", 15000))
            val preBusinessCost = db.records().list().singleOrNull {
                it.id.startsWith("feature:performance:pre-business-cost:") && it.json.contains(marker)
            }
            assertNotNull("Pre-business cost source persisted in Room", preBusinessCost)

            support.click(activity, "＋ Fuel entry")
            support.set(activity, "Vehicle", vehicleRecordId)
            support.set(activity, "Odometer (km)", "56000")
            support.set(activity, "Price per kg (₹)", "82.5")
            support.set(activity, "Amount paid (₹)", "825")
            assertTrue("Fuel defaults to full refill", support.await(activity,
                "!document.querySelector('.fuel-entry-panel label.fuel-partial-choice input')?.checked", 5000))
            support.click(activity, "Submit fuel purchase")
            assertTrue("Fuel purchase saved", support.await(activity,
                "document.querySelector('.fuel-entry-panel [role=status]')?.textContent.includes('Fuel purchase saved')", 15000))
            val fuel = db.records().list().singleOrNull { row ->
                row.id.startsWith("feature:business-expenses:fuel:") &&
                    JSONObject(row.json).getJSONObject("data").optString("vehicleId") == vehicleRecordId
            }
            assertNotNull("Fuel purchase persisted in Room", fuel)
            fuelRecordId = fuel!!.id
            val fuelData = JSONObject(fuel.json).getJSONObject("data")
            assertEquals("Fuel amount paise", 82500, fuelData.getInt("amountPaise"))
            assertEquals("Fuel price paise per kg", 8250, fuelData.getInt("pricePaisePerKg"))
            assertEquals("Fuel odometer", 56000, fuelData.getInt("odometerKm"))
            assertEquals("Fuel full refill flag", false, fuelData.getBoolean("partialRefill"))
        } finally {
            db.records().list().filter { it.json.contains(marker) || it.id == fuelRecordId ||
                it.id in financeRecordIds || it.id == assignmentRecordId }.forEach { db.records().remove(it.id) }
            if (previousWorkSelection != null) db.records().put(previousWorkSelection)
            else db.records().remove("work:selected-driver")
            runCatching { SecureCredentialVault(app).remove("sam-travels-admin-pin-v1") }
            NativeStartupRecovery.invalidate(db)
            instrumentation.runOnMainSync { activity.finish() }
            db.close()
        }
    }
}
