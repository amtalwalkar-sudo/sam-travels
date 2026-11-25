package `in`.samtravels.app

import android.content.Intent
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class ComplianceCorrectionCapacitorAcceptanceTest {
  @Test
  fun adminComplianceCorrectionRefreshesRoomDailyCostAndSurvivesBackupRestore() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val app = instrumentation.targetContext.applicationContext
    val database = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
      .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
      .enableMultiInstanceInvalidation().allowMainThreadQueries().build()
    val suffix = UUID.randomUUID().toString()
    val vehicleId = "feature:vehicle:MH01AB1234"
    val complianceId = "feature:compliance:$suffix"
    val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(complianceId, "UTF-8")
    val previousSelectedDriver = database.records().get("work:selected-driver")
    val previousVehicles = database.records().list().filter { it.id.startsWith("feature:vehicle:") }
    val previousCompliance = database.records().list().filter { it.id.startsWith("feature:compliance:") }
    val previousAssignments = database.records().list().filter { it.id.startsWith("feature:driver-records:assignment:") }
    val now = Instant.now().toString()
    val today = LocalDate.now(ZoneId.of("Asia/Kolkata"))
    val validFrom = today.toString()
    val validTo = today.plusDays(364).toString()
    val vehicle = maintenanceEnvelope(vehicleId, now, JSONObject()
      .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
      .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
      .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
      .put("ownership", "Owned").put("lifecycleState", "active"))
    val compliance = maintenanceEnvelope(complianceId, now, JSONObject()
      .put("schemaVersion", 1).put("vehicleId", vehicleId).put("complianceName", "Acceptance insurance")
      .put("validFrom", validFrom).put("validTo", validTo).put("totalCostPaise", 36500L),
      JSONObject().put("personId", "person-driver-one").put("role", "admin"))
    var activity: MainActivity? = null
    try {
      previousAssignments.forEach { database.records().remove(it.id) }
      previousCompliance.forEach { database.records().remove(it.id) }
      previousVehicles.forEach { database.records().remove(it.id) }
      database.records().put(vehicle)
      database.records().put(compliance)
      DriverWorkflowIdentityTestFixtures.seed(database, "driver-one", "person-driver-one")
      DriverWorkflowIdentityTestFixtures.seedLink(database, "driver-one", "person-driver-one")
      NativeStartupRecovery.invalidate(database)
      activity = instrumentation.startActivitySync(
        Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      ) as MainActivity
      val page = activity!!
      assertTrue("Work ready", awaitMaintenanceJavascript(page, "document.querySelector('.driver-card') !== null", 30_000))
      assertTrue("Admin navigation", awaitMaintenanceJavascript(page,
        "Array.from(document.querySelectorAll('.bottom-navigation-item')).some(node => node.textContent.trim() === 'Admin')", 10_000))
      evaluateMaintenanceWebView(page, "Array.from(document.querySelectorAll('.bottom-navigation-item')).find(node => node.textContent.trim() === 'Admin')?.click()")
      assertTrue("Admin ready", awaitMaintenanceJavascript(page, "document.querySelector('.admin-replacement-shell') !== null", 15_000))
      assertTrue("Admin identity fields", awaitMaintenanceJavascript(page,
        "Array.from(document.querySelectorAll('label')).some(node => node.textContent.includes('Person name'))", 10_000))
      assertTrue("Admin role checkbox", evaluateMaintenanceWebView(page, """
        (() => { const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Admin role')); const input = label?.querySelector('input[type=checkbox]'); if (!input) return false; input.click(); return true; })()
      """))
      assertTrue("Enroll admin fields", evaluateMaintenanceWebView(page, """
        (() => { const set = (name, value) => { const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes(name)); const input = label?.querySelector('input'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); return true; }; return set('Person name', 'Compliance Acceptance Admin') && set('Set initial Admin PIN', '4831'); })()
      """))
      evaluateMaintenanceWebView(page, "Array.from(document.querySelectorAll('form button')).find(node => node.textContent.includes('Enroll person'))?.click()")
      assertTrue("Admin enrolled", awaitMaintenanceJavascript(page, "document.querySelector('[role=status]')?.textContent.includes('Person enrolled')", 15_000))
      assertTrue("Admin activation selection", evaluateMaintenanceWebView(page, """
        (() => { const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Select person')); const select = label?.querySelector('select'); if (!select) return false; const option = Array.from(select.options).find(item => item.textContent.trim() === 'Compliance Acceptance Admin'); if (!option) return false; select.value = option.value; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); const roleLabel = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Active role')); const role = roleLabel?.querySelector('select'); if (!role) return false; role.value = 'admin'; role.dispatchEvent(new Event('change', { bubbles: true })); return true; })()
      """))
      assertTrue("Admin PIN field", awaitMaintenanceJavascript(page,
        "Array.from(document.querySelectorAll('label')).some(node => node.textContent.trim() === 'Admin PIN')", 5_000))
      assertTrue("Activate admin", evaluateMaintenanceWebView(page, """
        (() => { const label = Array.from(document.querySelectorAll('label')).find(node => node.textContent.trim() === 'Admin PIN'); const input = label?.querySelector('input'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '4831'); input.dispatchEvent(new Event('input', { bubbles: true })); label.closest('form')?.querySelector('button')?.click(); return true; })()
      """))
      assertTrue("Admin active", awaitMaintenanceJavascript(page, "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 15_000))
      evaluateMaintenanceWebView(page, "document.getElementById('admin-section-trigger-compliance')?.click()")
      assertTrue("Compliance overview", awaitMaintenanceJavascript(page, "document.querySelector('.compliance-fleet-overview') !== null", 15_000))
      assertTrue("Compliance record", awaitMaintenanceJavascript(page,
        "Array.from(document.querySelectorAll('.admin-capability-record')).some(node => node.textContent.includes('Acceptance insurance'))", 10_000))
      assertTrue("Correction editor", evaluateMaintenanceWebView(page, """
        (() => { const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Acceptance insurance')); const button = Array.from(card?.querySelectorAll('button') ?? []).find(node => node.textContent.includes('Correct details / history')); button?.click(); return Boolean(button); })()
      """))
      assertTrue("Correction input", evaluateMaintenanceWebView(page, """
        (() => { const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Acceptance insurance')); const selectLabel = Array.from(card?.querySelectorAll('label') ?? []).find(node => node.textContent.includes('Field to correct')); const select = selectLabel?.querySelector('select'); if (!select) return false; select.value = 'totalCostPaise'; select.dispatchEvent(new Event('change', { bubbles: true })); const amountLabel = Array.from(card.querySelectorAll('label')).find(node => node.textContent.includes('Corrected total cost')); const amount = amountLabel?.querySelector('input'); const reasonLabel = Array.from(card.querySelectorAll('label')).find(node => node.textContent.includes('Reason for correction')); const reason = reasonLabel?.querySelector('textarea'); if (!amount || !reason) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(amount, '730.00'); amount.dispatchEvent(new Event('input', { bubbles: true })); const textSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; textSetter.call(reason, 'Final premium verified against insurer receipt'); reason.dispatchEvent(new Event('input', { bubbles: true })); return true; })()
      """))
      evaluateMaintenanceWebView(page, """
        (() => { const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Acceptance insurance')); card?.querySelector('button.admin-primary')?.click(); return true; })()
      """)
      assertTrue("Corrected daily cost refreshed", awaitMaintenanceJavascript(page,
        "Array.from(document.querySelectorAll('.compliance-daily-cost')).some(node => node.textContent.includes('73000 ÷ 365 paise'))", 15_000))
      val original = JSONObject(database.records().get(complianceId)!!.json).getJSONObject("data")
      assertEquals("Original Compliance premium remains immutable", 36500L, original.getLong("totalCostPaise"))
      val corrections = database.records().list().filter { it.id.startsWith("historical-correction:") }
        .map { JSONObject(it.json).getJSONObject("data") }
        .filter { it.optString("targetRecordId") == complianceId }
      assertEquals("One correction", 1, corrections.size)
      assertEquals("totalCostPaise", corrections.single().getString("fieldPath"))
      assertEquals(36500L, corrections.single().getLong("beforeValue"))
      assertEquals(73000L, corrections.single().getLong("afterValue"))
      assertEquals("admin", corrections.single().getJSONObject("actor").getString("role"))
      val head = JSONObject(database.records().get(chainId)!!.json).getJSONObject("data")
      assertEquals(1, head.getInt("chainRevision"))
      assertEquals(corrections.single().getString("correctionId"), head.getString("headCorrectionId"))
      val backup = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
      NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
      NativeBackupCoverage.replaceBusinessRecords(database, backup)
      assertEquals(36500L, JSONObject(database.records().get(complianceId)!!.json).getJSONObject("data").getLong("totalCostPaise"))
      assertEquals(73000L, JSONObject(database.records().get(corrections.single().getString("id"))!!.json)
        .getJSONObject("data").getLong("afterValue"))
    } finally {
      database.records().remove(complianceId)
      database.records().remove(chainId)
      database.records().list().filter { it.id.startsWith("historical-correction:") }
        .filter { runCatching { JSONObject(it.json).getJSONObject("data").optString("targetRecordId") == complianceId }.getOrDefault(false) }
        .forEach { database.records().remove(it.id) }
      previousCompliance.forEach { database.records().put(it) }
      database.records().remove(vehicleId)
      previousVehicles.forEach { database.records().put(it) }
      previousAssignments.forEach { database.records().put(it) }
      listOf("identity:driver-person-link:driver-one", "feature:driver-records:driver:driver-one")
        .forEach { database.records().remove(it) }
      database.records().remove("identity:person:person-driver-one")
      database.records().list().filter { it.id.startsWith("identity:person:") }
        .filter { runCatching { JSONObject(it.json).getJSONObject("data").optString("displayName") == "Compliance Acceptance Admin" }.getOrDefault(false) }
        .forEach { database.records().remove(it.id) }
      if (previousSelectedDriver != null) database.records().put(previousSelectedDriver)
      else database.records().remove("work:selected-driver")
      runCatching { SecureCredentialVault(app).remove("sam-travels-admin-pin-v1") }
      NativeStartupRecovery.invalidate(database)
      activity?.let { instrumentation.runOnMainSync { it.finish() } }
      database.close()
    }
  }
}
