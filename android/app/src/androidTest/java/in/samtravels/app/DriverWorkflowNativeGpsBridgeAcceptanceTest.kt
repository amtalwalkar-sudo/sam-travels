package `in`.samtravels.app

import android.Manifest
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.os.Looper
import android.os.SystemClock
import androidx.test.rule.GrantPermissionRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Verifies each Android PWA bridge capture is a fresh native request with listener cleanup. */
class DriverWorkflowNativeGpsBridgeAcceptanceTest {
    private class FakeLocationSource : DriverLocationSource {
        @Volatile var listener: LocationListener? = null
        @Volatile var requests = 0
        @Volatile var removals = 0

        override fun bestProvider(): String = "gps"
        override fun requestLocationUpdates(provider: String, listener: LocationListener, looper: Looper) {
            assertEquals(Looper.getMainLooper(), looper)
            requests += 1
            this.listener = listener
        }
        override fun removeUpdates(listener: LocationListener) {
            if (this.listener === listener) this.listener = null
            removals += 1
        }
        fun deliver(location: Location) {
            (listener ?: error("native_gps_listener_missing")).onLocationChanged(location)
        }
    }

    @get:Rule
    val locationPermission = GrantPermissionRule.grant(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    )

    @Test fun sixSequentialCapacitorGpsCapturesUseIndependentNativeFixes() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext.applicationContext
        val source = FakeLocationSource()
        DriverLocationSourceFactory.overrideForTests = source
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        try {
            assertTrue("Capacitor WebView is ready", await(activity, "document.readyState === 'complete'", 30_000))
            val fixes = (0 until 6).map { index ->
                val transitionAt = Instant.now()
                val latitude = 19.076 + (index + 1) * 0.0001
                val longitude = 72.8777 + (index + 1) * 0.0001
                val fixAt = Instant.ofEpochMilli(transitionAt.toEpochMilli()).toString()
                val beforeRequests = source.requests
                val beforeRemovals = source.removals
                evaluate(activity, """
                    (() => {
                      window.__nativeGpsResult = null;
                      window.Capacitor?.Plugins?.DriverWorkflow?.captureLocation({
                        transitionAt: '$transitionAt'
                      }).then(value => { window.__nativeGpsResult = value; })
                        .catch(error => { window.__nativeGpsResult = { error: String(error) }; });
                    })()
                """.trimIndent())
                assertTrue("Native GPS request " + (index + 1) + " starts independently", waitUntil {
                    source.requests == beforeRequests + 1 && source.listener != null
                })
                val location = Location("gps").apply {
                    this.latitude = latitude
                    this.longitude = longitude
                    accuracy = 8f
                    time = transitionAt.toEpochMilli()
                    elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                }
                instrumentation.runOnMainSync { source.deliver(location) }
                assertTrue("Native GPS request " + (index + 1) + " resolves with its own fix", await(
                    activity,
                    "window.__nativeGpsResult?.latitude === $latitude && window.__nativeGpsResult?.longitude === $longitude",
                    10_000,
                ))
                assertTrue("Native GPS request " + (index + 1) + " releases its listener", waitUntil {
                    source.removals == beforeRemovals + 1 && source.listener == null
                })
                org.json.JSONObject(read(activity, "JSON.stringify(window.__nativeGpsResult)")).also {
                    assertEquals(latitude, it.getDouble("latitude"), 0.000001)
                    assertEquals(longitude, it.getDouble("longitude"), 0.000001)
                    assertEquals(fixAt, it.getString("fixAt"))
                    assertEquals("gps", it.getString("provider"))
                }
            }
            assertEquals("Six requests, not one reused subscription", 6, source.requests)
            assertEquals("Every request releases its native listener", 6, source.removals)
            assertEquals("Six unique native coordinates", 6, fixes.map { it.getDouble("latitude") }.toSet().size)
            assertEquals("Six unique native fix timestamps", 6, fixes.map { it.getString("fixAt") }.toSet().size)
        } finally {
            DriverLocationSourceFactory.overrideForTests = null
            instrumentation.runOnMainSync { activity.finish() }
        }
    }

    private fun evaluate(activity: MainActivity, script: String) {
        val latch = CountDownLatch(1)
        instrumentation().runOnMainSync {
            activity.getBridge().getWebView().evaluateJavascript(script) { latch.countDown() }
        }
        check(latch.await(10, TimeUnit.SECONDS)) { "WebView evaluation timed out" }
    }

    private fun read(activity: MainActivity, expression: String): String {
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        instrumentation().runOnMainSync {
            activity.getBridge().getWebView().evaluateJavascript(expression) { result.set(it); latch.countDown() }
        }
        check(latch.await(10, TimeUnit.SECONDS)) { "WebView read timed out" }
        return org.json.JSONTokener(result.get() ?: error("WebView returned no value")).nextValue() as String
    }

    private fun await(activity: MainActivity, expression: String, timeoutMs: Long): Boolean {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < deadline) {
            if (readRaw(activity, "Boolean($expression)") == "true") return true
            SystemClock.sleep(100)
        }
        return false
    }

    private fun readRaw(activity: MainActivity, expression: String): String {
        val result = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        instrumentation().runOnMainSync {
            activity.getBridge().getWebView().evaluateJavascript(expression) { result.set(it); latch.countDown() }
        }
        check(latch.await(10, TimeUnit.SECONDS)) { "WebView boolean read timed out" }
        return result.get() ?: "null"
    }

    private fun waitUntil(timeoutMs: Long = 10_000, predicate: () -> Boolean): Boolean {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < deadline) {
            if (predicate()) return true
            SystemClock.sleep(50)
        }
        return false
    }

    private fun instrumentation() = InstrumentationRegistry.getInstrumentation()
}
