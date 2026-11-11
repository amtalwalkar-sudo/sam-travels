package `in`.samtravels.app

import android.content.Intent
import android.os.SystemClock
import android.webkit.WebView
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Drives the rendered Admin Maintenance correction form in the installed
 * Capacitor WebView and verifies its authenticated write reaches Room.
 */
@RunWith(AndroidJUnit4::class)
class MaintenanceCorrectionCapacitorAcceptanceTest {
    @Test
    fun adminMaintenanceCorrectionUsesLiveCapacitorRepositoryAndPreservesOriginal() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext.applicationContext
        val database = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation()
            .allowMainThreadQueries()
            .build()
        val suffix = UUID.randomUUID().toString()
        val vehicleId = "feature:vehicle:MH01AB1234"
        val expenseId = "feature:maintenance:expense:$suffix"
        val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(expenseId, "UTF-8")
        val correctionPrefix = "historical-correction:"
        val now = Instant.now().toString()
        val adminPin = "4831"
        val vehicle = envelope(vehicleId, now, JSONObject()
            .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
            .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
            .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
            .put("ownership", "Owned").put("lifecycleState", "active"))
        val expense = envelope(expenseId, now, JSONObject()
            .put("schemaVersion", 1).put("kind", "expense").put("vehicleId", vehicleId)
            .put("expenseDate", "2026-10-10").put("expenseName", "Acceptance tyre repair")
            .put("description", "Acceptance receipt").put("amountPaise", 10000L),
            JSONObject().put("personId", "driver-owner").put("role", "driver"))
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity

        try {
            database.records().put(vehicle)
            database.records().put(expense)
            assertTrue("Capacitor WebView should finish loading the Drive workspace",
                awaitJavascript(activity, "document.querySelector('.driver-card') !== null", 30_000))

            assertTrue("Admin navigation should be available", awaitJavascript(activity,
                "Array.from(document.querySelectorAll('.bottom-navigation-item')).some(node => node.textContent.trim() === 'Admin')",
                10_000))
            evaluate(activity, "Array.from(document.querySelectorAll('.bottom-navigation-item')).find(node => node.textContent.trim() === 'Admin')?.click()")
            assertTrue("Admin workspace should render", awaitJavascript(activity,
                "document.querySelector('.admin-workspace') !== null", 15_000))

            // Enrol the first PIN-verified Admin through the real identity panel.
            assertTrue("Person name field should render", awaitJavascript(activity,
                "Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Person name'))", 10_000))
            assertTrue("Admin role checkbox should be selectable", evaluate(activity, """
                (() => {
                  const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Admin role'));
                  const input = label?.querySelector('input[type=checkbox]');
                  if (!input) return false;
                  input.checked = true;
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                })()
            """))
            assertTrue("Initial Admin PIN field should appear", awaitJavascript(activity,
                "Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Set initial Admin PIN'))",
                5_000))
            assertTrue("Enrollment fields should accept values", evaluate(activity, """
                (() => {
                  const set = (labelText, value) => {
                    const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes(labelText));
                    const input = label?.querySelector('input');
                    if (!input) return false;
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    setter.call(input, value);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                  };
                  return set('Person name', 'Correction Admin') && set('Set initial Admin PIN', '4831');
                })()
            """))
            evaluate(activity, "Array.from(document.querySelectorAll('form button[type=submit], form button:not([type])')).find(node => node.textContent.includes('Enroll person'))?.click()")
            assertTrue("Person enrollment should complete", awaitJavascript(activity,
                "document.querySelector('[role=status]')?.textContent.includes('Person enrolled')", 15_000))

            assertTrue("Admin activation fields should be available", awaitJavascript(activity, """
                Array.from(document.querySelectorAll('label')).some(node => node.textContent.trim().startsWith('Person')) &&
                Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Active role'))
            """, 10_000))
            assertTrue("Admin identity should activate with the configured PIN", evaluate(activity, """
                (() => {
                  const personLabel = Array.from(document.querySelectorAll('label')).find(node => node.textContent.trim() === 'Person');
                  const person = personLabel?.querySelector('select');
                  const roleLabel = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Active role'));
                  const role = roleLabel?.querySelector('select');
                  if (!person || person.options.length < 2 || !role) return false;
                  person.value = person.options[1].value;
                  person.dispatchEvent(new Event('change', { bubbles: true }));
                  role.value = 'admin';
                  role.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                })()
            """))
            assertTrue("Admin PIN input should appear after choosing the Admin role", awaitJavascript(activity,
                "Array.from(document.querySelectorAll('label')).some(node => node.textContent.trim() === 'Admin PIN')",
                5_000))
            assertTrue("Admin PIN should be accepted", evaluate(activity, """
                (() => {
                  const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.trim() === 'Admin PIN');
                  const pin = label?.querySelector('input');
                  if (!pin) return false;
                  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                  setter.call(pin, '4831');
                  pin.dispatchEvent(new Event('input', { bubbles: true }));
                  label.closest('form')?.querySelector('button')?.click();
                  return true;
                })()
            """))
            assertTrue("PIN-verified Admin session should activate", awaitJavascript(activity,
                "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 15_000))

            evaluate(activity, "Array.from(document.querySelectorAll('.admin-section-trigger')).find(node => node.textContent.includes('Maintenance'))?.click()")
            assertTrue("Seeded Maintenance expense should load", awaitJavascript(activity,
                "document.body.textContent.includes('Acceptance tyre repair')", 15_000))
            evaluate(activity, "Array.from(document.querySelectorAll('button')).find(node => node.textContent.includes('Correct amount / view history'))?.click()")
            assertTrue("Correction form should open", awaitJavascript(activity,
                "Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Corrected amount'))", 5_000))
            assertTrue("Correction values should be entered", evaluate(activity, """
                (() => {
                  const set = (labelText, value) => {
                    const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes(labelText));
                    const input = label?.querySelector('input');
                    if (!input) return false;
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    setter.call(input, value);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                  };
                  return set('Corrected amount', '150.00') && set('Reason for correction', 'Verified against original receipt');
                })()
            """))
            evaluate(activity, "Array.from(document.querySelectorAll('button')).find(node => node.textContent.includes('Append correction'))?.click()")
            assertTrue("Live correction should be acknowledged by the rendered form", awaitJavascript(activity,
                "document.body.textContent.includes('Correction appended')", 15_000))

            val original = JSONObject(database.records().get(expenseId)!!.json)
            val correctionRows = database.records().list().filter { it.id.startsWith(correctionPrefix) }
                .map { JSONObject(it.json) }.filter { it.optJSONObject("data")?.optString("targetRecordId") == expenseId }
            assertEquals("The original expense must remain unchanged", 10000L,
                original.getJSONObject("data").getLong("amountPaise"))
            assertEquals("Exactly one correction must be appended", 1, correctionRows.size)
            val correction = correctionRows.single().getJSONObject("data")
            assertEquals(10000L, correction.getLong("beforeValue"))
            assertEquals(15000L, correction.getLong("afterValue"))
            assertEquals("Verified against original receipt", correction.getString("reason"))
            assertEquals("admin", correction.getJSONObject("actor").getString("role"))
            assertEquals(1, correction.getInt("chainRevision"))
            val head = JSONObject(database.records().get(chainId)!!.json).getJSONObject("data")
            assertEquals(1, head.getInt("chainRevision"))
            assertEquals(correction.getString("correctionId"), head.getString("headCorrectionId"))
            assertNotNull("Correction record must be stored through the Room-backed repository",
                database.records().get(correctionRows.single().getString("id")))
        } finally {
            database.records().remove(expenseId)
            database.records().remove(vehicleId)
            database.records().remove(chainId)
            database.records().list().filter { it.id.startsWith(correctionPrefix) }
                .filter { runCatching { JSONObject(it.json).getJSONObject("data").optString("targetRecordId") == expenseId }.getOrDefault(false) }
                .forEach { database.records().remove(it.id) }
            instrumentation.runOnMainSync { activity.finish() }
            database.close()
        }
    }

    private fun envelope(
        id: String,
        timestamp: String,
        data: JSONObject,
        createdBy: JSONObject? = null,
    ): StoredRecord {
        val record = JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp).put("source", "android")
            .put("revision", 1).put("data", data)
        if (createdBy != null) record.put("createdBy", createdBy)
        return StoredRecord(id, record.toString(), 1, timestamp)
    }

    private fun evaluate(activity: MainActivity, script: String): Boolean {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        instrumentation.runOnMainSync {
            activity.getBridge().getWebView().evaluateJavascript(script) {
                result.set(it)
                latch.countDown()
            }
        }
        return latch.await(5, TimeUnit.SECONDS) && result.get() == "true"
    }

    private fun awaitJavascript(activity: MainActivity, expression: String, timeoutMs: Long): Boolean {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val webView: WebView = activity.getBridge().getWebView()
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < deadline) {
            val result = AtomicReference<String?>()
            val latch = CountDownLatch(1)
            instrumentation.runOnMainSync {
                webView.evaluateJavascript("Boolean($expression)") {
                    result.set(it)
                    latch.countDown()
                }
            }
            if (latch.await(2, TimeUnit.SECONDS) && result.get() == "true") return true
            SystemClock.sleep(100)
        }
        return false
    }
}
