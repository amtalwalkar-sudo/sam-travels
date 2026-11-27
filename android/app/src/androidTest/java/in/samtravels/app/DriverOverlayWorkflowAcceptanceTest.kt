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
        @Volatile var requestCount = 0
        @Volatile var removeCount = 0
        private val activeListeners = java.util.Collections.newSetFromMap(
            java.util.IdentityHashMap<LocationListener, Boolean>(),
        )

        override fun bestProvider(): String = "gps"

        @Synchronized override fun requestLocationUpdates(provider: String, listener: LocationListener, looper: Looper) {
            assertEquals("Overlay GPS callbacks must be delivered on the main looper", Looper.getMainLooper(), looper)
            requestCount += 1
            activeListeners.add(listener)
            this.listener = listener
        }

        @Synchronized override fun removeUpdates(listener: LocationListener) {
            activeListeners.remove(listener)
            if (this.listener === listener) this.listener = activeListeners.firstOrNull()
            removeCount += 1
            removed = activeListeners.isEmpty()
        }

        @Synchronized fun activeListenerCount(): Int = activeListeners.size

        @Synchronized fun deliver(location: Location) {
            val active = listener ?: error("overlay_location_listener_not_registered")
            active.onLocationChanged(location)
        }
    }

    @Test fun eachNativeOverlaySupportedTransitionAcquiresAndReleasesItsOwnGpsFix() {
        val tripId = "overlay-six-event-gps-matrix"
        val locationSource = FakeLocationSource()
        DriverLocationSourceFactory.overrideForTests = locationSource
        val expected = listOf(
            "trip_create" to "going_to_pickup",
            "cancel_ride" to "shift_active",
            "trip_create" to "going_to_pickup",
            "start_ride" to "trip_active",
            "end_ride" to "shift_active",
        )
        try {
            withAttachedOverlay(
                tripId,
                { _, _ -> },
                databaseName = "overlay-six-event-gps-matrix.db",
                expectedFormLabel = null,
            ) { ui, db ->
                val initialEventCount = DriverWorkflowStore.listEvents(db).size
                val eventIds = mutableListOf<String>()
                val fixTimes = mutableSetOf<String>()
                val latitudes = mutableSetOf<Double>()
                expected.forEachIndexed { index, (eventType, nextState) ->
                    assertTrue("Overlay exposes the next action for $eventType; hierarchy=${describeNodes(ui)}", waitUntil(10_000) {
                        findNode(ui) {
                            it.className?.toString() == "android.widget.SeekBar" &&
                                it.contentDescription?.toString()?.startsWith("Swipe to ") == true && it.isEnabled
                        } != null
                    })
                    val slider = findNode(ui) {
                        it.className?.toString() == "android.widget.SeekBar" &&
                            it.contentDescription?.toString()?.startsWith("Swipe to ") == true && it.isEnabled
                    } ?: error("overlay_action_missing:$eventType")
                    val bounds = android.graphics.Rect().also { slider.getBoundsInScreen(it) }
                    val requestsBefore = locationSource.requestCount
                    val removalsBefore = locationSource.removeCount
                    if (eventType == "cancel_ride") {
                        clickText(ui, "Cancel ride")
                    } else {
                        swipeAt(ui, bounds.left + 6, bounds.centerY(), bounds.right - 6, bounds.centerY())
                    }

                    assertTrue("Each $eventType transition starts a fresh native GPS request", waitUntil(10_000) {
                        locationSource.requestCount == requestsBefore + 1 &&
                            locationSource.listener != null &&
                            DriverWorkflowStore.listIntents(db).any { intent ->
                                intent.optJSONObject("command")?.optString("eventType") == eventType &&
                                    intent.optString("status") == "pending_location"
                            }
                    })
                    val intent = DriverWorkflowStore.listIntents(db).last { row ->
                        row.optJSONObject("command")?.optString("eventType") == eventType &&
                            row.optString("status") == "pending_location"
                    }
                    val command = intent.getJSONObject("command")
                    val eventId = command.getString("eventId")
                    assertTrue("Each transition has a stable unique event ID", eventIds.add(eventId))
                    val transitionAt = Instant.parse(command.getString("transitionAt"))
                    val fix = Location("gps").apply {
                        latitude = 19.076 + (index + 1) * 0.0001
                        longitude = 72.8777 + (index + 1) * 0.0001
                        accuracy = 8f
                        time = transitionAt.toEpochMilli()
                        elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                    }
                    InstrumentationRegistry.getInstrumentation().runOnMainSync {
                        locationSource.deliver(fix)
                    }
                    assertTrue("$eventType commits only after its own GPS fix", waitUntil(10_000) {
                        DriverWorkflowStore.snapshot(db).optString("state") == nextState &&
                            DriverWorkflowStore.listEvents(db).size == initialEventCount + index + 1
                    })
                    assertEquals("$eventType must create exactly one event-scoped GPS request",
                        requestsBefore + 1, locationSource.requestCount)
                    assertEquals("$eventType must leave no event-scoped GPS listener registered",
                        0, locationSource.activeListenerCount())
                    val event = DriverWorkflowStore.listEvents(db).single { it.optString("eventId") == eventId }
                    val gps = event.getJSONObject("gps")
                    assertEquals(eventType, event.getJSONObject("command").getString("eventType"))
                    assertTrue("Each accepted event has a distinct fix timestamp", fixTimes.add(gps.getString("fixAt")))
                    assertTrue("Each accepted event has a distinct location", latitudes.add(gps.getDouble("latitude")))
                    assertEquals(fix.latitude, gps.getDouble("latitude"), 0.000001)
                    assertTrue("$eventType releases its GPS listener", waitUntil(5_000) {
                        locationSource.removeCount >= removalsBefore + 1 && locationSource.listener == null
                    })
                    // Cancellation creates a durable fee obligation. Resolve it before
                    // asserting that the next Work transition is available.
                    if (eventType == "cancel_ride") {
                        setText(ui, "Required cancellation fee in rupees", "0")
                        clickText(ui, "SAVE CANCELLATION FEE")
                        assertTrue("Cancellation fee obligation is resolved", waitUntil {
                            DriverCancellationFeeStore.pendingObligation(db) == null
                        })
                    }
                }
                assertEquals("Every overlay-supported Work transition acquires GPS independently", 5, locationSource.requestCount)
                assertTrue("Every completed acquisition releases its listener", locationSource.removeCount >= 5 && locationSource.listener == null)
                assertEquals("Five unique event-scoped GPS fixes", 5, fixTimes.size)
                assertEquals("Five unique event-scoped locations", 5, latitudes.size)
                assertEquals("All overlay-supported transitions committed", initialEventCount + 5, DriverWorkflowStore.listEvents(db).size)
            }
        } finally {
            DriverLocationSourceFactory.overrideForTests = null
            DriverOverlayDatabaseFactory.databaseNameOverrideForTests = null
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
                        it.className?.toString() == "android.widget.SeekBar" &&
                            it.contentDescription?.toString()?.startsWith("Swipe to ") == true && it.isEnabled
                    }
                    assertNotNull("Active native overlay must expose its enabled workflow swipe", slider)
                    val bounds = android.graphics.Rect().also { slider!!.getBoundsInScreen(it) }
                    swipeAt(ui, bounds.left + 6, bounds.centerY(), bounds.right - 6, bounds.centerY())

                    assertTrue("A real overlay swipe must queue a native workflow command; hierarchy=${describeNodes(ui)}", waitUntil {
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
