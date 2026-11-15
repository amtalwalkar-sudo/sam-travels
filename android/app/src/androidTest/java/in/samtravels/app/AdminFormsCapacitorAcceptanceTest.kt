package `in`.samtravels.app

import android.content.Intent
import android.os.SystemClock
import android.webkit.WebView
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class AdminFormsCapacitorAcceptanceTest { // WebView acceptance coverage
    @Test fun replacementAdminFormsUseRoomBackedWebView() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext.applicationContext
        var db = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation().allowMainThreadQueries().build()
        val marker = "Admin Android " + UUID.randomUUID().toString().take(8)
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        try {
            assertTrue("Drive loads", await(activity, "!!document.querySelector('.driver-card')", 30000))
            eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Admin')n.click()})")
            assertTrue("Admin shell loads", await(activity, "!!document.querySelector('.admin-replacement-shell')", 15000))
            check(javascriptValue(activity, """(()=>{const set=(labelText,value)=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes(labelText));const i=l?.querySelector('input');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,value);i.dispatchEvent(new Event('input',{bubbles:true}));return true};const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Admin role'));const i=l?.querySelector('input[type=checkbox]');if(!i)return false;i.click();return set('Person name','$marker Admin')&&set('Set initial Admin PIN','4831')})()""")=="true") { "Admin enrollment fields unavailable" }
            eval(activity, "document.querySelector('form button')?.click()")
            assertTrue("Admin enrollment", await(activity, "document.querySelector('[role=status]')?.textContent.includes('Person enrolled')", 15000))
            assertTrue("Admin activation controls", await(activity, "(()=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.includes('Select person'));return !!l?.querySelector('select')&&[...l.querySelectorAll('option')].some(o=>o.textContent.trim()==='$marker Admin')})()", 15000))
            check(javascriptValue(activity, """(()=>{const find=t=>[...document.querySelectorAll('label')].find(n=>n.textContent.includes(t));const p=find('Select person')?.querySelector('select');const r=find('Active role')?.querySelector('select');if(!p||!r)return false;const set=(s,v)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,v);s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}))};const o=[...p.options].find(o=>o.textContent.trim()==='$marker Admin');if(!o)return false;set(p,o.value);set(r,'admin');return true})()""")=="true") { "Admin activation selectors unavailable" }
            assertTrue("Admin PIN appears", await(activity, "[...document.querySelectorAll('label')].some(n=>n.textContent.trim()==='Admin PIN')", 5000))
            check(javascriptValue(activity, """(()=>{const l=[...document.querySelectorAll('label')].find(n=>n.textContent.trim()==='Admin PIN');const i=l?.querySelector('input');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'4831');i.dispatchEvent(new Event('input',{bubbles:true}));l.closest('form')?.querySelector('button')?.click();return true})()""")=="true") { "Admin PIN input unavailable" }
            assertTrue("Admin activation", await(activity, "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 15000))

            val sections = listOf("business-setup" to "Business start date", "vehicle" to "Add vehicle",
                "driver" to "Add driver", "compliance" to "Add a vehicle before recording compliance.",
                "finance" to "Platform Fees", "maintenance" to "Add a vehicle before recording maintenance.")
            sections.forEach { (id, expected) ->
                eval(activity, "document.getElementById('admin-section-trigger-$id')?.click()")
                assertTrue("Section $id", await(activity,
                    "(()=>{const p=document.getElementById('admin-section-panel-$id');return !!p&&!p.hidden&&p.textContent.includes('$expected')})()", 10000))
            }

            eval(activity, "document.getElementById('admin-section-trigger-business-setup')?.click()")
            assertTrue("Business settings form loads", await(activity, "document.body.innerText.includes('Business start date')", 15000))
            set(activity, "Business start date", "2024-01-01")
            clickMatching(activity, "Set business start date|Save changes")
            assertTrue("Business setting saved", await(activity, "document.body.innerText.includes('Business start date saved')", 15000))

            eval(activity, "document.getElementById('admin-section-trigger-vehicle')?.click()")
            click(activity, "Add vehicle")
            val registration = "MH" + UUID.randomUUID().toString().replace("-", "").take(8).uppercase()
            set(activity, "Registration number", registration)
            set(activity, "Make", "Acceptance")
            set(activity, "Model", "Car")
            set(activity, "Vehicle type", "Car")
            set(activity, "Fuel type", "CNG")
            set(activity, "Year of manufacture", "2024")
            set(activity, "Ownership", "Owned")
            click(activity, "Create vehicle")
            assertTrue("Vehicle saved", await(activity, "document.body.innerText.includes('$registration')", 15000))
            val vehicleRecordId = "feature:vehicle:" + registration
            assertTrue("Vehicle Room identity", db.records().get(vehicleRecordId) != null)
            db.close()

            eval(activity, "document.getElementById('admin-section-trigger-driver')?.click()")
            click(activity, "Add driver")
            set(activity, "Driver name", marker + " Driver")
            set(activity, "Driving licence number", "LIC-" + marker)
            set(activity, "Mobile number", "9990001111")
            click(activity, "Save driver")
            assertTrue("Driver saved", await(activity, "document.body.innerText.includes('Driver created')", 15000))

            eval(activity, "document.getElementById('admin-section-trigger-compliance')?.click()")
            assertTrue("Compliance vehicle selector", await(activity, "document.querySelectorAll('#admin-section-panel-compliance select').length>0", 10000))
            eval(activity, """(()=>{const s=document.querySelector('#admin-section-panel-compliance select');const o=[...s.options].find(x=>x.textContent.includes('$registration'));if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));return true})()""")
            click(activity, "Add compliance / renewal")
            set(activity, "Compliance type / name", marker + " Insurance")
            set(activity, "Valid from", "2026-11-15")
            set(activity, "Valid until", "2027-11-15")
            set(activity, "Total cost (₹)", "12000")
            set(activity, "Document reference (optional)", "INS-" + marker)
            click(activity, "Save record")
            assertTrue("Compliance saved", await(activity, "document.body.innerText.includes('Compliance record saved')", 15000))

            assertTrue("Traffic challan form fields render", await(activity,
                "document.body.innerText.includes('Challan amount (₹)')&&document.body.innerText.includes('Save expense')", 15000))

            eval(activity, "document.getElementById('admin-section-trigger-finance')?.click()")
            assertTrue("Finance vehicle selector", await(activity, "!!document.querySelector('#admin-vehicle')", 10000))
            eval(activity, """(()=>{const s=document.querySelector('#admin-vehicle');const o=[...s.options].find(x=>x.textContent.includes('$registration'));if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true})()""")
            click(activity, "Add loan")
            set(activity, "Loan name", marker + " Loan")
            set(activity, "Lender name", "Acceptance Bank")
            set(activity, "Original principal (₹)", "100000")
            set(activity, "Annual interest rate (%)", "12")
            set(activity, "Tenure (months)", "12")
            set(activity, "Loan start date", "2026-01-01")
            set(activity, "First EMI date (first day of month)", "2026-02-01")
            click(activity, "Save loan details")
            assertTrue("Loan saved", await(activity, "document.body.innerText.includes('$marker Loan')", 15000))
            assertTrue("Loan payment, prepayment and settlement actions render", await(activity,
                "document.body.innerText.includes('Record payment')&&document.body.innerText.includes('Prepay principal')&&document.body.innerText.includes('Settle & close')", 15000))

            set(activity, "Fee date", "2026-11-15")
            set(activity, "Vehicle", vehicleRecordId)
            set(activity, "Fee amount (₹)", "120")
            set(activity, "Trip / settlement reference", "FEE-" + marker)
            set(activity, "Note", marker + " platform fee")
            assertTrue("Platform fee inputs valid: " + javascriptValue(activity, "(()=>{const s=[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees');const f=s?.querySelector('form');return [...(f?.querySelectorAll(':invalid')??[])].map(e=>e.closest('label')?.textContent||e.name||e.type).join(',')})()"), await(activity, "[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees')?.querySelector('form')?.checkValidity()", 10000))
            click(activity, "Save expense")
            assertTrue("Platform fee state=" + javascriptValue(activity, "(()=>{const s=[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees');return s?.querySelector('button[type=submit]')?.textContent+' :: '+[...(s?.querySelectorAll('input')??[])].map(i=>i.type+'='+i.value+' valid='+i.validity.valid).join(';')+' :: '+s?.innerText})()"), await(activity, "[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees')?.querySelector('[role=status]')?.textContent.includes('Saved.')", 30000))

            set(activity, "Expense date", "2026-11-15")
            set(activity, "Category", "Parking " + marker)
            set(activity, "Amount (₹)", "50")
            set(activity, "Vehicle", registration, 1)
            set(activity, "Description", marker + " parking")
            set(activity, "Receipt / source reference", "PARK-" + marker)
            click(activity, "Save expense", 1)
            assertTrue("Misc expense saved", await(activity, "document.body.innerText.includes('Saved.')", 15000))

            eval(activity, "document.getElementById('admin-section-trigger-maintenance')?.click()")
            click(activity, "Start service visit")
            set(activity, "Maintenance type", marker + " service")
            set(activity, "Date", "2026-11-15")
            set(activity, "Provider / garage (optional)", "Acceptance Garage")
            set(activity, "Odometer km (optional)", "55000")
            set(activity, "Description", marker + " service visit")
            set(activity, "Item 1", "Oil and filter")
            set(activity, "Amount (₹)", "1200")
            click(activity, "Save maintenance record")
            assertTrue("Maintenance visit saved", await(activity, "document.body.innerText.includes('Service visit saved')", 15000))
            eval(activity, """(()=>{const s=document.querySelectorAll('#admin-section-panel-maintenance .admin-vehicle-context select')[1];if(!s)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'expense');s.dispatchEvent(new Event('change',{bubbles:true}));return true})()""")
            click(activity, "Start general expense")
            set(activity, "Expense name", marker + " tyre repair")
            set(activity, "Date", "2026-11-15")
            set(activity, "Provider / garage (optional)", "Acceptance Garage")
            set(activity, "Odometer km (optional)", "55100")
            set(activity, "Amount (₹)", "4000")
            set(activity, "Description", marker + " tyre receipt")
            click(activity, "Save maintenance record")
            assertTrue("Maintenance expense saved", await(activity, "document.body.innerText.includes('Maintenance expense saved')", 15000))
            click(activity, "Change per-kilometre rate")
            set(activity, "New rate (₹ per km)", "2.50")
            click(activity, "Save rate")
            assertTrue("Maintenance rate saved", await(activity, "document.body.innerText.includes('Per-kilometre rate saved with effective-date history')", 15000))

            db = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
                .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
                .enableMultiInstanceInvalidation().allowMainThreadQueries().build()
            val records = db.records().list().joinToString("\n") { it.json }
            listOf(registration, marker + " Driver", marker + " Insurance",
                marker + " Loan", "FEE-" + marker, "PARK-" + marker, marker + " service visit")
                .forEach { assertTrue("Room persists " + it, records.contains(it)) }
            val backup = NativeBackupCoverage.exportBusinessRecords(db) { false }
            NativeBackupCoverage.validateBusinessRecords(backup)
            val submittedIds = db.records().list().filter { it.json.contains(marker) || it.json.contains(registration) }.map { it.id }
            NativeBackupCoverage.replaceBusinessRecords(db, JSONArray())
            submittedIds.forEach { id -> assertTrue("Backup replacement clears " + id, db.records().get(id) == null) }
            NativeBackupCoverage.replaceBusinessRecords(db, backup)
            val restoredJson = db.records().list().joinToString("\\n") { it.json }
            listOf(marker + " Driver", marker + " Insurance", marker + " Loan",
                "FEE-" + marker, "PARK-" + marker, marker + " service visit")
                .forEach { assertTrue("Room backup restores " + it, restoredJson.contains(it)) }
        } finally {
            // Keep shared emulator state isolated even when an assertion fails midway.
            db.records().list().filter { it.json.contains(marker) }.forEach { db.records().remove(it.id) }
            runCatching { SecureCredentialVault(app).remove("sam-travels-admin-pin-v1") }
            instrumentation.runOnMainSync { activity.finish() }
            db.close()
        }
    }

    private fun set(activity: MainActivity, label: String, value: String, index: Int = 0) {
        val name = label.replace("'", "\\'")
        assertTrue("Admin field loads: " + label, await(activity,
            "[...document.querySelectorAll('label')].some(n=>n.textContent.includes('$name'))", 15000))
        val text = value.replace("'", "\\'")
        val js = """(()=>{let a=[...document.querySelectorAll('label')].filter(n=>n.textContent.trim()==='$name');if(!a.length)a=[...document.querySelectorAll('label')].filter(n=>n.textContent.includes('$name'));const c=a[$index]?.querySelector('input,select,textarea');if(!c)return false;const p=c instanceof HTMLSelectElement?HTMLSelectElement.prototype:c instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(c,'$text');c.dispatchEvent(new Event(c instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()"""
        check(javascriptValue(activity, js) == "true") { "Missing Admin field: " + label }
    }

    private fun click(activity: MainActivity, label: String, index: Int = 0) {
        val name = label.replace("'", "\\'")
        assertTrue("Admin action loads: " + label, await(activity,
            "[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='$name'&&!n.disabled)", 15000))
        val js = """(()=>{const a=[...document.querySelectorAll('button')].filter(n=>n.textContent.trim()==='$name');if(!a[$index])return false;a[$index].click();return true})()"""
        check(javascriptValue(activity, js) == "true") { "Missing Admin action: " + label }
    }

    private fun clickMatching(activity: MainActivity, pattern: String) {
        val js = """(()=>{const r=/$pattern/;const b=[...document.querySelectorAll('button')].find(n=>r.test(n.textContent));if(!b)return false;b.click();return true})()"""
        check(javascriptValue(activity, js) == "true")
    }

    private fun eval(activity: MainActivity, script: String) {
        val webView = activity.getBridge().getWebView()
        val latch = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.evaluateJavascript(script) { latch.countDown() }
        }
        check(latch.await(15, TimeUnit.SECONDS))
    }

    private fun javascriptValue(activity: MainActivity, expression: String): String? {
        val webView = activity.getBridge().getWebView()
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.evaluateJavascript(expression) { result.set(it); latch.countDown() }
        }
        return if (latch.await(3, TimeUnit.SECONDS)) result.get() else null
    }

    private fun await(activity: MainActivity, expression: String, timeoutMs: Long): Boolean {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < deadline) {
            if (javascriptValue(activity, "Boolean($expression)") == "true") return true
            SystemClock.sleep(100)
        }
        return false
    }
}
