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
        val invalidationLatch = AtomicReference(CountDownLatch(1))
        val overlayObserver = object : androidx.room.InvalidationTracker.Observer("records") {
            override fun onInvalidated(tables: Set<String>) {
                invalidationLatch.get().countDown()
            }
        }
        database.invalidationTracker.addObserver(overlayObserver)
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity

        try {
            assertTrue(
                "Capacitor WebView should render the Drive workspace",
                awaitJavascript(activity, "document.querySelector('.driver-card') !== null", 30_000),
            )
            assertTrue(
                "Native workflow should finish its initial restore before the cross-client write",
                awaitJavascript(
                    activity,
                    "(() => { const message = document.querySelector('.driver-message')?.textContent?.trim() ?? ''; return message.length > 0 && message !== 'Restoring driver state…'; })()",
                    30_000,
                ),
            )

            val pluginHandle = activity.getBridge().getPlugin("DriverWorkflow")
            assertNotNull("MainActivity must register DriverWorkflowPlugin", pluginHandle)
            val plugin = pluginHandle!!.getInstance() as DriverWorkflowPlugin
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
                    "Array.from(document.querySelectorAll('.pending-row input')).some(input => input.getAttribute('aria-label') === 'Fare in rupees' && input.value === '123.45')",
                    20_000,
                ),
            )

            // Now edit the rendered React input. Its record-backed working-copy
            // write must reach the independent overlay Room client through RoomStorePlugin.
            invalidationLatch.set(CountDownLatch(1))
            assertTrue(
                "Rendered Fare input should accept a real input event",
                awaitJavascript(
                    activity,
                    "(() => { const input = Array.from(document.querySelectorAll('.pending-row input')).find(node => node.getAttribute('aria-label') === 'Fare in rupees'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '234.56'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()",
                    5_000,
                ),
            )
            assertTrue(
                "WebView RoomStore write must invalidate the independent overlay Room client",
                invalidationLatch.get().await(10, TimeUnit.SECONDS),
            )
            assertEquals(
                "Native overlay Room client must observe the WebView's saved working copy",
                23_456L,
                DriverTripFinancialStore.ensureDraft(database, tripId)
                    .getJSONObject("values").getLong("farePaise"),
            )
        } finally {
            runCatching { database.records().remove(obligationId) }
            runCatching { database.records().remove(draftId) }
            database.invalidationTracker.removeObserver(overlayObserver)
            instrumentation.runOnMainSync { activity.finish() }
            database.close()
        }
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
