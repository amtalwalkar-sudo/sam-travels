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
    ): MainActivity {
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
                row.id.startsWith("__sam_travels_form_working_copy__:admin.platform-fee:") &&
                    JSONObject(row.json).getJSONObject("data").optString("status") == "pending"
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
        support.eval(activity, "document.getElementById('admin-section-trigger-finance')?.click()")
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
        return activity
    }

}
