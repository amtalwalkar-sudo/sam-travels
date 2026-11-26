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
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class FuelCorrectionCapacitorAcceptanceTest {
    @Test fun driverCorrectsFuelAmountThroughWebViewAndRoomReadModelsRefresh() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext.applicationContext
        val database = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation().allowMainThreadQueries().build()
        val suffix = UUID.randomUUID().toString()
        val vehicleId = "feature:vehicle:MH01AB1234"
        val fuelId = "feature:business-expenses:fuel:$suffix"
        val personId = "person-fuel-correction-$suffix"
        val driverId = "fuel-correction-$suffix"
        val previousSelectedDriver = database.records().get("work:selected-driver")
        val previousVehicleRecords = database.records().list().filter { it.id.startsWith("feature:vehicle:") }
        val previousAssignments = database.records().list().filter { it.id.startsWith("feature:driver-records:assignment:") }
        // The operating-context contract requires exactly one active Driver. Other
        // acceptance tests share the Room database and may leave their seeded driver
        // rows behind, so isolate this fixture rather than making the production
        // resolver silently choose among ambiguous active drivers.
        val previousDriverRecords = database.records().list().filter {
            it.id.startsWith("feature:driver-records:driver:")
        }
        val previousDriver = database.records().get("feature:driver-records:driver:$driverId")
        val previousLink = database.records().get("identity:driver-person-link:$driverId")
        val previousPerson = database.records().get("identity:person:$personId")
        val previousFuelRecords = database.records().list().filter { row ->
            row.id.startsWith("feature:business-expenses:fuel:") &&
                JSONObject(row.json).optJSONObject("data")?.optString("vehicleId") == vehicleId
        }
        val previousFuelDrafts = database.records().list().filter {
            it.id.startsWith("__sam_travels_form_working_copy__:work.fuel-entry:")
        }
        val now = "2026-11-15T05:00:00.000Z"
        var activity: MainActivity? = null
        try {
            previousAssignments.forEach { database.records().remove(it.id) }
            previousDriverRecords.forEach { database.records().remove(it.id) }
            previousVehicleRecords.forEach { database.records().remove(it.id) }
            previousFuelRecords.forEach { database.records().remove(it.id) }
            previousFuelDrafts.forEach { database.records().remove(it.id) }
            database.records().put(maintenanceEnvelope(vehicleId, now, JSONObject()
                .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
                .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
                .put("fuelType", "CNG").put("yearOfManufacture", 2022)
                .put("ownership", "Owned").put("lifecycleState", "active")))
            DriverWorkflowIdentityTestFixtures.seed(database, driverId, personId)
            // Fuel read models are scoped to the authoritative Driver–Vehicle pair. A selected
            // driver and active vehicle alone are not a valid operating context.
            val assignment = JSONObject().put("schemaVersion", 1).put("driverId", driverId)
                .put("assignments", JSONArray().put(JSONObject()
                    .put("assignmentId", "fuel-correction-assignment-$suffix")
                    .put("vehicleId", vehicleId).put("assignedAt", "2026-11-01T00:00:00.000Z")))
            database.records().put(maintenanceEnvelope(
                "feature:driver-records:assignment:$driverId", now, assignment,
            ))
            val fuelData = JSONObject().put("schemaVersion", 1).put("kind", "fuel_purchase")
                .put("id", fuelId).put("revision", 1).put("vehicleId", vehicleId)
                .put("odometerKm", 45000).put("pricePaisePerKg", 9000)
                .put("amountPaise", 18000).put("partialRefill", false)
                .put("occurredAt", now).put("businessDate", "2026-11-15")
            database.records().put(maintenanceEnvelope(fuelId, now, fuelData,
                JSONObject().put("personId", personId).put("role", "driver")))
            NativeStartupRecovery.invalidate(database)
            val startedActivity = instrumentation.startActivitySync(
                Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            ) as MainActivity
            activity = startedActivity
            assertTrue("Drive workspace loads", awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.driver-card') !== null", 30000))
            assertTrue("Admin navigation is available for driver role activation",
                awaitMaintenanceJavascript(startedActivity,
                    "[...document.querySelectorAll('.bottom-navigation-item')].some(n=>n.textContent.trim()==='Admin')", 10000))
            evaluateMaintenanceWebView(startedActivity,
                "[...document.querySelectorAll('.bottom-navigation-item')].find(n=>n.textContent.trim()==='Admin')?.click()")
            assertTrue("People and roles panel loads", awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.admin-replacement-shell')?.textContent.includes('People & roles')", 15000))
            // The panel heading renders before its asynchronous identity snapshot. Wait for the
            // seeded person option before setting the controlled React select; otherwise the
            // browser correctly normalizes a value with no matching option back to empty.
            assertTrue("Seeded driver identity option loads", awaitMaintenanceJavascript(startedActivity, """
                [...document.querySelectorAll('.admin-replacement-shell label')]
                  .find(n=>n.textContent.includes('Select person'))
                  ?.querySelector("select")?.querySelector("option[value='$personId']") !== null
            """, 15000))
            assertTrue("Seeded driver identity can be selected", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const labels = [...document.querySelectorAll('.admin-replacement-shell label')];
                  const person = labels.find(n=>n.textContent.includes('Select person'))?.querySelector('select');
                  const role = labels.find(n=>n.textContent.includes('Active role'))?.querySelector('select');
                  if (!person || !role) return false;
                  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(person,'$personId');
                  person.dispatchEvent(new Event('change',{bubbles:true}));
                  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,'driver');
                  role.dispatchEvent(new Event('change',{bubbles:true}));
                  return true;
                })()
            """))
            assertTrue("Driver role activation succeeds", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const button = [...document.querySelectorAll('.admin-replacement-shell button')]
                    .find(n=>n.textContent.includes('Activate role'));
                  if (!button || button.disabled) return false;
                  button.click();
                  return true;
                })()
            """))
            assertTrue("Driver actor is active", awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.admin-replacement-shell [role=status]')?.textContent.includes('Role activated')", 10000))
            evaluateMaintenanceWebView(startedActivity,
                "[...document.querySelectorAll('.bottom-navigation-item')].find(n=>n.textContent.trim()==='Drive')?.click()")
            assertTrue("Fuel entry launcher is visible", awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.fuel-entry-toggle') !== null", 10000))
            assertTrue("Fuel entry opens", evaluateMaintenanceWebView(startedActivity,
                "document.querySelector('.fuel-entry-toggle')?.click();true"))
            assertTrue("Existing fuel purchase is listed; rendered state=" + readMaintenanceWebViewText(startedActivity,
                "JSON.stringify({panel:document.querySelector('.fuel-entry-panel')?.innerText ?? null,body:document.body.innerText})"), awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.fuel-entry-panel')?.textContent.includes('45,000 km')", 15000))
            assertTrue("Correction action opens", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const card = [...document.querySelectorAll('.fuel-entry-panel article')]
                    .find(node => node.textContent.includes('45,000 km'));
                  const button = [...(card?.querySelectorAll('button') ?? [])]
                    .find(node => node.textContent.includes('Correct amount / price'));
                  button?.click();
                  return Boolean(button);
                })()
            """))
            assertTrue("Correction fields are rendered", awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.fuel-entry-panel label input[type=number]') !== null && " +
                    "[...document.querySelectorAll('.fuel-entry-panel label')].some(n=>n.textContent.includes('Reason for correction'))",
                10000))
            assertTrue("Correction values are entered", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const set = (labelText, value) => {
                    const label = [...document.querySelectorAll('.fuel-entry-panel label')]
                      .find(node => node.textContent.includes(labelText));
                    const input = label?.querySelector('input');
                    if (!input) return false;
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                  };
                  return set('Corrected value', '250.00') && set('Reason for correction', 'Room receipt verified');
                })()
            """))
            assertTrue("Correction submit is available", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const button = [...document.querySelectorAll('.fuel-entry-panel button')]
                    .find(node => node.textContent.includes('Append correction'));
                  if (!button || button.disabled) return false;
                  button.click();
                  return true;
                })()
            """))
            assertTrue("Correction is confirmed in WebView; rendered state=" + readMaintenanceWebViewText(startedActivity,
                "JSON.stringify({panel:document.querySelector('.fuel-entry-panel')?.innerText ?? null, body:document.body.innerText})"), awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.fuel-entry-panel')?.textContent.includes('Correction appended')", 45000))
            assertTrue("Corrected amount is immediately projected into the daily read model",
                awaitMaintenanceJavascript(startedActivity,
                    "document.querySelector('[aria-label=\"Fuel calculation readback\"]')?.textContent.includes('25000 paise')",
                    45000))
            assertTrue("Price correction action reopens", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const card = [...document.querySelectorAll('.fuel-entry-panel article')]
                    .find(node => node.textContent.includes('45,000 km'));
                  const button = [...(card?.querySelectorAll('button') ?? [])]
                    .find(node => node.textContent.includes('Correct amount / price'));
                  button?.click();
                  return Boolean(button);
                })()
            """))
            assertTrue("Price correction field is selected", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const label = [...document.querySelectorAll('.fuel-entry-panel label')]
                    .find(node => node.textContent.includes('Field to correct'));
                  const select = label?.querySelector('select');
                  if (!select) return false;
                  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'pricePaisePerKg');
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                })()
            """))
            assertTrue("Corrected price and reason are entered", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const set = (labelText, value) => {
                    const label = [...document.querySelectorAll('.fuel-entry-panel label')]
                      .find(node => node.textContent.includes(labelText));
                    const input = label?.querySelector('input');
                    if (!input) return false;
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                  };
                  return set('Corrected value', '100.00') && set('Reason for correction', 'Room unit price verified');
                })()
            """))
            assertTrue("Price correction submit is available", evaluateMaintenanceWebView(startedActivity, """
                (() => {
                  const button = [...document.querySelectorAll('.fuel-entry-panel button')]
                    .find(node => node.textContent.includes('Append correction'));
                  if (!button || button.disabled) return false;
                  button.click();
                  return true;
                })()
            """))
            assertTrue("Price correction is confirmed in WebView", awaitMaintenanceJavascript(startedActivity,
                "document.querySelector('.fuel-entry-panel')?.textContent.includes('Correction appended')", 20000))
            assertTrue("Corrected price is immediately visible in the Room-backed purchase list",
                awaitMaintenanceJavascript(startedActivity, """
                    [...document.querySelectorAll('.fuel-entry-panel article')]
                      .some(node => node.textContent.includes('Amount ₹250.00') &&
                        node.textContent.includes('Price ₹100.00/kg'))
                """, 15000))
            val original = JSONObject(database.records().get(fuelId)!!.json).getJSONObject("data")
            assertEquals("Original Room fuel amount remains immutable", 18000, original.getInt("amountPaise"))
            assertEquals("Original Room fuel price remains immutable", 9000, original.getInt("pricePaisePerKg"))
            val corrections = database.records().list().filter { row ->
                if (!row.id.startsWith("historical-correction:")) false
                else JSONObject(row.json).getJSONObject("data").optString("targetRecordId") == fuelId
            }
            assertEquals("Amount and price corrections append independently in Room", 2, corrections.size)
            val correctionValues = corrections.associate { row ->
                val data = JSONObject(row.json).getJSONObject("data")
                data.getString("fieldPath") to data.getInt("afterValue")
            }
            assertEquals(mapOf("amountPaise" to 25000, "pricePaisePerKg" to 10000), correctionValues)
            assertTrue("Corrected amount remains projected after price correction",
                awaitMaintenanceJavascript(startedActivity,
                    "document.querySelector('[aria-label=\"Fuel calculation readback\"]')?.textContent.includes('25000 paise')",
                    45000))
            val amountCorrection = corrections.map { JSONObject(it.json).getJSONObject("data") }
                .first { it.getString("fieldPath") == "amountPaise" }
            assertEquals(18000, amountCorrection.getInt("beforeValue"))
            assertEquals("Room receipt verified", amountCorrection.getString("reason"))
            assertEquals("driver", amountCorrection.getJSONObject("actor").getString("role"))
            val priceCorrection = corrections.map { JSONObject(it.json).getJSONObject("data") }
                .first { it.getString("fieldPath") == "pricePaisePerKg" }
            assertEquals(9000, priceCorrection.getInt("beforeValue"))
            assertEquals("Room unit price verified", priceCorrection.getString("reason"))
            assertEquals("driver", priceCorrection.getJSONObject("actor").getString("role"))
            val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(fuelId, "UTF-8")
            val chain = JSONObject(database.records().get(chainId)!!.json).getJSONObject("data")
            assertEquals(2, chain.getInt("chainRevision"))
        } finally {
            activity?.finish()
            database.records().remove(fuelId)
            database.records().remove(vehicleId)
            database.records().remove("feature:driver-records:assignment:$driverId")
            previousAssignments.forEach { database.records().put(it) }
            database.records().remove("feature:driver-records:driver:$driverId")
            previousDriverRecords.forEach { database.records().put(it) }
            database.records().remove("identity:driver-person-link:$driverId")
            database.records().remove("identity:person:$personId")
            database.records().remove("historical-correction-chain:" + java.net.URLEncoder.encode(fuelId, "UTF-8"))
            database.records().list().filter { it.id.startsWith("historical-correction:") &&
                JSONObject(it.json).optJSONObject("data")?.optString("targetRecordId") == fuelId }
                .forEach { database.records().remove(it.id) }
            previousSelectedDriver?.let { database.records().put(it) } ?: database.records().remove("work:selected-driver")
            previousVehicleRecords.forEach { database.records().put(it) }
            previousDriver?.let { database.records().put(it) }
            previousLink?.let { database.records().put(it) }
            previousPerson?.let { database.records().put(it) }
            previousFuelRecords.forEach { database.records().put(it) }
            previousFuelDrafts.forEach { database.records().put(it) }
            database.close()
        }
    }
}
