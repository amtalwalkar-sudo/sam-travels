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

abstract class DriverOverlayServicePresentationTestSupport {
    protected fun isOverlayServiceRunning(context: Context): Boolean =
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager)
            .getRunningServices(100).any {
                it.service.className == DriverOverlayService::class.java.name
            }

    protected fun swipeAt(ui: UiAutomation, fromX: Int, fromY: Int, toX: Int, toY: Int) {
        val downTime = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN,
            fromX.toFloat(), fromY.toFloat(), 0).apply { source = InputDevice.SOURCE_TOUCHSCREEN }
        val move = MotionEvent.obtain(downTime, downTime + 120, MotionEvent.ACTION_MOVE,
            toX.toFloat(), toY.toFloat(), 0).apply { source = InputDevice.SOURCE_TOUCHSCREEN }
        val up = MotionEvent.obtain(downTime, downTime + 240, MotionEvent.ACTION_UP,
            toX.toFloat(), toY.toFloat(), 0).apply { source = InputDevice.SOURCE_TOUCHSCREEN }
        try {
            assertTrue("Gesture down must be injected", ui.injectInputEvent(down, true))
            assertTrue("Gesture move must be injected", ui.injectInputEvent(move, true))
            assertTrue("Gesture up must be injected", ui.injectInputEvent(up, true))
        } finally {
            down.recycle()
            move.recycle()
            up.recycle()
        }
    }

    protected fun cancelSwipeAt(ui: UiAutomation, fromX: Int, fromY: Int, toX: Int, toY: Int) {
        val downTime = SystemClock.uptimeMillis()
        val events = listOf(
            MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN,
                fromX.toFloat(), fromY.toFloat(), 0),
            MotionEvent.obtain(downTime, downTime + 100, MotionEvent.ACTION_MOVE,
                toX.toFloat(), toY.toFloat(), 0),
            MotionEvent.obtain(downTime, downTime + 200, MotionEvent.ACTION_CANCEL,
                toX.toFloat(), toY.toFloat(), 0),
        ).onEach { it.source = InputDevice.SOURCE_TOUCHSCREEN }
        try {
            events.forEach { assertTrue("Interrupted gesture event must inject", ui.injectInputEvent(it, true)) }
        } finally {
            events.forEach(MotionEvent::recycle)
        }
    }

    protected fun tapAt(ui: UiAutomation, x: Int, y: Int) {
        val downTime = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x.toFloat(), y.toFloat(), 0).apply {
            source = InputDevice.SOURCE_TOUCHSCREEN
        }
        val up = MotionEvent.obtain(downTime, downTime + 80, MotionEvent.ACTION_UP, x.toFloat(), y.toFloat(), 0).apply {
            source = InputDevice.SOURCE_TOUCHSCREEN
        }
        try {
            assertTrue("Overlay touch-down must be injected", ui.injectInputEvent(down, true))
            assertTrue("Overlay touch-up must be injected", ui.injectInputEvent(up, true))
        } finally {
            down.recycle()
            up.recycle()
        }
    }

    protected fun shell(ui: UiAutomation, command: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(ui.executeShellCommand(command)).bufferedReader().use { it.readText() }

    protected fun allNodes(ui: UiAutomation): List<AccessibilityNodeInfo> {
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

    protected fun findNode(ui: UiAutomation, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? =
        allNodes(ui).firstOrNull(predicate)

    protected fun describeNodes(ui: UiAutomation): String = allNodes(ui).map { node ->
        val bounds = android.graphics.Rect()
        node.getBoundsInScreen(bounds)
        "${node.className} text=${node.text} desc=${node.contentDescription} " +
            "enabled=${node.isEnabled} clickable=${node.isClickable} visible=${node.isVisibleToUser} bounds=$bounds"
    }.joinToString(" | ").take(12000)

    protected fun waitUntil(timeoutMs: Long = 10_000, condition: () -> Boolean): Boolean {
        val end = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < end) {
            if (condition()) return true
            SystemClock.sleep(100)
        }
        return condition()
    }

    protected fun scrollToTop(ui: UiAutomation) {
        val anchor = findNode(ui) { it.contentDescription?.toString() == "Parking (₹)" } ?: return
        val scroll = scrollAncestor(anchor) ?: return
        repeat(16) {
            if (!scroll.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return
            SystemClock.sleep(120)
        }
    }

    protected fun scrollAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var parent = node.parent
        repeat(12) {
            if (parent == null) return null
            if (parent.className?.toString() == "android.widget.ScrollView") return parent
            parent = parent.parent
        }
        return null
    }

    protected fun isInsideViewport(node: AccessibilityNodeInfo, viewport: AccessibilityNodeInfo): Boolean {
        val targetBounds = android.graphics.Rect()
        val viewportBounds = android.graphics.Rect()
        node.getBoundsInScreen(targetBounds)
        viewport.getBoundsInScreen(viewportBounds)
        return viewportBounds.contains(targetBounds.centerX(), targetBounds.centerY())
    }

    protected fun scrollToNode(ui: UiAutomation, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
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

    protected fun clickText(ui: UiAutomation, text: String) {
        assertTrue("Overlay control '$text' must respond to click; hierarchy=${describeNodes(ui)}", waitUntil {
            val target = scrollToNode(ui) {
                it.text?.toString()?.contains(text, ignoreCase = true) == true && it.isEnabled
            }
            target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
        })
    }

    protected fun setText(ui: UiAutomation, description: String, value: String) {
        assertTrue("Overlay input '$description' must accept text", waitUntil {
            val node = scrollToNode(ui) {
                it.contentDescription?.toString() == description && it.isEnabled
            } ?: return@waitUntil false
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
            })
        })
    }

    protected fun spinners(ui: UiAutomation): List<AccessibilityNodeInfo> =
        allNodes(ui).filter { it.className?.toString() == "android.widget.Spinner" }.distinctBy { node ->
            val bounds = android.graphics.Rect()
            node.getBoundsInScreen(bounds)
            bounds.flattenToString()
        }

    protected fun choosePayer(ui: UiAutomation, index: Int, label: String) {
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


    protected fun restartOverlayService(app: Context) {
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

    protected fun withAttachedOverlay(
        tripId: String,
        prepare: (LocalDatabase, String) -> Unit,
        exercise: (UiAutomation, LocalDatabase) -> Unit,
        databaseName: String = "sam-travels.db",
        expectedFormLabel: String? = if (tripId.endsWith("cancel")) "Cancellation fee required" else "Fare required",
    ) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext
        val ui = instrumentation.uiAutomation
        DriverOverlayDatabaseFactory.databaseNameOverrideForTests = databaseName
        ui.setServiceInfo(ui.serviceInfo.apply {
            flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        })
        shell(ui, "appops set ${app.packageName} SYSTEM_ALERT_WINDOW allow")
        shell(ui, "pm grant ${app.packageName} android.permission.ACCESS_FINE_LOCATION")
        shell(ui, "pm grant ${app.packageName} android.permission.ACCESS_COARSE_LOCATION")
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        val db = Room.databaseBuilder(app, LocalDatabase::class.java, databaseName)
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
            DriverWorkflowIdentityTestFixtures.seed(db, "overlay-driver", "overlay-person")
            val active = JSONObject().put("schemaVersion", 1).put("revision", 1)
                .put("state", "shift_active").put("shiftStartedAt", now).put("lastEventId", "overlay-$tripId")
                .put("shiftContext", JSONObject().put("schemaVersion", 1).put("driverId", "overlay-driver")
                    .put("assignmentId", "overlay-assignment").put("vehicleId", "feature:vehicle:overlay-vehicle"))
            db.records().put(StoredRecord("driver-state", JSONObject().put("value", active).toString(), 1, now))
            prepare(db, now)
            instrumentation.runOnMainSync {
                val intent = Intent(activity, DriverOverlayService::class.java)
                if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
            }
            // CI emulators can take longer than the default polling window to
            // finish native startup recovery and expose the attached form window.
            val attached = waitUntil(20_000) {
                if (expectedFormLabel == null) {
                    findNode(ui) { it.text?.toString()?.startsWith("Sam Travels ·") == true } != null
                } else {
                    findNode(ui) { it.text?.toString()?.contains(expectedFormLabel) == true } != null
                }
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
            DriverOverlayDatabaseFactory.databaseNameOverrideForTests = null
            if (databaseName != "sam-travels.db") app.deleteDatabase(databaseName)
        }
    }
}
