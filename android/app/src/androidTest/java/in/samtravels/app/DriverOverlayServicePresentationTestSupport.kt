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

}
