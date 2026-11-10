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
class DriverOverlayServicePresentationTest {
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
            setText(ui, "Fare (₹)", "12.34")
            val header = findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true }
            assertTrue("Attached overlay header must be available to drag", header != null)
            val bounds = android.graphics.Rect().also { header!!.getBoundsInScreen(it) }
            val downTime = SystemClock.uptimeMillis()
            injectMotion(ui, MotionEvent.ACTION_DOWN, bounds.centerX().toFloat(), bounds.centerY().toFloat(), downTime)
            injectMotion(ui, MotionEvent.ACTION_MOVE, bounds.centerX().toFloat(), 1f, downTime)
            injectMotion(ui, MotionEvent.ACTION_UP, bounds.centerX().toFloat(), 1f, downTime)
            assertTrue("Dragging the header to the top must minimize the attached panel", waitUntil {
                findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" } != null
            })
            val bubble = findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" }
            assertTrue("Minimized overlay bubble must be attached", bubble != null)
            val bubbleBounds = android.graphics.Rect().also { bubble!!.getBoundsInScreen(it) }
            val tapTime = SystemClock.uptimeMillis()
            injectMotion(ui, MotionEvent.ACTION_DOWN, bubbleBounds.centerX().toFloat(), bubbleBounds.centerY().toFloat(), tapTime)
            injectMotion(ui, MotionEvent.ACTION_UP, bubbleBounds.centerX().toFloat(), bubbleBounds.centerY().toFloat(), tapTime)
            assertTrue("Tapping the bubble must restore the financial form", waitUntil {
                findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true } != null &&
                    findNode(ui) { it.text?.toString()?.contains("Fare required") == true } != null &&
                    findNode(ui) { it.contentDescription?.toString() == "Fare (₹)" && it.text?.toString() == "12.34" } != null
            })
        }
    }

    @Test fun attachedCancellationFeeFormRetainsValueAfterMinimizeAndRestore() {
        val tripId = "overlay-cancel-minimize-restore"
        withAttachedOverlay(tripId, { db, now ->
            DriverCancellationFeeStore.createPendingObligation(db, tripId, "overlay-cancel-minimize-event", now)
            DriverCancellationFeeStore.ensureCancellationFeeDraft(db, tripId)
        }) { ui, _ ->
            setText(ui, "Required cancellation fee in rupees", "12.34")
            val header = findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true }
            assertTrue("Attached cancellation overlay header must be available to drag", header != null)
            val bounds = android.graphics.Rect().also { header!!.getBoundsInScreen(it) }
            val downTime = SystemClock.uptimeMillis()
            injectMotion(ui, MotionEvent.ACTION_DOWN, bounds.centerX().toFloat(), bounds.centerY().toFloat(), downTime)
            injectMotion(ui, MotionEvent.ACTION_MOVE, bounds.centerX().toFloat(), 1f, downTime)
            injectMotion(ui, MotionEvent.ACTION_UP, bounds.centerX().toFloat(), 1f, downTime)
            assertTrue("Dragging the cancellation header to the top must minimize the panel", waitUntil {
                findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" } != null
            })
            val bubble = findNode(ui) { it.contentDescription?.toString() == "Driver controls minimized. Tap to reopen" }
            assertTrue("Minimized cancellation overlay bubble must be attached", bubble != null)
            val bubbleBounds = android.graphics.Rect().also { bubble!!.getBoundsInScreen(it) }
            val tapTime = SystemClock.uptimeMillis()
            injectMotion(ui, MotionEvent.ACTION_DOWN, bubbleBounds.centerX().toFloat(), bubbleBounds.centerY().toFloat(), tapTime)
            injectMotion(ui, MotionEvent.ACTION_UP, bubbleBounds.centerX().toFloat(), bubbleBounds.centerY().toFloat(), tapTime)
            assertTrue("Restoring the cancellation form must retain its entered fee", waitUntil {
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
                val running = (app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager)
                    .getRunningServices(100).any { it.service.className == DriverOverlayService::class.java.name }
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
            SystemClock.sleep(300)
            db.records().remove("work:trip-financial-obligation:$tripId")
            db.records().remove("__sam_travels_form_working_copy__:${if (tripId.endsWith("cancel")) "work.trip-cancellation-fee" else "work.trip-completed-financials"}:$tripId")
            if (previousState == null) db.records().remove("driver-state") else db.records().put(previousState)
            db.close()
            shell(ui, "appops set ${app.packageName} SYSTEM_ALERT_WINDOW default")
        }
    }

    private fun injectMotion(ui: UiAutomation, action: Int, x: Float, y: Float, downTime: Long) {
        val event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, x, y, 0)
        try {
            assertTrue("Overlay gesture event must be injected", ui.injectInputEvent(event, true))
        } finally {
            event.recycle()
        }
    }

    private fun shell(ui: UiAutomation, command: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(ui.executeShellCommand(command)).bufferedReader().use { it.readText() }

    private fun allNodes(ui: UiAutomation): List<AccessibilityNodeInfo> {
        val result = mutableListOf<AccessibilityNodeInfo>()
        fun visit(node: AccessibilityNodeInfo?) {
            if (node == null) return
            result.add(node)
            for (index in 0 until node.childCount) visit(node.getChild(index))
        }
        visit(ui.rootInActiveWindow)
        ui.windows.forEach { visit(it.root) }
        return result
    }

    private fun findNode(ui: UiAutomation, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? =
        allNodes(ui).firstOrNull(predicate)

    private fun describeNodes(ui: UiAutomation): String = allNodes(ui).map { node ->
        val bounds = android.graphics.Rect()
        node.getBoundsInScreen(bounds)
        "${node.className} text=${node.text} desc=${node.contentDescription} " +
            "enabled=${node.isEnabled} clickable=${node.isClickable} visible=${node.isVisibleToUser} bounds=$bounds"
    }.joinToString(" | ").take(12000)

    private fun waitUntil(timeoutMs: Long = 10_000, condition: () -> Boolean): Boolean {
        val end = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < end) {
            if (condition()) return true
            SystemClock.sleep(100)
        }
        return condition()
    }

    private fun scrollAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var parent = node.parent
        repeat(12) {
            if (parent == null) return null
            if (parent.className?.toString() == "android.widget.ScrollView") return parent
            parent = parent.parent
        }
        return null
    }

    private fun isInsideViewport(node: AccessibilityNodeInfo, viewport: AccessibilityNodeInfo): Boolean {
        val targetBounds = android.graphics.Rect()
        val viewportBounds = android.graphics.Rect()
        node.getBoundsInScreen(targetBounds)
        viewport.getBoundsInScreen(viewportBounds)
        return viewportBounds.contains(targetBounds.centerX(), targetBounds.centerY())
    }

    private fun scrollToNode(ui: UiAutomation, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        repeat(16) {
            val nodes = allNodes(ui)
            val target = nodes.firstOrNull(predicate)
            val scroll = target?.let(::scrollAncestor) ?: nodes.firstOrNull {
                it.className?.toString() == "android.widget.ScrollView"
            }
            if (target != null && (scroll == null || isInsideViewport(target, scroll))) return target
            if (scroll == null || !scroll.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
                return target
            }
            SystemClock.sleep(120)
        }
        return findNode(ui, predicate)
    }

    private fun clickText(ui: UiAutomation, text: String) {
        assertTrue("Overlay control '$text' must respond to click; hierarchy=${describeNodes(ui)}", waitUntil {
            val target = scrollToNode(ui) {
                it.text?.toString()?.contains(text, ignoreCase = true) == true && it.isEnabled
            }
            target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
        })
    }

    private fun setText(ui: UiAutomation, description: String, value: String) {
        assertTrue("Overlay input '$description' must accept text", waitUntil {
            val node = scrollToNode(ui) {
                it.contentDescription?.toString() == description && it.isEnabled
            } ?: return@waitUntil false
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
            })
        })
    }

    private fun spinners(ui: UiAutomation): List<AccessibilityNodeInfo> =
        allNodes(ui).filter { it.className?.toString() == "android.widget.Spinner" }.distinctBy { node ->
            val bounds = android.graphics.Rect()
            node.getBoundsInScreen(bounds)
            bounds.flattenToString()
        }

    private fun choosePayer(ui: UiAutomation, index: Int, label: String) {
        assertTrue("Payer spinner $index must be attached", waitUntil {
            val spinner = spinners(ui).getOrNull(index) ?: return@waitUntil false
            val scroll = scrollAncestor(spinner)
            if (scroll != null && !isInsideViewport(spinner, scroll)) {
                if (!scroll.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) return@waitUntil false
                SystemClock.sleep(120)
                return@waitUntil false
            }
            spinner.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        })
        clickText(ui, label)
    }
}
