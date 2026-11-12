package `in`.samtravels.app

import android.location.Location
import android.location.LocationListener
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

/** Exercises the real overlay gesture, service command path, GPS callback and Room commit. */
@RunWith(AndroidJUnit4::class)
class DriverOverlayWorkflowAcceptanceTest : DriverOverlayServicePresentationTestSupport() {
    private class FakeLocationSource : DriverLocationSource {
        @Volatile var listener: LocationListener? = null
        @Volatile var removed = false

        override fun bestProvider(): String = "gps"

        override fun requestLocationUpdates(provider: String, listener: LocationListener, looper: Looper) {
            assertEquals("Overlay GPS callbacks must be delivered on the main looper", Looper.getMainLooper(), looper)
            this.listener = listener
        }

        override fun removeUpdates(listener: LocationListener) {
            if (this.listener === listener) this.listener = null
            removed = true
        }

        fun deliver(location: Location) {
            val active = listener ?: error("overlay_location_listener_not_registered")
            active.onLocationChanged(location)
        }
    }

    @Test fun actualOverlaySwipeCommitsAttributedTripEventAfterGpsEvidence() {
        val databaseName = "overlay-native-workflow-acceptance.db"
        val tripId = "overlay-native-workflow-acceptance"
        val locationSource = FakeLocationSource()
        DriverLocationSourceFactory.overrideForTests = locationSource
        try {
            withAttachedOverlay(
                tripId,
                { _, _ -> },
                databaseName = databaseName,
                expectedFormLabel = null,
            ) { ui, db ->
                    val revisionBefore = DriverWorkflowStore.snapshot(db).optInt("revision")
                    val eventsBefore = DriverWorkflowStore.listEvents(db).size
                    val intentsBefore = DriverWorkflowStore.listIntents(db).size
                    val slider = findNode(ui) {
                        it.className?.toString() == "android.widget.SeekBar" && it.isEnabled
                    }
                    assertNotNull("Active native overlay must expose its enabled workflow swipe", slider)
                    val bounds = android.graphics.Rect().also { slider!!.getBoundsInScreen(it) }
                    swipeAt(ui, bounds.left + 6, bounds.centerY(), bounds.right - 6, bounds.centerY())

                    assertTrue("A real overlay swipe must queue a native workflow command", waitUntil {
                        DriverWorkflowStore.listIntents(db).size == intentsBefore + 1 &&
                            locationSource.listener != null
                    })
                    val intent = DriverWorkflowStore.listIntents(db).single { row ->
                        row.optJSONObject("command")?.optString("eventType") == "trip_create"
                    }
                    val command = intent.getJSONObject("command")
                    assertEquals("native_overlay", command.getString("originSurface"))
                    assertEquals("pending_location", intent.getString("status"))
                    assertEquals(revisionBefore, DriverWorkflowStore.snapshot(db).optInt("revision"))

                    val transitionAt = Instant.parse(command.getString("transitionAt"))
                    val fix = Location("gps").apply {
                        latitude = 19.076
                        longitude = 72.8777
                        accuracy = 8f
                        time = transitionAt.toEpochMilli()
                        elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                    }
                    InstrumentationRegistry.getInstrumentation().runOnMainSync {
                        locationSource.deliver(fix)
                    }

                    assertTrue("Valid GPS evidence must commit the trip transition", waitUntil(10_000) {
                        DriverWorkflowStore.snapshot(db).optString("state") == "going_to_pickup" &&
                            DriverWorkflowStore.listEvents(db).size == eventsBefore + 1
                    })
                    val event = DriverWorkflowStore.listEvents(db).single { it.optString("eventId") == command.getString("eventId") }
                    assertEquals("native_overlay", event.getJSONObject("command").getString("originSurface"))
                    assertEquals("overlay-person", event.getJSONObject("createdBy").getString("personId"))
                    assertEquals("driver", event.getJSONObject("createdBy").getString("role"))
                    assertEquals("overlay-shift-$tripId", event.getJSONObject("command")
                        .getJSONObject("tripContext").getString("shiftId"))
                    assertEquals(revisionBefore + 1, DriverWorkflowStore.snapshot(db).optInt("revision"))
                    assertEquals("recorded", DriverWorkflowStore.listIntents(db).single()
                        .getString("status"))
                    assertNotNull("Committed native action must have a durable outbox row",
                        db.records().get("driver-outbox:${revisionBefore + 1}"))
                    assertTrue("Completed GPS request must release its listener", locationSource.removed)
            }
        } finally {
            DriverLocationSourceFactory.overrideForTests = null
            DriverOverlayDatabaseFactory.databaseNameOverrideForTests = null
        }
    }
}
