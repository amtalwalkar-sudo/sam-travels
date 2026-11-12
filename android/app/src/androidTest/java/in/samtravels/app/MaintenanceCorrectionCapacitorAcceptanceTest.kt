package `in`.samtravels.app
import android.content.Intent
import android.os.SystemClock
import android.webkit.WebView
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
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
      val previousSelectedDriver = database.records().get("work:selected-driver")
      val vehicleId = "feature:vehicle:MH01AB1234"
      val expenseId = "feature:maintenance:expense:$suffix"
      val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(expenseId, "UTF-8")
      val correctionPrefix = "historical-correction:"
      val now = Instant.now().toString()
      val vehicle = envelope(vehicleId, now, JSONObject()
        .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
        .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
        .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
        .put("ownership", "Owned").put("lifecycleState", "active"))
      val otherExpenseId = expenseId.dropLast(36) + UUID.randomUUID()
      val expense = envelope(expenseId, now, JSONObject()
        .put("schemaVersion", 1).put("kind", "expense").put("vehicleId", vehicleId)
        .put("expenseDate", "2026-10-10").put("expenseName", "Acceptance tyre repair")
        .put("description", "Acceptance receipt").put("amountPaise", 10000L),
        JSONObject().put("personId", "person-driver-one").put("role", "driver"))
      val otherExpense = envelope(otherExpenseId, now, JSONObject()
        .put("schemaVersion", 1).put("kind", "expense").put("vehicleId", vehicleId)
        .put("expenseDate", "2026-10-11").put("expenseName", "Other Driver tyre repair")
        .put("description", "Other Driver receipt").put("amountPaise", 20000L),
        JSONObject().put("personId", "person-driver-two").put("role", "driver"))
      val activity = instrumentation.startActivitySync(
        Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      ) as MainActivity
      try {
        database.records().put(vehicle)
        database.records().put(expense)
        database.records().put(otherExpense)
        DriverWorkflowIdentityTestFixtures.seed(database, "driver-one", "person-driver-one")
        DriverWorkflowIdentityTestFixtures.seedLink(database, "driver-two", "person-driver-two")
        listOf("person-driver-one" to "Driver One", "person-driver-two" to "Driver Two").forEach { (personId, name) ->
            val row = database.records().get("identity:person:$personId")!!
            val payload = JSONObject(row.json)
            payload.getJSONObject("data").put("displayName", name)
            database.records().put(StoredRecord(row.id, payload.toString(), row.schemaVersion, row.updatedAt))
        }
        assertTrue("Capacitor WebView should finish loading the Drive workspace",
            awaitJavascript(activity, "document.querySelector('.driver-card') !== null", 30_000))
        assertTrue("Admin navigation should be available", awaitJavascript(activity,
            "Array.from(document.querySelectorAll('.bottom-navigation-item')).some(node => node.textContent.trim() === 'Admin')",
            10_000))
        evaluate(activity, "Array.from(document.querySelectorAll('.bottom-navigation-item')).find(node => node.textContent.trim() === 'Admin')?.click()")
        assertTrue("Admin workspace should render", awaitJavascript(activity,
            "document.querySelector('.admin-workspace') !== null", 15_000))
        assertTrue("Person name field should render", awaitJavascript(activity,
            "Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Person name'))", 10_000))
        assertTrue("Admin role checkbox should be selectable", evaluate(activity, """
            (() => {
              const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Admin role'));
              const input = label?.querySelector('input[type=checkbox]');
              if (!input) return false;
              input.click();
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
        assertTrue("Admin activation fields and the asynchronously refreshed enrolled person must be available", awaitJavascript(activity, """
            Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Select person') &&
              Array.from(node.querySelectorAll('select option')).some(option => option.textContent.trim() === 'Correction Admin')) &&
            Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Active role'))
        """, 15_000))
        assertTrue("Admin identity should activate with the configured PIN", evaluate(activity, """
            (() => {
              const personLabel = Array.from(document.querySelectorAll('label')).find(node => node.querySelector('select') && node.textContent.includes('Select person'));
              const person = personLabel?.querySelector('select');
              const roleLabel = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Active role'));
              const role = roleLabel?.querySelector('select');
              if (!person || !role) return false;
              const setSelect = (select, value) => {
                const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
                setter.call(select, value);
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
              };
              setSelect(person, Array.from(person.options).find(option => option.textContent.trim() === 'Correction Admin')?.value ?? '');
              setSelect(role, 'admin');
              return true;
            })()
        """))
        assertTrue("Admin PIN input should appear after choosing the Admin role", awaitJavascript(activity,
            "Array.from(document.querySelectorAll('label')).some(node => node.textContent.trim() === 'Admin PIN')",
            5_000))
        assertTrue("Admin PIN and selected identity must be ready before activation", evaluate(activity, """
            (() => {
              const person = Array.from(document.querySelectorAll('label')).find(node => node.querySelector('select') && node.textContent.includes('Select person'))?.querySelector('select');
              const role = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Active role'))?.querySelector('select');
              const pinLabel = Array.from(document.querySelectorAll('label')).find(node => node.textContent.trim() === 'Admin PIN');
              const pin = pinLabel?.querySelector('input');
              if (!person?.value || role?.value !== 'admin' || !pin) return false;
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setter.call(pin, '4831');
              pin.dispatchEvent(new Event('input', { bubbles: true }));
              const form = pinLabel.closest('form');
              const submit = form?.querySelector('button[type=submit], button:not([type])');
              if (!form || !submit || submit.disabled) return false;
              form.requestSubmit(submit);
              return true;
            })()
        """))
        assertTrue("PIN-verified Admin session should activate; status: " + evaluateText(activity,
            """document.querySelector('[role=status]')?.textContent ?? 'no status'"""), awaitJavascript(activity,
            "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 15_000))
        evaluate(activity, "Array.from(document.querySelectorAll('.admin-section-trigger')).find(node => node.textContent.includes('Maintenance'))?.click()")
        assertTrue("Seeded Maintenance expense should load", awaitJavascript(activity,
            "document.body.textContent.includes('Acceptance tyre repair')", 15_000))
        evaluate(activity, """
            (() => {
              const record = Array.from(document.querySelectorAll('.loan-schedule article.admin-capability-record')).find(node => node.textContent.includes('Acceptance tyre repair'));
              record?.querySelector('button')?.click();
              return Boolean(record);
            })()
        """)
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
        evaluate(activity, """
            (() => {
              const button = Array.from(document.querySelectorAll('button')).find(node => node.textContent.includes('Append correction'));
              if (!button) return false;
              button.click();
              button.click();
              return true;
            })()
        """)
        assertTrue("Live correction should be acknowledged by the rendered form", awaitJavascript(activity,
            "document.body.textContent.includes('Correction appended')", 15_000))
        val original = JSONObject(database.records().get(expenseId)!!.json)
        val correctionRows = database.records().list().filter { it.id.startsWith(correctionPrefix) }
            .map { JSONObject(it.json) }.filter { it.optJSONObject("data")?.optString("targetRecordId") == expenseId }
        assertEquals("The original expense must remain unchanged", 10000L,
            original.getJSONObject("data").getLong("amountPaise"))
        assertEquals("Exactly one correction must be appended; stored IDs: ${database.records().list().map { it.id }}", 1, correctionRows.size)
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
        assertTrue("Driver One can be selected", evaluate(activity, """
            (() => {
              const personLabel = Array.from(document.querySelectorAll('label')).find(node => node.querySelector('select') && node.textContent.includes('Select person'));
              const person = personLabel?.querySelector('select');
              const roleLabel = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Active role'));
              const role = roleLabel?.querySelector('select');
              if (!person || !role) return false;
              const setSelect = (select, value) => {
                const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
                setter.call(select, value);
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
              };
              setSelect(person, Array.from(person.options).find(option => option.textContent.trim() === 'Driver One')?.value ?? '');
              setSelect(role, 'driver');
              return Boolean(person.value);
            })()
        """))
        evaluate(activity, "Array.from(document.querySelectorAll('form button')).find(node => node.textContent.includes('Activate role'))?.click()")
        assertTrue("Driver One role should activate", awaitJavascript(activity,
            "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 10_000))
        assertTrue("Own Maintenance record should be available", awaitJavascript(activity,
            "Array.from(document.querySelectorAll('.admin-capability-record')).some(node => node.textContent.includes('Acceptance tyre repair'))", 10_000))
        assertTrue("Driver self-correction form should open", evaluate(activity, """
            (() => {
              const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Acceptance tyre repair'));
              card?.querySelector('button')?.click();
              return Boolean(card);
            })()
        """))
        assertTrue("Driver self-correction should be submitted", evaluate(activity, """
            (() => {
              const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Acceptance tyre repair'));
              const set = (labelText, value) => {
                const label = Array.from(card?.querySelectorAll('label') ?? []).find(node => node.textContent.includes(labelText));
                const input = label?.querySelector('input');
                if (!input) return false;
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              };
              if (!set('Corrected amount', '160.00') || !set('Reason for correction', 'Driver One verified own receipt')) return false;
              Array.from(card.querySelectorAll('button')).find(node => node.textContent.includes('Append correction'))?.click();
              return true;
            })()
        """))
        assertTrue("Driver self-correction should append", awaitJavascript(activity,
            "Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Acceptance tyre repair'))?.textContent.includes('Correction appended')", 15_000))
        assertTrue("Other Driver record should be available", awaitJavascript(activity,
            "Array.from(document.querySelectorAll('.admin-capability-record')).some(node => node.textContent.includes('Other Driver tyre repair'))", 10_000))
        assertTrue("Other Driver correction form should open", evaluate(activity, """
            (() => {
              const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Other Driver tyre repair'));
              card?.querySelector('button')?.click();
              return Boolean(card);
            })()
        """))
        assertTrue("Another Driver's correction attempt should reach the live form", evaluate(activity, """
            (() => {
              const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Other Driver tyre repair'));
              const set = (labelText, value) => {
                const label = Array.from(card?.querySelectorAll('label') ?? []).find(node => node.textContent.includes(labelText));
                const input = label?.querySelector('input');
                if (!input) return false;
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              };
              if (!set('Corrected amount', '210.00') || !set('Reason for correction', 'Attempt to alter another Driver record')) return false;
              Array.from(card.querySelectorAll('button')).find(node => node.textContent.includes('Append correction'))?.click();
              return true;
            })()
        """))
        assertTrue("Another Driver's record must be rejected in the live UI", awaitJavascript(activity,
            "Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Other Driver tyre repair'))?.textContent.includes('historical_correction_forbidden')", 15_000))
        val driverOneChain = database.records().list().filter { it.id.startsWith(correctionPrefix) }
            .map { JSONObject(it.json).getJSONObject("data") }
            .filter { it.optString("targetRecordId") == expenseId }
            .sortedBy { it.getInt("chainRevision") }
        assertEquals("Admin append plus Driver self-correction should form a two-entry chain", 2, driverOneChain.size)
        assertEquals("person-driver-one", driverOneChain.last().getJSONObject("actor").getString("actorId"))
        assertEquals("Driver One verified own receipt", driverOneChain.last().getString("reason"))
        assertEquals("Other Driver must receive no correction row", 0, database.records().list()
            .filter { it.id.startsWith(correctionPrefix) }
            .count { runCatching { JSONObject(it.json).getJSONObject("data").optString("targetRecordId") == otherExpenseId }.getOrDefault(false) })
        val backup = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
        NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
        assertEquals("Restore must begin from an empty business-record set", 0, database.records().list()
            .count { it.id == expenseId || it.id == otherExpenseId || it.id == chainId })
        NativeBackupCoverage.replaceBusinessRecords(database, backup)
        val restoredOriginal = JSONObject(database.records().get(expenseId)!!.json)
        assertEquals("Recovery must preserve the immutable original amount", 10000L,
            restoredOriginal.getJSONObject("data").getLong("amountPaise"))
        val restoredCorrections = database.records().list().filter { it.id.startsWith(correctionPrefix) }
            .map { JSONObject(it.json).getJSONObject("data") }
            .filter { it.optString("targetRecordId") == expenseId }
            .sortedBy { it.getInt("chainRevision") }
        assertEquals(2, restoredCorrections.size)
        assertEquals(driverOneChain.last().getString("correctionId"), restoredCorrections.last().getString("correctionId"))
        val restoredHead = JSONObject(database.records().get(chainId)!!.json).getJSONObject("data")
        assertEquals(2, restoredHead.getInt("chainRevision"))
        assertEquals(restoredCorrections.last().getString("correctionId"), restoredHead.getString("headCorrectionId"))
      } finally {
        database.records().remove(expenseId)
        database.records().remove(otherExpenseId)
        database.records().remove(vehicleId)
        database.records().remove(chainId)
        listOf("identity:driver-person-link:driver-one", "identity:driver-person-link:driver-two",
            "feature:driver-records:driver:driver-one", "feature:driver-records:driver:driver-two").forEach { database.records().remove(it) }
        listOf("person-driver-one", "person-driver-two").forEach { database.records().remove("identity:person:$it") }
        if (previousSelectedDriver != null) database.records().put(previousSelectedDriver)
        else database.records().remove("work:selected-driver")
        database.records().list().filter { it.id.startsWith(correctionPrefix) }
            .filter { runCatching { val target = JSONObject(it.json).getJSONObject("data").optString("targetRecordId"); target == expenseId || target == otherExpenseId }.getOrDefault(false) }
            .forEach { database.records().remove(it.id) }
        database.records().list().filter { it.id.startsWith("identity:person:") }
            .filter { runCatching { JSONObject(it.json).getJSONObject("data").optString("displayName") in setOf("Correction Admin", "Driver One", "Driver Two") }.getOrDefault(false) }
            .forEach { database.records().remove(it.id) }
        runCatching { SecureCredentialVault(app).remove("sam-travels-admin-pin-v1") }
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
  private fun evaluateText(activity: MainActivity, script: String): String {
      val instrumentation = InstrumentationRegistry.getInstrumentation()
      val result = AtomicReference<String?>()
      val latch = CountDownLatch(1)
      instrumentation.runOnMainSync {
        activity.getBridge().getWebView().evaluateJavascript(script) {
            result.set(it)
            latch.countDown()
        }
      }
      if (!latch.await(5, TimeUnit.SECONDS)) return "javascript_timeout"
      return try { org.json.JSONTokener(result.get() ?: "null").nextValue()?.toString() ?: "null" }
        catch (_: Exception) { result.get() ?: "null" }
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
