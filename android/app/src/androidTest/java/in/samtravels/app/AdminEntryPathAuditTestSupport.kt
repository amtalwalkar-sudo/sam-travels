package `in`.samtravels.app
import android.content.Intent
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.json.JSONObject
import org.junit.Assert.assertTrue
internal object AdminEntryPathAuditTestSupport {
    fun assertAdminActor(actor: JSONObject?, label: String) {
        assertTrue("$label actor", actor != null && actor.optString("personId").isNotBlank() &&
            actor.optString("role") == "admin")
    }
    fun clickEnabled(activity: MainActivity, support: AdminFormsCapacitorAcceptanceTest, label: String) {
        val safe = label.replace("'", "\\'")
        val ready = """[...document.querySelectorAll('button')].some(b=>b.textContent.includes('$safe')&&!b.disabled)"""
        assertTrue("Enabled $label", support.await(activity, ready, 15000))
        support.clickMatching(activity, label)
    }
    fun setInPanel(
        activity: MainActivity, support: AdminFormsCapacitorAcceptanceTest,
        selector: String, heading: String, label: String, value: String,
    ) {
        val h = heading.replace("'", "\\'")
        val l = label.replace("'", "\\'")
        val v = value.replace("'", "\\'")
        val ready = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');return !!p&&[...p.querySelectorAll('label')].some(n=>n.textContent.trim().startsWith('$l'))})()"""
        assertTrue("Missing field $label in $heading", support.await(activity, ready, 15000))
        val script = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');const l=[...p.querySelectorAll('label')].find(n=>n.textContent.trim().startsWith('$l'));const c=l?.querySelector('input,select,textarea');if(!c)return false;const q=c instanceof HTMLSelectElement?HTMLSelectElement.prototype:c instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(q,'value').set.call(c,'$v');c.dispatchEvent(new Event(c instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()"""
        check(support.javascriptValue(activity, script) == "true") { "Could not set $label in $heading" }
    }
    fun clickInPanel(
        activity: MainActivity, support: AdminFormsCapacitorAcceptanceTest,
        selector: String, heading: String, button: String,
    ) {
        val h = heading.replace("'", "\\'")
        val b = button.replace("'", "\\'")
        val ready = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');return !!p&&[...p.querySelectorAll('button')].some(n=>n.textContent.trim()==='$b'&&!n.disabled)})()"""
        assertTrue("Missing action $button in $heading", support.await(activity, ready, 15000))
        val script = """(()=>{const p=[...document.querySelectorAll('$selector')].find(n=>n.querySelector('h2,h3')?.textContent.trim()==='$h');const b=[...p.querySelectorAll('button')].find(n=>n.textContent.trim()==='$b'&&!n.disabled);if(!b)return false;b.click();return true})()"""
        check(support.javascriptValue(activity, script) == "true") { "Could not click $button in $heading" }
    }
    /** Exercises the rendered Admin form through Room commit, completion-write failure, WebView recreation and receipt replay. */
    fun assertPlatformFeePostCommitRecovery(
        startingActivity: MainActivity,
        support: AdminFormsCapacitorAcceptanceTest,
        db: LocalDatabase,
        marker: String,
        adminDisplayName: String,
    ): Pair<MainActivity, String> {
        var activity = startingActivity
        support.eval(activity, "window.Capacitor?.Plugins?.RoomStore?.armWorkingCopyCompletionFailure?.().then(()=>window.__stage3AdminRoomFailureArmed=true)")
        assertTrue("Debug Room fault injector arms for the Admin form completion boundary",
            support.await(activity, "window.__stage3AdminRoomFailureArmed===true", 10000))
        support.eval(activity, "(()=>{const s=[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees');s?.querySelector('form button[type=submit]')?.click()})()")
        val deadline = SystemClock.uptimeMillis() + 20000
        var copyId: String? = null
        var originalJson: String? = null
        while (SystemClock.uptimeMillis() < deadline) {
            val rows = db.records().list()
            val fee = rows.firstOrNull { row ->
                row.id.startsWith("feature:business-expenses:entry:") &&
                    JSONObject(row.json).getJSONObject("data").optString("sourceKind") == "platform_fee" &&
                    JSONObject(row.json).getJSONObject("data").optString("reference") == "FEE-" + marker
            }
            val pending = rows.firstOrNull { row ->
                if (!row.id.startsWith("__sam_travels_form_working_copy__:admin.platform-fee:")) false else {
                    val copy = JSONObject(row.json).getJSONObject("data")
                    val values = copy.optJSONObject("values")
                    val submittedValues = copy.optJSONObject("submission")?.optJSONObject("values")
                    copy.optString("status") == "pending" &&
                        (values?.optString("reference") == "FEE-" + marker ||
                            submittedValues?.optString("reference") == "FEE-" + marker)
                }
            }
            if (fee != null && pending != null) {
                copyId = pending.id
                originalJson = fee.json
                break
            }
            SystemClock.sleep(100)
        }
        assertNotNull("Admin Platform Fee and durable pending intent survive the injected post-commit failure", copyId)
        assertNotNull("Original Admin Platform Fee record is committed before working-copy completion", originalJson)
        val recordId = JSONObject(originalJson!!).getString("id")
        val receiptCount = db.records().list().count { row ->
            row.id.startsWith("__sam_travels_feature_operation__:") &&
                JSONObject(row.json).getJSONObject("data").optString("targetRecordId") == recordId
        }
        assertEquals("Admin Platform Fee target and receipt committed atomically", 1, receiptCount)
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        activity.finish()
        instrumentation.waitForIdleSync()
        activity = instrumentation.startActivitySync(
            Intent(activity.applicationContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        assertTrue("Admin WebView restarts after the post-commit interruption",
            support.await(activity, "!!document.querySelector('.bottom-navigation-item')", 30000))
        support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Admin')n.click()})")
        assertTrue("Admin workspace returns after restart",
            support.await(activity, "!!document.querySelector('.admin-replacement-shell')", 15000))
        val adminPerson = db.records().list().firstOrNull { row ->
            row.id.startsWith("identity:person:") &&
                JSONObject(row.json).getJSONObject("data").optString("displayName") == adminDisplayName
        } ?: error("stage3_admin_identity_missing")
        val adminPersonId = JSONObject(adminPerson.json).getJSONObject("data").getString("personId")
        support.set(activity, "Select person", adminPersonId)
        support.set(activity, "Active role", "admin")
        support.set(activity, "Admin PIN", "4831")
        support.click(activity, "Activate role")
        assertTrue("Admin session is reactivated after Platform Fee recovery restart",
            support.await(activity, "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 15000))
        support.eval(activity, "(()=>{const p=document.getElementById('admin-section-panel-finance');if(p?.hidden)document.getElementById('admin-section-trigger-finance')?.click()})()")
        assertTrue("Pending Platform Fee draft is recovered in the rendered Admin form",
            support.await(activity, """(()=>{const s=[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees');return !!s&&s.textContent.includes('Draft · pending')&&s.textContent.includes('FEE-$marker')})()""", 15000))
        support.eval(activity, "(()=>{const s=[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees');s?.querySelector('form button[type=submit]')?.click()})()")
        assertTrue("Pending Admin Platform Fee replays the original Room receipt",
            support.await(activity, """(()=>{const s=[...document.querySelectorAll('.admin-capability-panel')].find(n=>n.querySelector('h3')?.textContent==='Platform Fees');return s?.querySelector('[role=status]')?.textContent.includes('Saved.')===true})()""", 20000))
        val after = db.records().list().filter { row ->
            row.id.startsWith("feature:business-expenses:entry:") &&
                JSONObject(row.json).getJSONObject("data").optString("sourceKind") == "platform_fee" &&
                JSONObject(row.json).getJSONObject("data").optString("reference") == "FEE-" + marker
        }
        assertEquals("Admin post-commit retry creates exactly one Platform Fee record", 1, after.size)
        assertEquals("Admin retry returns the original record envelope", originalJson, after.single().json)
        val receiptsAfter = db.records().list().count { row ->
            row.id.startsWith("__sam_travels_feature_operation__:") &&
                JSONObject(row.json).getJSONObject("data").optString("targetRecordId") == recordId
        }
        assertEquals("Admin retry preserves exactly one feature receipt", receiptCount, receiptsAfter)
        assertEquals("Admin working copy completes after receipt replay", "saved",
            JSONObject(db.records().get(copyId!!)!!.json).getJSONObject("data").getString("status"))
        return activity to recordId
    }

    fun submitClosingFuelCheckpoint(activity: MainActivity, support: AdminFormsCapacitorAcceptanceTest, db: LocalDatabase, vehicleId: String): String {
        SystemClock.sleep(1100)
        setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Vehicle", vehicleId)
        setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Odometer (km)", "56042")
        setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Price per kg (₹)", "82.5")
        setInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Amount paid (₹)", "825")
        clickInPanel(activity, support, ".fuel-entry-panel", "Fuel Entry", "Submit fuel purchase")
        assertTrue("Closing Fuel checkpoint saved", support.await(activity,
            "document.querySelector('.fuel-entry-panel [role=status]')?.textContent.includes('Fuel purchase saved')", 15000))
        val row = db.records().list().singleOrNull { it.id.startsWith("feature:business-expenses:fuel:") &&
            JSONObject(it.json).getJSONObject("data").optInt("odometerKm") == 56042 }
        assertNotNull("Closing Fuel checkpoint", row)
        val id = row!!.id
        assertEquals("Closing Fuel operation receipt", 1, db.records().list().count { it.id.startsWith("__sam_travels_feature_operation__:") &&
            JSONObject(it.json).getJSONObject("data").optString("targetRecordId") == id })
        return id
    }
    /** Verifies Room-backed Fuel draft resume and post-commit receipt replay through the actual WebView. */
    fun assertFuelDraftAndPostCommitRecovery(
        startingActivity: MainActivity,
        support: AdminFormsCapacitorAcceptanceTest,
        db: LocalDatabase,
        vehicleRecordId: String,
        adminDisplayName: String,
    ): Pair<MainActivity, String> {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var activity = startingActivity
        val adminPerson = db.records().list().firstOrNull { row ->
            row.id.startsWith("identity:person:") &&
                JSONObject(row.json).getJSONObject("data").optString("displayName") == adminDisplayName
        } ?: error("stage3_admin_identity_missing")
        val adminPersonId = JSONObject(adminPerson.json).getJSONObject("data").getString("personId")
        fun reactivateAdmin() {
            support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Admin')n.click()})")
            assertTrue("Admin workspace returns after WebView recreation",
                support.await(activity, "!!document.querySelector('.admin-replacement-shell')", 15000))
            support.set(activity, "Select person", adminPersonId)
            support.set(activity, "Active role", "admin")
            support.set(activity, "Admin PIN", "4831")
            support.click(activity, "Activate role")
            assertTrue("Admin session is reactivated after WebView recreation",
                support.await(activity, "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 15000))
        }
        support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Drive')n.click()})")
        assertTrue("Work screen exposes Fuel Entry without an active shift",
            support.await(activity, "!!document.querySelector('.fuel-entry-toggle')", 15000))
        support.eval(activity, "document.querySelector('.fuel-entry-toggle')?.click()")
        assertTrue("Fuel form opens while no shift is active",
            support.await(activity, "!!document.querySelector('.fuel-entry-panel')", 10000))
        fun setFuelField(label: String, value: String) {
            val safeLabel = label.replace("'", "\\'")
            val safeValue = value.replace("'", "\\'")
            val script = """(()=>{const p=document.querySelector('.fuel-entry-panel');const l=[...p.querySelectorAll('label')].find(n=>n.textContent.trim().startsWith('$safeLabel'));const c=l?.querySelector('input,select');if(!c)return false;const proto=c instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(c,'$safeValue');c.dispatchEvent(new Event(c instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()"""
            check(support.javascriptValue(activity, script) == "true") { "Fuel field missing: $label" }
        }
        assertTrue("Fuel form is fully loaded and its controls are enabled",
            support.await(activity, "!!document.querySelector('.fuel-entry-panel select:not(:disabled)') && !!document.querySelector('.fuel-entry-panel input:not(:disabled)')", 15000))
        setFuelField("Vehicle", vehicleRecordId)
        setFuelField("Odometer (km)", "55123")
        setFuelField("Price per kg (₹)", "82.50")
        setFuelField("Amount paid (₹)", "825")
        val fuelInputSnapshot = support.javascriptValue(activity,
            """(()=>{const p=document.querySelector('.fuel-entry-panel');return JSON.stringify([...p.querySelectorAll('label')].map(l=>({label:l.textContent.trim(),value:l.querySelector('input,select')?.value,options:[...(l.querySelector('select')?.options??[])].map(o=>({text:o.textContent.trim(),value:o.value}))})))})()""")
        assertTrue("Fuel draft inputs reflect the entered values before interruption: " + fuelInputSnapshot,
            support.await(activity, """(()=>{const p=document.querySelector('.fuel-entry-panel');const value=t=>[...p.querySelectorAll('label')].find(l=>l.textContent.trim().startsWith(t))?.querySelector('input,select')?.value;return value('Vehicle')==='$vehicleRecordId'&&value('Odometer (km)')==='55123'&&value('Price per kg')==='82.5'&&value('Amount paid')==='825'})()""", 10000))
        val workingCopyPrefix = "__sam_travels_form_working_copy__:work.fuel-entry:"
        val draftDeadline = SystemClock.uptimeMillis() + 15000
        var workingCopyId: String? = null
        while (SystemClock.uptimeMillis() < draftDeadline) {
            val row = db.records().list().firstOrNull { candidate ->
                if (!candidate.id.startsWith(workingCopyPrefix)) false else {
                    val data = JSONObject(candidate.json).getJSONObject("data")
                    val values = data.optJSONObject("values")
                    data.optString("status") == "in_progress" && values != null &&
                        values.optString("vehicleId") == vehicleRecordId &&
                        values.optInt("odometerKm") == 55123 &&
                        values.optDouble("priceRupeesPerKg") == 82.5 &&
                        values.optDouble("amountRupees") == 825.0
                }
            }
            if (row != null) {
                workingCopyId = row.id
                break
            }
            SystemClock.sleep(100)
        }
        assertNotNull("Fuel draft values are durably committed to Room before interruption", workingCopyId)
        val fuelWorkingCopyId = workingCopyId!!
        activity.finish()
        instrumentation.waitForIdleSync()
        activity = instrumentation.startActivitySync(
            Intent(activity.applicationContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        assertTrue("WebView restarts and restores navigation",
            support.await(activity, "!!document.querySelector('.bottom-navigation-item')", 30000))
        reactivateAdmin()
        support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Drive')n.click()})")
        assertTrue("Fuel launcher survives WebView recreation",
            support.await(activity, "!!document.querySelector('.fuel-entry-toggle')", 15000))
        support.eval(activity, "document.querySelector('.fuel-entry-toggle')?.click()")
        assertTrue("Fuel draft is recovered into the rendered form after WebView recreation",
            support.await(activity, """(()=>{const p=document.querySelector('.fuel-entry-panel');if(!p)return false;const labels=[...p.querySelectorAll('label')];const value=t=>labels.find(l=>l.textContent.trim().startsWith(t))?.querySelector('input,select')?.value;return value('Vehicle')==='$vehicleRecordId'&&value('Odometer (km)')==='55123'&&value('Price per kg')==='82.5'&&value('Amount paid')==='825'})()""", 15000))
        val recoveredDraft = db.records().get(fuelWorkingCopyId)
        assertNotNull("Recovered draft remains durable in Room", recoveredDraft)
        assertEquals("Interruption did not submit the Fuel draft", "in_progress",
            JSONObject(recoveredDraft!!.json).getJSONObject("data").getString("status"))
        support.eval(activity, "window.Capacitor?.Plugins?.RoomStore?.armWorkingCopyCompletionFailure?.().then(()=>window.__stage3RoomFailureArmed=true)")
        assertTrue("Debug Room fault injector is armed through the native WebView bridge",
            support.await(activity, "window.__stage3RoomFailureArmed===true", 10000))
        support.click(activity, "Submit fuel purchase")
        val interruptedDeadline = SystemClock.uptimeMillis() + 20000
        var pendingCopy: JSONObject? = null
        while (SystemClock.uptimeMillis() < interruptedDeadline) {
            val row = db.records().get(fuelWorkingCopyId)
            if (row != null) {
                val data = JSONObject(row.json).getJSONObject("data")
                if (data.optString("status") == "pending") {
                    pendingCopy = data
                    break
                }
            }
            SystemClock.sleep(100)
        }
        assertNotNull("Injected failure occurs after durable pending intent is written", pendingCopy)
        var beforeRetry = db.records().list().filter { row ->
            row.id.startsWith("feature:business-expenses:fuel:") &&
                JSONObject(row.json).getJSONObject("data").optInt("odometerKm") == 55123
        }
        val commitDeadline = SystemClock.uptimeMillis() + 15000
        while (beforeRetry.isEmpty() && SystemClock.uptimeMillis() < commitDeadline) {
            SystemClock.sleep(100)
            beforeRetry = db.records().list().filter { row ->
                row.id.startsWith("feature:business-expenses:fuel:") &&
                    JSONObject(row.json).getJSONObject("data").optInt("odometerKm") == 55123
            }
        }
        assertEquals("Fuel record commits before retry", 1, beforeRetry.size)
        val original = beforeRetry.single()
        val originalCreatedAt = JSONObject(original.json).getString("createdAt")
        val receiptCount = db.records().list().count { row ->
            row.id.startsWith("__sam_travels_feature_operation__:") &&
                JSONObject(row.json).getJSONObject("data").optString("targetRecordId") == original.id
        }
        assertEquals("Fuel record and operation receipt committed atomically before interruption", 1, receiptCount)
        activity.finish()
        instrumentation.waitForIdleSync()
        activity = instrumentation.startActivitySync(
            Intent(activity.applicationContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        assertTrue("WebView restarts after the post-commit interruption",
            support.await(activity, "!!document.querySelector('.bottom-navigation-item')", 30000))
        reactivateAdmin()
        support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Drive')n.click()})")
        assertTrue("Fuel launcher is available for pending submission recovery",
            support.await(activity, "!!document.querySelector('.fuel-entry-toggle')", 15000))
        support.eval(activity, "document.querySelector('.fuel-entry-toggle')?.click()")
        assertTrue("Pending Fuel intent is recovered with its original values",
            support.await(activity, """(()=>{const p=document.querySelector('.fuel-entry-panel');if(!p)return false;const labels=[...p.querySelectorAll('label')];const value=t=>labels.find(l=>l.textContent.trim().startsWith(t))?.querySelector('input,select')?.value;return value('Vehicle')==='$vehicleRecordId'&&value('Odometer (km)')==='55123'&&value('Price per kg')==='82.5'&&value('Amount paid')==='825'&&p.textContent.includes('Draft · pending')})()""", 15000))
        support.click(activity, "Submit fuel purchase")
        assertTrue("Pending Fuel operation replays the original Room receipt",
            support.await(activity, "document.body.innerText.includes('Fuel purchase saved.')", 20000))
        val afterRetry = db.records().list().filter { row ->
            row.id.startsWith("feature:business-expenses:fuel:") &&
                JSONObject(row.json).getJSONObject("data").optInt("odometerKm") == 55123
        }
        assertEquals("Post-commit retry leaves exactly one Fuel purchase", 1, afterRetry.size)
        assertEquals("Retry returns the exact original record envelope", original.json, afterRetry.single().json)
        val fuelRecordId = afterRetry.single().id
        val receiptsAfter = db.records().list().count { row ->
            row.id.startsWith("__sam_travels_feature_operation__:") &&
                JSONObject(row.json).getJSONObject("data").optString("targetRecordId") == fuelRecordId
        }
        assertEquals("Post-commit retry leaves exactly one operation receipt", receiptCount, receiptsAfter)
        assertEquals("First-submit timestamp is preserved across Room replay", originalCreatedAt,
            JSONObject(afterRetry.single().json).getString("createdAt"))
        assertEquals("Working copy completes after successful replay", "submitted",
            JSONObject(db.records().get(fuelWorkingCopyId)!!.json).getJSONObject("data").getString("status"))
        support.eval(activity, "document.querySelectorAll('.bottom-navigation-item').forEach(n=>{if(n.textContent.trim()==='Admin')n.click()})")
        assertTrue("Admin remains available after recovered Fuel submission",
            support.await(activity, "!!document.querySelector('.admin-replacement-shell')", 15000))
        return activity to fuelRecordId
    }
}
