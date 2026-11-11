package `in`.samtravels.app

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

/** Recovery-focused attached-window acceptance, kept separate from gesture presentation tests. */
@RunWith(AndroidJUnit4::class)
class DriverOverlayServiceRecoveryPresentationTest : DriverOverlayServicePresentationTestSupport() {
    @Test fun overlayStartupRecoveryRetainsExpiredPendingIntentForAttention() {
        val tripId = "overlay-startup-recovery-permission"
        withAttachedOverlay(tripId, { db, now ->
            DriverTripFinancialStore.createPendingObligation(db, tripId, "overlay-startup-financial-event", now, null)
            DriverTripFinancialStore.ensureDraft(db, tripId)
        }) { ui, db ->
            val transitionAt = java.time.Instant.now().minusSeconds(120).toString()
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

            restartOverlayService(InstrumentationRegistry.getInstrumentation().targetContext)

            assertTrue("Native service startup must recover the pending intent and retain it for attention", waitUntil {
                val row = db.records().get("driver-intent:$commandId") ?: return@waitUntil false
                val intent = JSONObject(row.json)
                intent.optString("status") == "needs_attention" &&
                    intent.optString("reason") == "gps_recovery_window_expired"
            })
            assertEquals("Permission loss must not commit a trip transition", revisionBefore,
                DriverWorkflowStore.snapshot(db).optInt("revision"))
            assertEquals("Permission loss must not append a workflow event", eventsBefore,
                DriverWorkflowStore.listEvents(db).size)
            assertEquals("Pending intent must remain durable for later recovery", commandId,
                JSONObject(db.records().get("driver-intent:$commandId")!!.json)
                    .getJSONObject("command").getString("eventId"))
            db.records().remove("driver-intent:$commandId")
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
            assertTrue("Completed-ride working copy must commit the edited values before service recreation", waitUntil {
                val row = db.records().get("__sam_travels_form_working_copy__:work.trip-completed-financials:$tripId")
                    ?: return@waitUntil false
                val values = JSONObject(row.json).getJSONObject("data").getJSONObject("values")
                values.optLong("farePaise", -1L) == 3125L &&
                    values.optLong("tollPaise", -1L) == 450L &&
                    values.optString("tollPayer") == "customer" &&
                    values.optLong("parkingPaise", -1L) == 275L &&
                    values.optString("parkingPayer") == "driver"
            })
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
            assertTrue("Cancellation-fee working copy must commit the edited value before service recreation", waitUntil {
                val row = db.records().get("__sam_travels_form_working_copy__:work.trip-cancellation-fee:$tripId")
                    ?: return@waitUntil false
                val values = JSONObject(row.json).getJSONObject("data").getJSONObject("values")
                values.optLong("cancellationFeePaise", -1L) == 1860L
            })
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


}
