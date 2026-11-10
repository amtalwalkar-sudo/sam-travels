package `in`.samtravels.app

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.webkit.WebView
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Exercises the actual Capacitor plugin -> WebView listener -> React workspace
 * refresh path. The second Room client represents the native overlay writer;
 * the assertions inspect the rendered PWA form, not only the database rows.
 */
@RunWith(AndroidJUnit4::class)
class DriverWorkflowCapacitorBridgeTest {
    @Test
    fun roomFinancialDraftChangeCrossesCapacitorBridgeAndRefreshesRenderedWorkspace() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext.applicationContext
        val database = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation()
            .allowMainThreadQueries()
            .build()
        val tripId = "bridge-financial-" + UUID.randomUUID()
        val obligationId = "work:trip-financial-obligation:$tripId"
        val draftId = "__sam_travels_form_working_copy__:work.trip-completed-financials:$tripId"
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )

        try {
            assertTrue(
                "Capacitor WebView should render the Drive workspace",
                awaitJavascript(activity, "document.querySelector('.driver-card') !== null", 30_000),
            )
            assertTrue(
                "Native workflow should finish its initial restore before the cross-client write",
                awaitJavascript(
                    activity,
                    "document.querySelector('.driver-message')?.textContent?.includes('Driver state is up to date') === true",
                    30_000,
                ),
            )

            val pluginHandle = activity.bridge.getPlugin("DriverWorkflow")
            assertNotNull("MainActivity must register DriverWorkflowPlugin", pluginHandle)
            val plugin = pluginHandle!!.instance as DriverWorkflowPlugin
            val observerField = DriverWorkflowPlugin::class.java.getDeclaredField("recordObserver").apply {
                isAccessible = true
            }
            val observerReady = SystemClock.uptimeMillis() + 10_000
            while (observerField.get(plugin) == null && SystemClock.uptimeMillis() < observerReady) {
                SystemClock.sleep(50)
            }
            assertNotNull("Capacitor plugin must attach its Room records observer", observerField.get(plugin))

            val now = java.time.Instant.now().toString()
            DriverTripFinancialStore.createPendingObligation(
                database, tripId, "bridge-end-$tripId", now, null,
            )
            DriverTripFinancialStore.ensureDraft(database, tripId)
            DriverTripFinancialStore.updateDraft(
                database, tripId, JSONObject().put("farePaise", 12_345L),
            )

            assertTrue(
                "Room invalidation must cross the native Capacitor listener and render the saved Fare",
                awaitJavascript(
                    activity,
                    "Array.from(document.querySelectorAll('.pending-row input[aria-label=\\\"Fare in rupees\\\"]')).some(input => input.value === '123.45')",
                    20_000,
                ),
            )

            // Update the same draft from the independent Room client while the
            // WebView remains mounted; React must refresh the controlled input.
            DriverTripFinancialStore.updateDraft(
                database, tripId, JSONObject().put("farePaise", 23_456L),
            )
            assertTrue(
                "A subsequent Room invalidation must refresh the already-rendered Fare input",
                awaitJavascript(
                    activity,
                    "Array.from(document.querySelectorAll('.pending-row input[aria-label=\\\"Fare in rupees\\\"]')).some(input => input.value === '234.56')",
                    20_000,
                ),
            )
        } finally {
            runCatching { database.records().remove(obligationId) }
            runCatching { database.records().remove(draftId) }
            activity.finish()
            database.close()
        }
    }

    private fun awaitJavascript(activity: MainActivity, expression: String, timeoutMs: Long): Boolean {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val webView: WebView = activity.bridge.webView
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
