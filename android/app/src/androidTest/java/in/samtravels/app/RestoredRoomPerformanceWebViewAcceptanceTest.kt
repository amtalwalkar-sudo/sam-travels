package `in`.samtravels.app

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
/**
 * Exercises the actual Android Capacitor WebView Performance screen over the
 * same populated Room repository that has passed the production backup/restore
 * coordinator. This intentionally does not inject a fake calculation context.
 */
@RunWith(AndroidJUnit4::class)
class RestoredRoomPerformanceWebViewAcceptanceTest {
    private fun envelope(
        id: String,
        data: JSONObject,
        createdAt: String,
        updatedAt: String = createdAt,
        revision: Int = 1,
        businessDate: String? = null,
    ): JSONObject = JSONObject()
        .put("id", id)
        .put("schemaVersion", 1)
        .put("createdAt", createdAt)
        .put("updatedAt", updatedAt)
        .put("source", "integration")
        .put("revision", revision)
        .apply { if (businessDate != null) put("businessDate", businessDate) }
        .put("data", data)
    private fun snapshot(database: LocalDatabase) =
        NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "android-webview-acceptance")
    private fun recordGraph(bundle: NativeSnapshotBundle): Map<String, String> {
        val records = bundle.snapshot.getJSONArray("records")
        return (0 until records.length()).associate { index ->
            val row = records.getJSONObject(index)
            row.getString("id") to row.getString("json")
        }
    }
    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                findWebView(view.getChildAt(index))?.let { return it }
            }
        }
        return null
    }
    private fun evaluate(webView: WebView, script: String): String {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val latch = CountDownLatch(1)
        val result = AtomicReference<String>()
        instrumentation.runOnMainSync {
            webView.evaluateJavascript(script) { value ->
                result.set(value)
                latch.countDown()
            }
        }
        assertTrue("WebView JavaScript evaluation timed out", latch.await(15, TimeUnit.SECONDS))
        return result.get() ?: error("WebView JavaScript returned no value")
    }
    private fun waitFor(webView: WebView, timeoutSeconds: Long = 60, predicate: (JSONObject) -> Boolean): JSONObject {
        val deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(timeoutSeconds)
        var last = JSONObject()
        while (SystemClock.elapsedRealtime() < deadline) {
            val raw = evaluate(webView, """
                (() => ({
                  ready: document.readyState,
                  body: document.body?.innerText || "",
                  performance: document.querySelector("#performance-dashboard-title")?.innerText || "",
                  lifetime: document.querySelector(".performance-lifetime-grid")?.innerText || "",
                  error: document.querySelector(".performance-error")?.innerText || ""
                }))()
            """.trimIndent())
            last = JSONObject(raw)
            if (predicate(last)) return last
            SystemClock.sleep(300)
        }
        throw AssertionError("Timed out waiting for WebView acceptance condition. Last DOM: ${last}")
    }
    @Test fun restoredRoomPoolDrivesTheActualAndroidPerformanceScreen() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = ApplicationProvider.getApplicationContext<Context>()
        val fixture = instrumentation.context.assets.open("performance-calculation-v1-parity.json")
            .bufferedReader().use { JSONObject(it.readText()) }
        val fixtureRecords = fixture.getJSONArray("records")
        val vehicleId = "feature:vehicle:MH01AB1234"
        val businessStartDate = fixture.getJSONObject("input").getString("businessStartDate")
        val targetDate = fixture.getJSONObject("input").getString("periodTo")
        val adminMarker = "Performance Restore " + UUID.randomUUID().toString().take(8)
        val databaseName = "sam-travels.db"

        // Register the same production participants MainActivity uses before
        // building either the source export or the restored application DB.
        NativeBusinessSettingsBackup.ensureRegistered()
        NativeVehicleBackup.ensureRegistered()
        NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered()
        NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered()
        NativePerformanceBackup.ensureRegistered()
        context.deleteDatabase(databaseName)
        var expectedGraph: Map<String, String> = emptyMap()
        val sourceDb = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            for (index in 0 until fixtureRecords.length()) {
                val row = fixtureRecords.getJSONObject(index)
                sourceDb.records().put(StoredRecord(
                    row.getString("id"), row.toString(),
                    row.getInt("schemaVersion"), row.getString("updatedAt"),
                ))
            }
            // The real BusinessStartDateCostAllocationService reads this
            // singleton from the repository; it is deliberately in the backup.
            val settingsAt = "2026-01-01T00:00:00.000Z"
            val settings = envelope(
                "feature:business-settings:business",
                JSONObject().put("schemaVersion", 1).put("businessStartDate", businessStartDate),
                settingsAt,
            )
            sourceDb.records().put(StoredRecord(
                settings.getString("id"), settings.toString(), 1, settings.getString("updatedAt"),
            ))
            // Add the second, target-date fare so the screen proves period and
            // lifetime totals against actual persisted trip obligations.
            val secondTripId = "work:trip-financial-obligation:parity-trip-2"
            val secondTripAt = targetDate + "T05:00:00.000Z"
            val secondTrip = envelope(
                secondTripId,
                JSONObject().put("schemaVersion", 1)
                    .put("tripId", "parity-trip-2")
                    .put("kind", "completed_ride_financials")
                    .put("status", "submitted")
                    .put("endRideEventId", "end-parity-2")
                    .put("createdAt", secondTripAt)
                    .put("tripContext", JSONObject().put("schemaVersion", 1)
                        .put("shiftId", "shift-parity-2").put("driverId", "driver-1")
                        .put("assignmentId", "assignment-1").put("vehicleId", vehicleId)
                        .put("operationalDate", targetDate))
                    .put("farePaise", 20_000),
                secondTripAt, businessDate = targetDate,
            )
            sourceDb.records().put(StoredRecord(
                secondTripId, secondTrip.toString(), 1, secondTripAt,
            ))
            // The target-date cost is a real persisted Business Expenses
            // charge. The production FullCost source projection feeds it into
            // Performance's miscellaneous cost category.
            val targetExpenseId = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174094"
            val targetExpenseAt = targetDate + "T06:00:00.000Z"
            val targetExpense = envelope(
                targetExpenseId,
                JSONObject().put("schemaVersion", 1).put("kind", "business_expense")
                    .put("id", targetExpenseId).put("revision", 1)
                    .put("sourceKind", "miscellaneous").put("businessDate", targetDate)
                    .put("amountPaise", 1_000).put("currencyCode", "INR")
                    .put("effect", "charge").put("category", "Miscellaneous")
                    .put("vehicleId", vehicleId),
                targetExpenseAt, businessDate = targetDate,
            )
            sourceDb.records().put(StoredRecord(
                targetExpenseId, targetExpense.toString(), 1, targetExpenseAt,
            ))
            val exported = snapshot(sourceDb)
            expectedGraph = recordGraph(exported)
            // Restore through the same production coordinator used by BackupPlugin
            // into the exact database name opened by RoomStorePlugin in MainActivity.
            val destination = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
                .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
                .allowMainThreadQueries().build()
            try {
                val restored = NativeBackupRestoreCoordinator.restore(
                    destination, exported.snapshot, exported.manifest, { snapshot(destination) },
                )
                assertEquals("Production Room restore preserves every exported record", expectedGraph, recordGraph(snapshot(destination)))
                NativeBackupRestoreCoordinator.markVerified(destination, restored.checkpointId)
                NativeBackupRestoreCoordinator.discardVerified(destination, restored.checkpointId)
            } finally {
                destination.close()
            }
        } finally {
            sourceDb.close()
        }
        // Reopen the real app DB and pass its production startup-recovery gate
        // before the Activity/WebView is allowed to read it.
        val reopened = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries().build()
        try {
            assertEquals("Verified restore leaves no pending startup recovery", emptyList<String>(), NativeStartupRecovery.ensure(reopened))
            val reexported = snapshot(reopened)
            val graph = recordGraph(reexported)
            assertTrue("Business Start Date settings survive Room reopen", graph.containsKey("feature:business-settings:business"))
            assertTrue("Manual pre-business source survives Room reopen", graph.containsKey("feature:performance:pre-business-cost:123e4567-e89b-42d3-a456-426614174091"))
            assertTrue("EMI loan source survives Room reopen", graph.containsKey("feature:finance:loan:123e4567-e89b-42d3-a456-426614174092"))
            assertTrue("Compliance source survives Room reopen", graph.containsKey("feature:compliance:123e4567-e89b-42d3-a456-426614174093"))
            assertTrue("Target-date operating expense survives Room reopen", graph.containsKey("feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174094"))
            assertEquals("Re-export after startup recovery matches original source graph", expectedGraph, graph)
        } finally {
            reopened.close()
        }

        var activity: MainActivity? = null
        var stage = "launch application"
        try {
            val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity = instrumentation.startActivitySync(intent) as MainActivity
            val webViewRef = AtomicReference<WebView>()
            instrumentation.runOnMainSync {
                webViewRef.set(findWebView(activity!!.window.decorView))
            }
            val webView = webViewRef.get() ?: throw AssertionError("MainActivity did not attach its Capacitor WebView")
            stage = "wait for local workspace"
            waitFor(webView, 90) { it.getString("body").contains("Local workspace ready") }
            // Compliance's production overview is Admin-authorized. Establish
            // the first Admin and activate its PIN-verified session through the
            // same identity UI used by the real application, not a test bypass.
            stage = "open Admin identity"
            evaluate(webView, """
                document.querySelectorAll(".bottom-navigation-item").forEach(item => {
                  if (item.textContent.trim() === "Admin") item.click();
                });
                true
            """.trimIndent())
            waitFor(webView) {
                it.getString("body").contains("Admin") &&
                    evaluate(webView, "Boolean(document.querySelector('.admin-replacement-shell'))") == "true"
            }
            stage = "enroll first Admin"
            val enrolled = evaluate(webView, """
                (() => {
                  const set = (labelText, value) => {
                    const label = [...document.querySelectorAll("label")].find(node => node.textContent.includes(labelText));
                    const input = label?.querySelector("input");
                    if (!input) return false;
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    return true;
                  };
                  const role = [...document.querySelectorAll("label")].find(node => node.textContent.includes("Admin role"));
                  const checkbox = role?.querySelector('input[type="checkbox"]');
                  if (!checkbox) return false;
                  if (!checkbox.checked) checkbox.click();
                  return set("Person name", "$adminMarker Admin") && set("Set initial Admin PIN", "4831");
                })()
            """.trimIndent())
            assertEquals("Admin enrollment fields are available", "true", enrolled)
            evaluate(webView, "document.querySelector('form button')?.click(); true")
            waitFor(webView) { it.getString("body").contains("Person enrolled") }
            stage = "select Admin role"
            val selectedAdmin = evaluate(webView, """
                (() => {
                  const find = text => [...document.querySelectorAll("label")].find(node => node.textContent.includes(text));
                  const person = find("Select person")?.querySelector("select");
                  const role = find("Active role")?.querySelector("select");
                  if (!person || !role) return false;
                  const set = (select, value) => {
                    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, value);
                    select.dispatchEvent(new Event("input", { bubbles: true }));
                    select.dispatchEvent(new Event("change", { bubbles: true }));
                  };
                  const option = [...person.options].find(item => item.textContent.trim() === "$adminMarker Admin");
                  if (!option) return false;
                  set(person, option.value);
                  set(role, "admin");
                  return true;
                })()
            """.trimIndent())
            assertEquals("Admin role can be selected for the enrolled person", "true", selectedAdmin)
            waitFor(webView) {
                it.getString("body").contains("Admin PIN") &&
                    evaluate(webView, "Boolean([...document.querySelectorAll('label')].find(n=>n.textContent.trim()==='Admin PIN')?.querySelector('input'))") == "true"
            }
            stage = "activate PIN-verified Admin"
            val activated = evaluate(webView, """
                (() => {
                  const label = [...document.querySelectorAll("label")].find(node => node.textContent.trim() === "Admin PIN");
                  const input = label?.querySelector("input");
                  if (!input) return false;
                  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "4831");
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  label.closest("form")?.querySelector("button")?.click();
                  return true;
                })()
            """.trimIndent())
            assertEquals("PIN-verified Admin activation form submits", "true", activated)
            waitFor(webView) { it.getString("body").contains("Role activated") }
            stage = "open Performance screen"
            evaluate(webView, """
                (() => {
                  const nav = document.querySelector('nav[aria-label="Primary navigation"]');
                  const button = [...(nav?.querySelectorAll("button") || [])]
                    .find(item => item.textContent.trim() === "Performance");
                  if (!button) throw new Error("performance_navigation_missing");
                  button.click();
                  return true;
                })()
            """.trimIndent())
            waitFor(webView) { it.getString("performance") == "Performance overview" }
            stage = "set Performance reporting dates"
            val dateInputsSet = evaluate(webView, """
                (() => {
                  const fields = [...document.querySelectorAll(".performance-period-form input[type=date]")];
                  if (fields.length !== 2) throw new Error("performance_period_inputs_missing");
                  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
                  setter.call(fields[0], "$businessStartDate");
                  fields[0].dispatchEvent(new Event("input", { bubbles: true }));
                  fields[0].dispatchEvent(new Event("change", { bubbles: true }));
                  setter.call(fields[1], "$targetDate");
                  fields[1].dispatchEvent(new Event("input", { bubbles: true }));
                  fields[1].dispatchEvent(new Event("change", { bubbles: true }));
                  return fields.map(field => field.value);
                })()
            """.trimIndent())
            assertEquals("Performance date inputs accept the restored reporting range", JSONArray().put(businessStartDate).put(targetDate).toString(), dateInputsSet)
            stage = "run actual Performance calculation"
            evaluate(webView, """
                (() => {
                  const button = [...document.querySelectorAll(".performance-period-form button")]
                    .find(item => item.textContent.includes("Refresh performance"));
                  if (!button) throw new Error("performance_refresh_button_missing");
                  button.click();
                  return true;
                })()
            """.trimIndent())
            val calculated = waitFor(webView, 90) {
                it.getString("lifetime").contains("Lifetime eligible costs") ||
                    it.getString("error").isNotBlank()
            }
            assertTrue("Actual Android Performance calculation failed: ${calculated.optString("error")}",
                calculated.getString("lifetime").contains("₹274.00"))

            stage = "verify Performance totals and source provenance"
            val output = JSONObject(evaluate(webView, """
                (() => ({
                  selected: document.querySelector(".performance-kpi-grid")?.innerText || "",
                  lifetime: document.querySelector(".performance-lifetime-grid")?.innerText || "",
                  provenance: document.querySelector(".performance-provenance")?.textContent || "",
                  recoveryWindow: document.querySelector(".performance-meta")?.innerText || ""
                }))()
            """.trimIndent()))
            assertTrue("Selected period revenue should be ₹200.00: " + output.getString("selected"), output.getString("selected").contains("₹200.00"))
            assertTrue("Selected period cost should be ₹10.00: " + output.getString("selected"), output.getString("selected").contains("₹10.00"))
            assertTrue("Selected period net should be ₹190.00: " + output.getString("selected"), output.getString("selected").contains("₹190.00"))
            assertTrue("Lifetime revenue should be ₹300.00: " + output.getString("lifetime"), output.getString("lifetime").contains("₹300.00"))
            assertTrue("Lifetime eligible cost should be ₹274.00: " + output.getString("lifetime"), output.getString("lifetime").contains("₹274.00"))
            assertTrue("Lifetime profit should be ₹26.00: " + output.getString("lifetime"), output.getString("lifetime").contains("₹26.00"))
            assertTrue("Lifetime target should be ₹9,024.19: " + output.getString("lifetime"), output.getString("lifetime").contains("₹9,024.19"))
            assertTrue("Performance output retains manual source provenance", output.getString("provenance").contains("feature:performance:pre-business-cost:123e4567-e89b-42d3-a456-426614174091"))
            assertTrue("Performance output retains EMI schedule provenance", output.getString("provenance").contains("feature:finance:loan:123e4567-e89b-42d3-a456-426614174092:emi:1:v1"))
            assertTrue("Performance output retains Compliance source provenance", output.getString("provenance").contains("feature:compliance:123e4567-e89b-42d3-a456-426614174093"))
            stage = "verify recovery presentation"
            evaluate(webView, """
                (() => {
                  const tab = [...document.querySelectorAll('[role="tab"]')]
                    .find(item => item.textContent.trim() === "Pre-business recovery");
                  if (!tab) throw new Error("pre_business_recovery_tab_missing");
                  tab.click();
                  return true;
                })()
            """.trimIndent())
            val recovery = JSONObject(evaluate(webView, """
                (() => ({
                  summary: document.querySelector(".performance-recovery-summary")?.innerText || "",
                  rows: document.querySelector(".performance-recovery tbody")?.innerText || ""
                }))()
            """.trimIndent()))
            assertTrue("Recovery presentation shows ₹234.00: " + recovery.getString("summary"), recovery.getString("summary").contains("₹234.00"))
            assertTrue("Recovery presentation shows Business Start Date", recovery.getString("summary").contains(businessStartDate))
            assertTrue("Recovery presentation shows the 18-month end boundary", recovery.getString("summary").contains(targetDate))
            assertTrue("Recovery rows include manual source", recovery.getString("rows").contains("manual"))
            assertTrue("Recovery rows include EMI source", recovery.getString("rows").contains("emi"))
            assertTrue("Recovery rows include Compliance source", recovery.getString("rows").contains("compliance"))
        } catch (error: Throwable) {
            throw AssertionError("Restored Room Performance WebView acceptance failed at $stage: ${error.message}", error)
        } finally {
            activity?.let { instance ->
                instrumentation.runOnMainSync { instance.finish() }
            }
            runCatching { SecureCredentialVault(context).remove("sam-travels-admin-pin-v1") }
            context.deleteDatabase(databaseName)
        }
    }
}