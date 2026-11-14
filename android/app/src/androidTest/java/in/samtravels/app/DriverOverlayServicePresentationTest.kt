package `in`.samtravels.app

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.provider.Settings
import android.view.MotionEvent
import android.view.InputDevice
import android.view.accessibility.AccessibilityNodeInfo
import android.app.UiAutomation
import android.accessibilityservice.AccessibilityServiceInfo
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Starts the real foreground service and operates its attached WindowManager form window. */
@RunWith(AndroidJUnit4::class)
class DriverOverlayServicePresentationTest : DriverOverlayServicePresentationTestSupport() {
    @Test fun attachedCompletedRideFormValidatesPayersAndSubmitsThroughOverlayWindow() {
        val tripId = "overlay-live-fare"
        withAttachedOverlay(tripId, { db, now ->
            DriverTripFinancialStore.createPendingObligation(db, tripId, "overlay-live-end", now, null)
            DriverTripFinancialStore.ensureDraft(db, tripId)
        }) { ui, db ->
            clickText(ui, "Add Toll / Parking")
            setText(ui, "Fare (₹)", "0")
            setText(ui, "Toll (₹)", "12.34")
            choosePayer(ui, 0, "Driver")
            setText(ui, "Parking (₹)", "2.50")
            choosePayer(ui, 1, "Customer")
            assertTrue("Attached native form must enable Submit after valid values", waitUntil {
                scrollToNode(ui) { it.text?.toString()?.equals("Submit trip financials", ignoreCase = true) == true && it.isEnabled } != null
            })
            clickText(ui, "Submit trip financials")
            assertTrue("Overlay submit must persist the completed-ride obligation", waitUntil {
                val row = db.records().get("work:trip-financial-obligation:$tripId") ?: return@waitUntil false
                JSONObject(row.json).getJSONObject("data").optString("status") == "submitted"
            })
            val submittedEnvelope = JSONObject(db.records().get("work:trip-financial-obligation:$tripId")!!.json)
            assertEquals("overlay-person", submittedEnvelope.getJSONObject("createdBy").getString("personId"))
            assertEquals("driver", submittedEnvelope.getJSONObject("createdBy").getString("role"))
            val data = submittedEnvelope.getJSONObject("data")
            assertEquals(0L, data.getLong("farePaise"))
            assertEquals(1234L, data.getLong("tollPaise"))
            assertEquals("driver", data.getString("tollPayer"))
            assertEquals(250L, data.getLong("parkingPaise"))
            assertEquals("customer", data.getString("parkingPayer"))
        }
    }

    @Test fun attachedOverlayCanMinimizeToBubbleAndRestoreTheSameFinancialForm() {
        val tripId = "overlay-minimize-restore"
        withAttachedOverlay(tripId, { db, now ->
            DriverTripFinancialStore.createPendingObligation(db, tripId, "overlay-minimize-event", now, null)
            DriverTripFinancialStore.ensureDraft(db, tripId)
        }) { ui, _ ->
            clickText(ui, "Add Toll / Parking")
            setText(ui, "Fare (₹)", "12.34")
            setText(ui, "Toll (₹)", "4.56")
            choosePayer(ui, 0, "Driver")
            setText(ui, "Parking (₹)", "7.89")
            choosePayer(ui, 1, "Customer")
            scrollToTop(ui)
            clickText(ui, "Minimize")
            assertTrue("Explicit Minimize must attach the compact bubble", waitUntil {
                findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" } != null
            })
            val bubble = findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" }
            assertTrue("Minimized overlay bubble must be attached", bubble != null)
            val bubbleBounds = android.graphics.Rect().also { bubble!!.getBoundsInScreen(it) }
            tapAt(ui, bubbleBounds.centerX(), bubbleBounds.centerY())
            assertTrue("Tapping the bubble must restore the financial form; bounds=$bubbleBounds hierarchy=${describeNodes(ui)} logs=${shell(ui, "logcat -d -v brief | grep -E 'DriverOverlayService|AndroidRuntime' | tail -80").takeLast(9000)}", waitUntil {
                findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true } != null &&
                    findNode(ui) { it.text?.toString()?.contains("Fare required") == true } != null &&
                    findNode(ui) { it.contentDescription?.toString() == "Fare (₹)" && it.text?.toString() == "12.34" } != null &&
                    findNode(ui) { it.contentDescription?.toString() == "Toll (₹)" && it.text?.toString() == "4.56" } != null &&
                    findNode(ui) { it.contentDescription?.toString() == "Parking (₹)" && it.text?.toString() == "7.89" } != null &&
                    findNode(ui) {
                        it.className?.toString() == "android.widget.CheckedTextView" &&
                            it.text?.toString()?.equals("Driver", ignoreCase = true) == true
                    } != null &&
                    findNode(ui) {
                        it.className?.toString() == "android.widget.CheckedTextView" &&
                            it.text?.toString()?.equals("Customer", ignoreCase = true) == true
                    } != null
            })

            val restoreLogs = shell(ui, "logcat -d -v brief -s DriverOverlayService:I")
            assertTrue("Bubble touch boundary was not observed: $restoreLogs", restoreLogs.contains("bubble_touch action=1"))
            assertTrue("Bubble click callback was not observed: $restoreLogs", restoreLogs.contains("bubble_click"))
            assertTrue("Restore request was not observed: $restoreLogs", restoreLogs.contains("restore_requested"))
            assertTrue("Restore completion was not observed: $restoreLogs", restoreLogs.contains("restore_finished panelAttached=true"))
        }
    }

    @Test fun panelAndBubblePresentationGesturesDoNotDispatchWorkflowCommandsOrChangeRevision() {
        val tripId = "overlay-presentation-gestures"
        withAttachedOverlay(tripId, { db, now ->
            DriverTripFinancialStore.createPendingObligation(db, tripId, "overlay-gesture-event", now, null)
            DriverTripFinancialStore.ensureDraft(db, tripId)
        }) { ui, db ->
            val before = DriverWorkflowStore.snapshot(db).optInt("revision")
            val eventCountBefore = DriverWorkflowStore.listEvents(db).size
            val intentCountBefore = DriverWorkflowStore.listIntents(db).size

            val header = findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true }
            assertTrue("Overlay header must be attached as the panel drag target", header != null)
            val headerBounds = android.graphics.Rect().also { header!!.getBoundsInScreen(it) }
            swipeAt(ui, headerBounds.centerX(), headerBounds.centerY(),
                headerBounds.centerX() + 24, headerBounds.centerY() - 240)

            assertTrue("Upward header gesture must minimize to the bubble; headerBounds=$headerBounds; overlayLogs=${shell(ui, "logcat -d -v brief -s DriverOverlayService:I")}; hierarchy=${describeNodes(ui)}", waitUntil {
                findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" } != null
            })
            val bubble = findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" }
            assertTrue("Minimized bubble must remain available for dragging", bubble != null)
            val bubbleBounds = android.graphics.Rect().also { bubble!!.getBoundsInScreen(it) }
            val screenWidth = ui.rootInActiveWindow?.let { node ->
                val rect = android.graphics.Rect()
                node.getBoundsInScreen(rect)
                rect.right
            } ?: InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.widthPixels
            val targetX = if (bubbleBounds.centerX() < screenWidth / 2) screenWidth - 30 else 30
            swipeAt(ui, bubbleBounds.centerX(), bubbleBounds.centerY(), targetX, bubbleBounds.centerY() + 90)

            assertTrue("Dragged bubble must stay attached after edge docking", waitUntil {
                val docked = findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" }
                if (docked == null) false else {
                    val bounds = android.graphics.Rect().also { docked.getBoundsInScreen(it) }
                    bounds.centerX() < screenWidth / 3 || bounds.centerX() > screenWidth * 2 / 3
                }
            })

            val firstDock = findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" }
            assertTrue("Docked bubble must remain discoverable", firstDock != null)
            val firstDockBounds = android.graphics.Rect().also { firstDock!!.getBoundsInScreen(it) }
            val oppositeX = if (firstDockBounds.centerX() < screenWidth / 2) screenWidth - 30 else 30
            swipeAt(ui, firstDockBounds.centerX(), firstDockBounds.centerY(),
                oppositeX, firstDockBounds.centerY() - 70)
            assertTrue("Bubble must also dock to the opposite screen edge", waitUntil {
                val opposite = findNode(ui) {
                    it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen"
                } ?: return@waitUntil false
                val bounds = android.graphics.Rect().also { opposite.getBoundsInScreen(it) }
                if (firstDockBounds.centerX() < screenWidth / 2) bounds.centerX() > screenWidth * 2 / 3
                else bounds.centerX() < screenWidth / 3
            })

            assertEquals("Presentation gestures must not dispatch workflow transitions", before,
                DriverWorkflowStore.snapshot(db).optInt("revision"))
            assertEquals("Presentation gestures must not append workflow events", eventCountBefore,
                DriverWorkflowStore.listEvents(db).size)
            assertEquals("Presentation gestures must not queue workflow intents", intentCountBefore,
                DriverWorkflowStore.listIntents(db).size)
        }
    }

    @Test fun interruptedHeaderDragDoesNotDispatchWorkflowOrChangeDurableRevision() {
        val tripId = "overlay-interrupted-header-drag"
        withAttachedOverlay(tripId, { db, now ->
            DriverTripFinancialStore.createPendingObligation(db, tripId, "overlay-interrupted-event", now, null)
            DriverTripFinancialStore.ensureDraft(db, tripId)
        }) { ui, db ->
            val revisionBefore = DriverWorkflowStore.snapshot(db).optInt("revision")
            val eventsBefore = DriverWorkflowStore.listEvents(db).size
            val intentsBefore = DriverWorkflowStore.listIntents(db).size
            val header = findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true }
            assertTrue("Header drag target must be attached", header != null)
            val bounds = android.graphics.Rect().also { header!!.getBoundsInScreen(it) }
            cancelSwipeAt(ui, bounds.centerX(), bounds.centerY(),
                bounds.centerX() + 80, bounds.centerY() + 80)
            assertTrue("Interrupted presentation drag must leave panel attached", waitUntil {
                findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true } != null
            })
            assertEquals("Interrupted drag must not dispatch workflow transitions", revisionBefore,
                DriverWorkflowStore.snapshot(db).optInt("revision"))
            assertEquals("Interrupted drag must not append workflow events", eventsBefore,
                DriverWorkflowStore.listEvents(db).size)
            assertEquals("Interrupted drag must not queue workflow intents", intentsBefore,
                DriverWorkflowStore.listIntents(db).size)
        }
    }

    @Test fun attachedCancellationFeeFormRetainsValueAfterMinimizeAndRestore() {
        val tripId = "overlay-minimize-restore-cancel"
        withAttachedOverlay(tripId, { db, now ->
            DriverCancellationFeeStore.createPendingObligation(db, tripId, "overlay-cancel-minimize-event", now, org.json.JSONObject().put("schemaVersion",1).put("shiftId","test-shift").put("driverId","test-driver").put("assignmentId","test-assignment").put("vehicleId","feature:vehicle:test").put("operationalDate","2026-11-14"))
            DriverCancellationFeeStore.ensureCancellationFeeDraft(db, tripId)
        }) { ui, _ ->
            setText(ui, "Required cancellation fee in rupees", "12.34")
            clickText(ui, "Minimize")
            assertTrue("Explicit Minimize must attach the compact bubble", waitUntil {
                findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" } != null
            })
            val bubble = findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" }
            assertTrue("Minimized cancellation overlay bubble must be attached", bubble != null)
            val bubbleBounds = android.graphics.Rect().also { bubble!!.getBoundsInScreen(it) }
            tapAt(ui, bubbleBounds.centerX(), bubbleBounds.centerY())
            assertTrue("Tapping the cancellation bubble must restore the form", waitUntil {
                findNode(ui) { it.text?.toString()?.contains("Cancellation fee required") == true } != null &&
                    findNode(ui) {
                        it.contentDescription?.toString() == "Required cancellation fee in rupees" &&
                            it.text?.toString() == "12.34"
                    } != null
            })
        }
    }

    @Test fun attachedCancellationFeeFormPreservesEditAndSubmitsZero() {
        val tripId = "overlay-live-cancel"
        withAttachedOverlay(tripId, { db, now ->
            val tripContext = JSONObject()
                .put("schemaVersion", 1)
                .put("shiftId", "test-shift")
                .put("driverId", "test-driver")
                .put("assignmentId", "test-assignment")
                .put("vehicleId", "feature:vehicle:test")
                .put("operationalDate", "2026-11-14")
            DriverCancellationFeeStore.createPendingObligation(
                db, tripId, "overlay-live-cancel-event", now, tripContext,
            )
            DriverCancellationFeeStore.ensureCancellationFeeDraft(db, tripId)
        }) { ui, db ->
            setText(ui, "Required cancellation fee in rupees", "0")
            val saveEnabled = waitUntil {
                scrollToNode(ui) { it.text?.toString()?.equals("Save cancellation fee", ignoreCase = true) == true && it.isEnabled } != null
            }
            if (!saveEnabled) {
                val entered = findNode(ui) { it.contentDescription?.toString() == "Required cancellation fee in rupees" }?.text
                val save = findNode(ui) { it.text?.toString()?.equals("Save cancellation fee", ignoreCase = true) == true && it.className?.toString() == "android.widget.Button" }
                assertTrue("Zero fee validation did not enable Save; input=$entered buttonEnabled=${save?.isEnabled} buttonClass=${save?.className}; hierarchy=${describeNodes(ui)}", saveEnabled)
            }
            clickText(ui, "Save cancellation fee")
            assertTrue("Attached cancellation form must persist its submission", waitUntil {
                val row = db.records().get("work:trip-financial-obligation:$tripId") ?: return@waitUntil false
                JSONObject(row.json).getJSONObject("data").optString("status") == "submitted"
            })
            val data = JSONObject(db.records().get("work:trip-financial-obligation:$tripId")!!.json).getJSONObject("data")
            assertEquals(0L, data.getLong("feePaise"))
        }
    }


}
