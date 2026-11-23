package `in`.samtravels.app

import android.content.Context
import android.os.SystemClock
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

internal object SemanticFixtureCalculationParitySupport {
    fun assertProductionCalculationsMatchFixture(context: Context, assetContext: Context,
        roomRows: List<StoredRecord>, fixture: JSONObject) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bundle = assetContext.assets.open("generated/semantic-fixture-calculation-parity.js")
            .bufferedReader().use { it.readText() }
        val inputRows = JSONArray()
        roomRows.forEach { stored ->
            // Room's driver-state and a few workflow-owned rows store a value
            // envelope without an embedded id; the Room primary key remains
            // authoritative and must be supplied to the shared domain runner.
            inputRows.put(JSONObject(stored.json).put("id", stored.id))
        }
        val inputJson = inputRows.toString()
        val webViewRef = AtomicReference<WebView>()
        val loaded = CountDownLatch(1)
        instrumentation.runOnMainSync {
            val webView = WebView(context)
            webView.settings.javaScriptEnabled = true
            webView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) { loaded.countDown() }
            }
            webViewRef.set(webView)
            val html = "<html><body><script>$bundle</script><script>window.__semanticParityInput = $inputJson;</script></body></html>"
            webView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null)
        }
        val webView = webViewRef.get() ?: throw AssertionError("Android parity WebView was not created")
        try {
            assertTrue("Android production calculation bundle did not load", loaded.await(20, TimeUnit.SECONDS))
            val readiness = decodeJsString(evaluate(webView, "typeof window.SemanticFixtureCalculationParity.run"))
            assertEquals("Android semantic calculation bundle must expose its production runner", "function", readiness)
            val startResult = evaluate(webView, """
                try {
                  window.__semanticParityResult = null;
                  window.__semanticParityError = null;
                  window.__semanticParityProgress = "starting";
                  Promise.resolve(window.SemanticFixtureCalculationParity.run(window.__semanticParityInput))
                    .then(value => { window.__semanticParityResult = JSON.stringify(value); })
                    .catch(error => { window.__semanticParityError = String(error && error.stack || error); });
                  "started"
                } catch (error) {
                  window.__semanticParityError = String(error && error.stack || error);
                  "synchronous_error"
                }
            """.trimIndent())
            assertTrue("Android calculation runner did not start: $startResult", startResult.contains("started"))
            var raw = ""
            var progress = ""
            var error = ""
            val deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(120)
            while (SystemClock.elapsedRealtime() < deadline) {
                val state = JSONObject(evaluate(webView, """
                    JSON.stringify({
                      result: window.__semanticParityResult,
                      error: window.__semanticParityError,
                      progress: window.__semanticParityProgress
                    })
                """.trimIndent()))
                raw = state.optString("result")
                error = state.optString("error")
                progress = state.optString("progress")
                if (raw.isNotBlank() || error.isNotBlank()) break
                SystemClock.sleep(100)
            }
            assertEquals("Android production calculation runner failed at $progress: $error", "", error)
            assertTrue("Android production calculation runner timed out at progress=$progress", raw.isNotBlank())
            val actual = JSONObject(raw)
            val expected = fixture.getJSONObject("expectedBusinessResults")
            val expectedExpenses = expected.getJSONObject("dailyExpenses")
            val actualExpenses = actual.getJSONObject("dailyExpenses")
            listOf("fuelPaise", "platformFeesPaise", "trafficChallansPaise", "miscellaneousPaise",
                "reportedSourceExpensePaise", "normalOperatingExpensePaise", "fullCostExpensePaise")
                .forEach { key -> assertEquals("Room-backed $key", expectedExpenses.getInt(key), actualExpenses.getInt(key)) }

            val expectedIntervals = expected.getJSONArray("fuelIntervals")
            val actualIntervals = actual.getJSONArray("fuelIntervals")
            assertEquals("Android calculates full-to-full intervals", expectedIntervals.length(), actualIntervals.length())
            for (index in 0 until expectedIntervals.length()) {
                val expectedInterval = expectedIntervals.getJSONObject(index)
                val actualInterval = actualIntervals.getJSONObject(index)
                listOf("startCheckpointId", "endCheckpointId", "distanceKm", "quantityMilliKg", "spendPaise")
                    .forEach { key -> assertEquals("Fuel interval $index $key", expectedInterval.get(key), actualInterval.get(key)) }
                assertEquals("Fuel interval $index source IDs",
                    canonicalJson(expectedInterval.getJSONArray("sourcePurchaseIds")),
                    canonicalJson(actualInterval.getJSONArray("sourcePurchaseIds")))
            }
            assertEquals("Android fuel cost-rate history",
                canonicalJson(expected.getJSONArray("fuelCostRateHistory")),
                canonicalJson(actual.getJSONArray("fuelCostRateHistory")))

            val expectedAccruals = expected.getJSONArray("maintenanceAccruals")
            val actualAccruals = actual.getJSONArray("maintenanceAccruals")
            assertEquals("MaintenanceService independently recalculates accruals",
                expectedAccruals.length(), actualAccruals.length())
            for (index in 0 until expectedAccruals.length()) {
                val expectedRow = expectedAccruals.getJSONObject(index)
                val actualRow = actualAccruals.getJSONObject(index).getJSONObject("data")
                listOf("operationalDate", "businessKm", "personalKm", "ratePaisePerKm", "amountPaise", "personalAmountPaise")
                    .forEach { key -> assertEquals("Maintenance accrual $index $key", expectedRow.get(key), actualRow.get(key)) }
            }

            val finance = actual.getJSONObject("finance")
            assertEquals(expected.getJSONObject("finance").getInt("regularEmiPaise"),
                finance.getJSONObject("originalSchedule").getInt("regularEmiPaise"))
            val prepaymentExpected = fixture.getJSONObject("populatedGraph").getJSONArray("records").let { rows ->
                (0 until rows.length()).map { rows.getJSONObject(it) }
                    .first { it.getString("id").startsWith("feature:finance:prepayments:") }
                    .getJSONObject("data").getJSONArray("revisions").getJSONObject(0).getJSONObject("output")
            }
            val prepaymentActual = finance.getJSONObject("prepayment")
            listOf("regularEmiPaise", "remainingInstallmentCount", "finalDueDate",
                "totalScheduledPaymentsPaise", "totalInterestPaise")
                .forEach { key -> assertEquals("Prepayment $key", prepaymentExpected.get(key), prepaymentActual.get(key)) }

            val compliance = actual.getJSONObject("compliance")
            assertEquals("available", compliance.getString("status"))
            assertEquals("1000", compliance.getJSONObject("total").getString("numeratorPaise"))
            assertEquals("1", compliance.getJSONObject("total").getString("denominator"))
            assertEquals(1, compliance.getJSONArray("breakdown").length())
            assertEquals(4, actual.getJSONArray("corrections").length())

            val provenance = actual.getJSONArray("provenance")
            assertTrue("Android calculation results retain provenance", provenance.length() >= 12)
            val roomById = roomRows.associateBy { it.id }
            for (index in 0 until provenance.length()) {
                val item = provenance.getJSONObject(index)
                val sourceId = item.getString("sourceId")
                val source = roomById[sourceId]
                assertNotNull("Provenance source resolves in reopened Room: " + sourceId, source)
                assertEquals("Provenance revision matches reopened Room: " + sourceId,
                    JSONObject(source!!.json).getInt("revision"), item.getInt("revision"))
            }
            val work = actual.getJSONArray("workAllocations")
            assertEquals(3, work.length())
            assertEquals(5, work.getJSONObject(2).getInt("unallocatedBusinessKm"))
        } finally {
            instrumentation.runOnMainSync { webView.destroy() }
        }
    }

    private fun evaluate(webView: WebView, script: String): String {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val latch = CountDownLatch(1)
        val result = AtomicReference<String>()
        instrumentation.runOnMainSync {
            webView.evaluateJavascript(script) { value -> result.set(value); latch.countDown() }
        }
        assertTrue("Android WebView evaluation timed out", latch.await(15, TimeUnit.SECONDS))
        return result.get() ?: error("Android WebView returned no result")
    }

    private fun decodeJsString(raw: String): String =
        (JSONTokener(raw).nextValue() as? String).orEmpty()

    private fun canonicalJson(value: Any?): String = when (value) {
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(prefix = "{", postfix = "}") {
            key -> JSONObject.quote(key) + ":" + canonicalJson(value.get(key))
        }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") { canonicalJson(value.get(it)) }
        JSONObject.NULL -> "null"
        is String -> JSONObject.quote(value)
        else -> value.toString()
    }
}
