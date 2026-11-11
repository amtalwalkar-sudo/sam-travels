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
            val data = JSONObject(db.records().get("work:trip-financial-obligation:$tripId")!!.json).getJSONObject("data")
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

    @Test fun overlayStartupRecoveryRetainsPendingIntentWhenLocationPermissionIsRevoked() {
        val tripId = "overlay-startup-recovery-permission"
        withAttachedOverlay(tripId, { db, now ->
            DriverTripFinancialStore.createPendingObligation(db, tripId, "overlay-startup-financial-event", now, null)
            DriverTripFinancialStore.ensureDraft(db, tripId)
        }) { ui, db ->
            val transitionAt = java.time.Instant.now().toString()
            val commandId = "overlay-startup-pending-trip"
            val command = JSONObject()
                .put("schemaVersion", 1).put("workflowVersion", 2)
                .put("commandId", commandId).put("eventId", commandId)
                .put("eventType", "trip_create").put("originSurface", "native_overlay")
                .put("transitionAt", transitionAt).put("expectedPriorState", "shift_active")
                .put("expectedRevision", DriverWorkflowStore.snapshot(db).optInt("revision"))
                .put("idempotencyKey", commandId)
            DriverWorkflowStore.queue(db, command)
            val revisionBefore = DriverWorkflowStore.snapshot(db).optInt("revision")
            val eventsBefore = DriverWorkflowStore.listEvents(db).size

            shell(ui, "pm revoke ${InstrumentationRegistry.getInstrumentation().targetContext.packageName} android.permission.ACCESS_FINE_LOCATION")
            shell(ui, "pm revoke ${InstrumentationRegistry.getInstrumentation().targetContext.packageName} android.permission.ACCESS_COARSE_LOCATION")
            restartOverlayService(InstrumentationRegistry.getInstrumentation().targetContext)

            assertTrue("Native service startup must recover the pending intent and retain it for attention", waitUntil {
                val row = db.records().get("driver-intent:$commandId") ?: return@waitUntil false
                val intent = JSONObject(row.json)
                intent.optString("status") == "needs_attention" &&
                    intent.optString("reason") == "permission_denied"
            })
            assertEquals("Permission loss must not commit a trip transition", revisionBefore,
                DriverWorkflowStore.snapshot(db).optInt("revision"))
            assertEquals("Permission loss must not append a workflow event", eventsBefore,
                DriverWorkflowStore.listEvents(db).size)
            assertEquals("Pending intent must remain durable for later recovery", commandId,
                JSONObject(db.records().get("driver-intent:$commandId")!!.json)
                    .getJSONObject("command").getString("eventId"))
            shell(ui, "pm grant ${InstrumentationRegistry.getInstrumentation().targetContext.packageName} android.permission.ACCESS_FINE_LOCATION")
            shell(ui, "pm grant ${InstrumentationRegistry.getInstrumentation().targetContext.packageName} android.permission.ACCESS_COARSE_LOCATION")
        }
    }

    @Test fun completedRideDraftSurvivesOverlayServiceRecreation() {
        val tripId = "overlay-service-restart-fare"
        withAttachedOverlay(tripId, { db, now ->
            DriverTripFinancialStore.createPendingObligation(db, tripId, "overlay-service-restart-event", now, null)
            DriverTripFinancialStore.ensureDraft(db, tripId)
        }) { ui, db ->
            clickText(ui, "Add Toll / Parking")
            setText(ui, "Fare (₹)", "31.25")
            setText(ui, "Toll (₹)", "4.50")
            choosePayer(ui, 0, "Customer")
            setText(ui, "Parking (₹)", "2.75")
            choosePayer(ui, 1, "Driver")
            val revisionBefore = DriverWorkflowStore.snapshot(db).optInt("revision")
            val eventsBefore = DriverWorkflowStore.listEvents(db).size
            val intentsBefore = DriverWorkflowStore.listIntents(db).size

            restartOverlayService(InstrumentationRegistry.getInstrumentation().targetContext)

            assertTrue("Recreated service must restore the same completed-ride financial draft", waitUntil {
                findNode(ui) { it.contentDescription?.toString() == "Fare (₹)" && it.text?.toString() == "31.25" } != null &&
                    findNode(ui) { it.contentDescription?.toString() == "Toll (₹)" && it.text?.toString() == "4.50" } != null &&
                    findNode(ui) { it.contentDescription?.toString() == "Parking (₹)" && it.text?.toString() == "2.75" } != null &&
                    findNode(ui) {
                        it.className?.toString() == "android.widget.CheckedTextView" &&
                            it.text?.toString()?.equals("Customer", ignoreCase = true) == true
                    } != null &&
                    findNode(ui) {
                        it.className?.toString() == "android.widget.CheckedTextView" &&
                            it.text?.toString()?.equals("Driver", ignoreCase = true) == true
                    } != null
            })
            assertEquals("Service recreation must not change workflow revision", revisionBefore,
                DriverWorkflowStore.snapshot(db).optInt("revision"))
            assertEquals("Service recreation must not append workflow events", eventsBefore,
                DriverWorkflowStore.listEvents(db).size)
            assertEquals("Service recreation must not queue workflow intents", intentsBefore,
                DriverWorkflowStore.listIntents(db).size)
            val obligation = JSONObject(db.records().get("work:trip-financial-obligation:$tripId")!!.json)
                .getJSONObject("data")
            assertEquals("pending", obligation.getString("status"))
        }
    }

    @Test fun cancellationFeeDraftSurvivesOverlayServiceRecreation() {
        val tripId = "overlay-service-restart-cancel"
        withAttachedOverlay(tripId, { db, now ->
            DriverCancellationFeeStore.createPendingObligation(db, tripId, "overlay-service-restart-cancel-event", now)
            DriverCancellationFeeStore.ensureCancellationFeeDraft(db, tripId)
        }) { ui, db ->
            setText(ui, "Required cancellation fee in rupees", "18.60")
            val revisionBefore = DriverWorkflowStore.snapshot(db).optInt("revision")
            val eventsBefore = DriverWorkflowStore.listEvents(db).size
            val intentsBefore = DriverWorkflowStore.listIntents(db).size

            restartOverlayService(InstrumentationRegistry.getInstrumentation().targetContext)

            assertTrue("Recreated service must restore the same cancellation-fee draft", waitUntil {
                findNode(ui) { it.text?.toString()?.contains("Cancellation fee required") == true } != null &&
                    findNode(ui) {
                        it.contentDescription?.toString() == "Required cancellation fee in rupees" &&
                            it.text?.toString() == "18.60"
                    } != null
            })
            assertEquals("Service recreation must not change workflow revision", revisionBefore,
                DriverWorkflowStore.snapshot(db).optInt("revision"))
            assertEquals("Service recreation must not append workflow events", eventsBefore,
                DriverWorkflowStore.listEvents(db).size)
            assertEquals("Service recreation must not queue workflow intents", intentsBefore,
                DriverWorkflowStore.listIntents(db).size)
            val obligation = JSONObject(db.records().get("work:trip-financial-obligation:$tripId")!!.json)
                .getJSONObject("data")
            assertEquals("pending", obligation.getString("status"))
        }
    }

    @Test fun attachedCancellationFeeFormRetainsValueAfterMinimizeAndRestore() {
        val tripId = "overlay-minimize-restore-cancel"
        withAttachedOverlay(tripId, { db, now ->
            DriverCancellationFeeStore.createPendingObligation(db, tripId, "overlay-cancel-minimize-event", now)
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
            DriverCancellationFeeStore.createPendingObligation(db, tripId, "overlay-live-cancel-event", now)
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

    private fun restartOverlayService(app: Context) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.runOnMainSync {
            app.stopService(Intent(app, DriverOverlayService::class.java))
        }
        assertTrue("Overlay service must stop before recreation", waitUntil(10_000) {
            !isOverlayServiceRunning(app)
        })
        instrumentation.runOnMainSync {
            val intent = Intent(app, DriverOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)
        }
        assertTrue("Overlay service must restart", waitUntil(10_000) {
            isOverlayServiceRunning(app)
        })
    }

    private fun withAttachedOverlay(
        tripId: String,
        prepare: (LocalDatabase, String) -> Unit,
        exercise: (UiAutomation, LocalDatabase) -> Unit,
    ) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext
        val ui = instrumentation.uiAutomation
        ui.setServiceInfo(ui.serviceInfo.apply {
            flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        })
        shell(ui, "appops set ${app.packageName} SYSTEM_ALERT_WINDOW allow")
        shell(ui, "pm grant ${app.packageName} android.permission.ACCESS_FINE_LOCATION")
        shell(ui, "pm grant ${app.packageName} android.permission.ACCESS_COARSE_LOCATION")
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        val db = Room.databaseBuilder(app, LocalDatabase::class.java, "sam-travels.db")
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .enableMultiInstanceInvalidation().allowMainThreadQueries().build()
        val previousState = db.records().get("driver-state")
        val now = java.time.Instant.now().toString()
        try {
            // Isolate each instrumentation case from a START_STICKY service left by
            // an earlier case. Do not overwrite the durable fixture while that
            // service can still be reading or rendering its previous projection.
            instrumentation.runOnMainSync {
                activity.stopService(Intent(activity, DriverOverlayService::class.java))
            }
            assertTrue("Previous overlay service must stop before fixture setup", waitUntil(10_000) {
                !isOverlayServiceRunning(app)
            })
            assertTrue("Emulator must grant overlay permission", Settings.canDrawOverlays(app))
            val active = JSONObject().put("schemaVersion", 1).put("revision", 1)
                .put("state", "shift_active").put("shiftStartedAt", now).put("lastEventId", "overlay-$tripId")
            db.records().put(StoredRecord("driver-state", JSONObject().put("value", active).toString(), 1, now))
            prepare(db, now)
            instrumentation.runOnMainSync {
                val intent = Intent(activity, DriverOverlayService::class.java)
                if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
            }
            val formLabel = if (tripId.endsWith("cancel")) "Cancellation fee required" else "Fare required"
            val attached = waitUntil {
                findNode(ui) { it.text?.toString()?.contains(formLabel) == true } != null
            }
            if (!attached) {
                val running = isOverlayServiceRunning(app)
                val windows = ui.windows.joinToString { window ->
                    "${window.type}:${window.title}:${window.root?.childCount}"
                }
                val activeRoot = ui.rootInActiveWindow?.let { "${it.className}:${it.text}:${it.childCount}" } ?: "none"
                val logs = shell(ui, "logcat -d -s DriverOverlayService:E").takeLast(5000)
                val state = runCatching { DriverWorkflowStore.snapshot(db).toString() }.getOrDefault("invalid")
                assertTrue(
                    "Overlay form did not attach; serviceRunning=$running canDraw=${Settings.canDrawOverlays(app)} " +
                        "fineLocation=${app.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)} " +
                        "state=$state windows=$windows activeRoot=$activeRoot logs=$logs",
                    attached,
                )
            }
            exercise(ui, db)
        } finally {
            instrumentation.runOnMainSync {
                activity.stopService(Intent(activity, DriverOverlayService::class.java))
                activity.finish()
            }
            assertTrue("Overlay service must stop after instrumentation case", waitUntil(10_000) {
                !isOverlayServiceRunning(app)
            })
            db.records().remove("work:trip-financial-obligation:$tripId")
            db.records().remove("__sam_travels_form_working_copy__:${if (tripId.endsWith("cancel")) "work.trip-cancellation-fee" else "work.trip-completed-financials"}:$tripId")
            if (previousState == null) db.records().remove("driver-state") else db.records().put(previousState)
            db.close()
            shell(ui, "appops set ${app.packageName} SYSTEM_ALERT_WINDOW default")
        }
    }
}
