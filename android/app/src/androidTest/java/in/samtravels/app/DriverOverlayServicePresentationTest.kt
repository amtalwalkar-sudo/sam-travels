package `in`.samtravels.app

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.provider.Settings
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
                findNode(ui) { it.text?.toString() == "Submit trip financials" && it.isEnabled } != null
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

    @Test fun attachedCancellationFeeFormPreservesEditAndSubmitsZero() {
        val tripId = "overlay-live-cancel"
        withAttachedOverlay(tripId, { db, now ->
            DriverCancellationFeeStore.createPendingObligation(db, tripId, "overlay-live-cancel-event", now)
            DriverCancellationFeeStore.ensureCancellationFeeDraft(db, tripId)
        }) { ui, db ->
            setText(ui, "Required cancellation fee in rupees", "0")
            val saveEnabled = waitUntil {
                findNode(ui) { it.text?.toString() == "Save cancellation fee" && it.className?.toString() == "android.widget.Button" && it.isEnabled } != null
            }
            if (!saveEnabled) {
                val entered = findNode(ui) { it.contentDescription?.toString() == "Required cancellation fee in rupees" }?.text
                val save = findNode(ui) { it.text?.toString() == "Save cancellation fee" && it.className?.toString() == "android.widget.Button" }
                assertTrue("Zero fee validation did not enable Save; input=$entered buttonEnabled=${save?.isEnabled} buttonClass=${save?.className}", saveEnabled)
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

    private fun waitUntil(timeoutMs: Long = 10_000, condition: () -> Boolean): Boolean {
        val end = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < end) {
            if (condition()) return true
            SystemClock.sleep(100)
        }
        return condition()
    }

    private fun scrollToNode(ui: UiAutomation, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        repeat(12) {
            val visible = findNode(ui) { predicate(it) && it.isVisibleToUser }
            if (visible != null) return visible
            val scroll = allNodes(ui).firstOrNull {
                it.className?.toString() == "android.widget.ScrollView" && it.isVisibleToUser
            } ?: return findNode(ui, predicate)
            if (!scroll.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
                return findNode(ui, predicate)
            }
            SystemClock.sleep(120)
        }
        return findNode(ui, predicate)
    }

    private fun clickText(ui: UiAutomation, text: String) {
        assertTrue("Overlay control '$text' must respond to click", waitUntil {
            val target = scrollToNode(ui) {
                it.text?.toString()?.contains(text) == true && it.isEnabled
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

    private fun choosePayer(ui: UiAutomation, index: Int, label: String) {
        assertTrue("Payer spinner $index must be attached", waitUntil {
            val spinner = scrollToNode(ui) {
                it.className?.toString() == "android.widget.Spinner" &&
                    allNodes(ui).filter { node -> node.className?.toString() == "android.widget.Spinner" }.indexOf(it) == index
            } ?: return@waitUntil false
            spinner.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        })
        clickText(ui, label)
    }
}
