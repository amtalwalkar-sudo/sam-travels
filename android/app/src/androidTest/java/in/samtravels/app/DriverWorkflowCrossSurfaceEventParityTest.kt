package `in`.samtravels.app

import android.location.Location
import android.location.LocationListener
import android.os.Looper
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
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
class DriverWorkflowCrossSurfaceEventParityTest : DriverOverlayServicePresentationTestSupport() {
    private class FakeLocationSource : DriverLocationSource {
        @Volatile var listener: LocationListener? = null
        override fun bestProvider(): String = "gps"
        override fun requestLocationUpdates(provider: String, listener: LocationListener, looper: Looper) {
            assertEquals(Looper.getMainLooper(), looper)
            this.listener = listener
        }
        override fun removeUpdates(listener: LocationListener) {
            if (this.listener === listener) this.listener = null
        }
        fun deliver(location: Location) {
            (listener ?: error("cross_surface_location_listener_missing")).onLocationChanged(location)
        }
    }

    @Test fun pwaCommittedTripCreationRefreshesOverlayAndOverlayRideStartRefreshesPwa() {
        val source = FakeLocationSource()
        DriverLocationSourceFactory.overrideForTests = source
        var webActivity: MainActivity? = null
        try {
            withAttachedOverlay(
                tripId = "cross-surface-event-parity",
                databaseName = "cross-surface-event-parity.db",
                prepare = { _, _ -> },
                expectedFormLabel = null,
                exerciseWebView = { activity, db ->
                    webActivity = activity
                    assertTrue("PWA Drive workspace must render", awaitJavascript(
                        activity, "document.querySelector('.driver-card') !== null", 30_000,
                    ))
                    assertTrue("PWA must observe the seeded authoritative shift", awaitJavascript(
                        activity,
                        "document.querySelector('.driver-head h2')?.textContent?.trim() === 'Shift Active'",
                        20_000,
                    ))
                    val eventId = "pwa-trip-" + UUID.randomUUID()
                    val transitionAt = Instant.now().toString()
                    val command = JSONObject()
                        .put("schemaVersion", 1)
                        .put("workflowVersion", 2)
                        .put("commandId", eventId)
                        .put("eventId", eventId)
                        .put("eventType", "trip_create")
                        .put("originSurface", "pwa")
                        .put("transitionAt", transitionAt)
                        .put("expectedPriorState", "shift_active")
                        .put("expectedRevision", 1)
                        .put("idempotencyKey", eventId)
                    val gps = JSONObject()
                        .put("latitude", 19.076)
                        .put("longitude", 72.8777)
                        .put("horizontalAccuracyM", 8.0)
                        .put("fixAt", transitionAt)
                        .put("provider", "pwa-cross-surface-test")
                    val expression = """
                        (() => {
                          const plugin = window.Capacitor?.Plugins?.DriverWorkflow;
                          if (!plugin) { window.__crossSurfaceResult = 'plugin_missing'; return; }
                          const command = __COMMAND_JSON__;
                          const gps = __GPS_JSON__;
                          plugin.queueIntent({ command })
                            .then(() => plugin.completeIntent({ eventId: '__EVENT_ID__', gps }))
                            .then(() => { window.__crossSurfaceResult = 'committed'; })
                            .catch(error => { window.__crossSurfaceResult = 'error:' + String(error); });
                        })()
                    """.trimIndent()
                        .replace("__COMMAND_JSON__", command.toString())
                        .replace("__GPS_JSON__", gps.toString())
                        .replace("__EVENT_ID__", eventId)
                    evaluateJavascript(activity, expression)
                    assertTrue(
                        "PWA command must commit through the Room-backed Capacitor boundary; result=" +
                            javascriptValue(activity, "window.__crossSurfaceResult || 'pending'"),
                        awaitJavascript(activity, "window.__crossSurfaceResult === 'committed'", 20_000),
                    )
                    assertTrue("PWA must render the committed trip state and revision", awaitJavascript(
                        activity,
                        "document.querySelector('.driver-head h2')?.textContent?.trim() === 'Going To Pickup'",
                        20_000,
                    ))
                    assertTrue(
                        "PWA plugin and overlay fixture must share the same Room projection; fixture=" +
                            DriverWorkflowStore.snapshot(db).toString(),
                        waitUntil(10_000) {
                            DriverWorkflowStore.snapshot(db).optString("state") == "going_to_pickup" &&
                                DriverWorkflowStore.snapshot(db).optInt("revision") == 2
                        },
                    )
                },
            ) { ui, db ->
                assertTrue("Overlay must refresh from the PWA's committed Room event", waitUntil(15_000) {
                    findNode(ui) {
                        it.text?.toString() == "Sam Travels · going to pickup · r2"
                    } != null && findNode(ui) {
                        it.contentDescription?.toString() == "Swipe to Start trip" && it.isEnabled
                    } != null
                })
                val slider = findNode(ui) {
                    it.className?.toString() == "android.widget.SeekBar" &&
                        it.contentDescription?.toString() == "Swipe to Start trip" && it.isEnabled
                }
                assertNotNull("Overlay must expose the next action after the PWA commit", slider)
                val bounds = android.graphics.Rect().also { slider!!.getBoundsInScreen(it) }
                swipeAt(ui, bounds.left + 6, bounds.centerY(), bounds.right - 6, bounds.centerY())

                assertTrue("Overlay action must queue its own Room command", waitUntil {
                    DriverWorkflowStore.listIntents(db).any {
                        it.optJSONObject("command")?.optString("eventType") == "start_ride" &&
                            it.optString("status") == "pending_location"
                    } && source.listener != null
                })
                val intent = DriverWorkflowStore.listIntents(db).single {
                    it.optJSONObject("command")?.optString("eventType") == "start_ride"
                }
                val command = intent.getJSONObject("command")
                val transitionAt = Instant.parse(command.getString("transitionAt"))
                val fix = Location("gps").apply {
                    latitude = 19.076
                    longitude = 72.8777
                    accuracy = 8f
                    time = transitionAt.toEpochMilli()
                    elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                }
                InstrumentationRegistry.getInstrumentation().runOnMainSync { source.deliver(fix) }

                assertTrue("Overlay command must commit exactly one new revision", waitUntil(15_000) {
                    val state = DriverWorkflowStore.snapshot(db)
                    state.optString("state") == "trip_active" && state.optInt("revision") == 3
                })
                assertEquals(2, DriverWorkflowStore.listEvents(db).size)
                assertEquals("pwa", DriverWorkflowStore.listEvents(db).first {
                    it.optString("eventId").startsWith("pwa-trip-")
                }.getJSONObject("command").getString("originSurface"))
                assertEquals("native_overlay", DriverWorkflowStore.listEvents(db).last()
                    .getJSONObject("command").getString("originSurface"))
                assertTrue("PWA must observe the overlay's committed ride-start event", awaitJavascript(
                    webActivity!!,
                    "document.querySelector('.driver-head h2')?.textContent?.trim() === 'Trip Active'",
                    20_000,
                ))
            }
        } finally {
            DriverLocationSourceFactory.overrideForTests = null
        }
    }

    private fun evaluateJavascript(activity: MainActivity, expression: String): String? {
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            activity.getBridge().getWebView().evaluateJavascript(expression) {
                result.set(it)
                latch.countDown()
            }
        }
        return if (latch.await(3, TimeUnit.SECONDS)) result.get() else null
    }

    private fun javascriptValue(activity: MainActivity, expression: String): String? {
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            activity.getBridge().getWebView().evaluateJavascript(expression) {
                result.set(it)
                latch.countDown()
            }
        }
        return if (latch.await(3, TimeUnit.SECONDS)) result.get() else null
    }

    private fun awaitJavascript(activity: MainActivity, expression: String, timeoutMs: Long): Boolean {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < deadline) {
            if (javascriptValue(activity, "Boolean($expression)") == "true") return true
            SystemClock.sleep(100)
        }
        return false
    }
}
