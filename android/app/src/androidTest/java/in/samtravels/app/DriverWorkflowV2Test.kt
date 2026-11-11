package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverWorkflowV2Test {
    private val db=Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),LocalDatabase::class.java,
    ).allowMainThreadQueries().build()
    @After fun closeDatabase()=db.close()
    private fun gps()=JSONObject().put("latitude",19.076).put("longitude",72.8777)
        .put("horizontalAccuracyM",8).put("fixAt",java.time.Instant.now().toString()).put("provider","android-test")

    @Test fun missingWorkSelectionDoesNotPartiallyCommitShiftStart() {
        val id="missing-selection-v2"
        val command=JSONObject().put("schemaVersion",1).put("workflowVersion",2)
            .put("commandId",id).put("eventId",id).put("eventType","shift_start")
            .put("originSurface","native_overlay").put("transitionAt",java.time.Instant.now().toString())
            .put("expectedPriorState","idle").put("expectedRevision",0).put("idempotencyKey",id)
        DriverWorkflowStore.queue(db,command)
        val failure=runCatching { DriverWorkflowStore.complete(db,id,gps()) }.exceptionOrNull()
        assertEquals("work_driver_not_selected",failure?.message)
        assertEquals("idle",DriverWorkflowStore.snapshot(db).getString("state"))
        assertEquals(0,DriverWorkflowStore.snapshot(db).getInt("revision"))
        assertTrue(DriverWorkflowStore.listEvents(db).isEmpty())
        assertTrue(db.records().list().none { it.id.startsWith("driver-outbox:") })
    }

    @Test fun operationalDateUsesExactIndiaFourAmBoundary() {
        assertEquals("2026-11-08",DriverWorkflowStore.operationalDateAt("2026-11-08T22:29:59Z"))
        assertEquals("2026-11-09",DriverWorkflowStore.operationalDateAt("2026-11-08T22:30:00Z"))
    }

    @Test fun v2CapturesShiftAndTripContextAndLocksSelectedDriverUntilShiftEnd() {
        val now=java.time.Instant.now()
        val created=now.minusSeconds(120).toString()
        fun putFeatureRecord(id:String,data:JSONObject) {
            val envelope=JSONObject().put("id",id).put("schemaVersion",1).put("createdAt",created)
                .put("updatedAt",created).put("source","android").put("revision",1).put("data",data)
            db.records().put(StoredRecord(id,envelope.toString(),1,created))
        }
        putFeatureRecord("work:selected-driver",JSONObject().put("schemaVersion",1).put("driverId","driver-v2"))
        putFeatureRecord("identity:driver-person-link:driver-v2",JSONObject().put("schemaVersion",1).put("driverId","driver-v2").put("personId","person-v2"))
        putFeatureRecord("identity:person:person-v2",JSONObject().put("schemaVersion",1).put("personId","person-v2")
            .put("displayName","Driver V2").put("roles",org.json.JSONArray().put("driver")).put("status","active"))
        putFeatureRecord("feature:driver-records:driver:driver-v2",JSONObject().put("schemaVersion",1)
            .put("driverId","driver-v2").put("name","Driver V2").put("lifecycleState","active"))
        putFeatureRecord("feature:driver-records:assignment:driver-v2",JSONObject().put("schemaVersion",1)
            .put("driverId","driver-v2").put("assignments",org.json.JSONArray().put(JSONObject()
                .put("assignmentId","assignment-v2").put("vehicleId","feature:vehicle:MH01AB1234")
                .put("assignedAt",created))))
        putFeatureRecord("feature:vehicle:MH01AB1234",JSONObject().put("schemaVersion",1)
            .put("registrationNumber","MH01AB1234").put("make","Make").put("model","Model")
            .put("vehicleType","Sedan").put("fuelType","Petrol").put("yearOfManufacture",2024)
            .put("ownership","Owned").put("lifecycleState","active"))

        fun v2Command(id:String,event:String,state:String,revision:Int)=JSONObject()
            .put("schemaVersion",1).put("workflowVersion",2).put("commandId",id).put("eventId",id)
            .put("eventType",event).put("originSurface","native_overlay").put("transitionAt",java.time.Instant.now().toString())
            .put("expectedPriorState",state).put("expectedRevision",revision).put("idempotencyKey",id)
        fun run(id:String,event:String,state:String,revision:Int):JSONObject {
            DriverWorkflowStore.queue(db,v2Command(id,event,state,revision))
            return DriverWorkflowStore.complete(db,id,gps())
        }

        val started=run("shift-v2","shift_start","idle",0)
        assertEquals("shift-v2",started.getString("shiftId"))
        assertEquals("driver-v2",started.getJSONObject("shiftContext").getString("driverId"))
        val selectedAfterStart=JSONObject(db.records().get("work:selected-driver")!!.json).getJSONObject("data")
        assertEquals("shift-v2",selectedAfterStart.getString("lockedShiftId"))

        // Later Admin edits must not rewrite the context already captured by Work.
        putFeatureRecord("feature:driver-records:driver:driver-v2",JSONObject().put("schemaVersion",1)
            .put("driverId","driver-v2").put("name","Driver V2").put("lifecycleState","inactive"))
        putFeatureRecord("feature:vehicle:MH01AB1234",JSONObject().put("schemaVersion",1)
            .put("registrationNumber","MH01AB1234").put("make","Make").put("model","Model")
            .put("vehicleType","Sedan").put("fuelType","Petrol").put("yearOfManufacture",2024)
            .put("ownership","Owned").put("lifecycleState","inactive"))

        val pickup=run("trip-v2","trip_create","shift_active",1)
        assertEquals("going_to_pickup",pickup.getString("state"))
        assertEquals("shift-v2",pickup.getJSONObject("tripContext").getString("shiftId"))
        assertEquals("assignment-v2",pickup.getJSONObject("tripContext").getString("assignmentId"))
        assertTrue(pickup.getJSONObject("tripContext").getString("operationalDate").matches(Regex("\\d{4}-\\d{2}-\\d{2}")))

        val riding=run("ride-start-v2","start_ride","going_to_pickup",2)
        assertEquals("trip_active",riding.getString("state"))
        val ended=run("ride-end-v2","end_ride","trip_active",3)
        assertEquals("shift_active",ended.getString("state"))
        val secondPickup=run("trip-v2-cancel","trip_create","shift_active",4)
        assertEquals("going_to_pickup",secondPickup.getString("state"))
        val cancelled=run("ride-cancel-v2","cancel_ride","going_to_pickup",5)
        assertEquals("shift_active",cancelled.getString("state"))
        DriverCancellationFeeStore.ensureCancellationFeeDraft(db,"trip-v2-cancel")
        DriverCancellationFeeStore.updateCancellationFeeDraft(db,"trip-v2-cancel",0L)
        DriverCancellationFeeStore.submitCancellationFee(db,"trip-v2-cancel",0L)
        val shiftEnded=run("shift-end-v2","shift_end","shift_active",6)
        assertEquals("idle",shiftEnded.getString("state"))
        val selectedAfterEnd=JSONObject(db.records().get("work:selected-driver")!!.json).getJSONObject("data")
        assertFalse(selectedAfterEnd.has("lockedShiftId"))
        val events=DriverWorkflowStore.listEvents(db)
        assertEquals(7,events.size)
        assertTrue(JSONObject(events.first { it.optString("eventId")=="shift-v2" }.toString())
            .getJSONObject("command").has("driverContext"))
        assertTrue(JSONObject(events.first { it.optString("eventId")=="trip-v2" }.toString())
            .getJSONObject("command").has("tripContext"))
        assertTrue(events.any { it.optString("eventId")=="ride-cancel-v2" })
        assertEquals("trip_create",events.first { it.optString("eventId")=="trip-v2" }.getJSONObject("command").getString("eventType"))
        assertEquals("start_ride",events.first { it.optString("eventId")=="ride-start-v2" }.getJSONObject("command").getString("eventType"))
        assertEquals("end_ride",events.first { it.optString("eventId")=="ride-end-v2" }.getJSONObject("command").getString("eventType"))
        assertEquals("cancel_ride",events.first { it.optString("eventId")=="ride-cancel-v2" }.getJSONObject("command").getString("eventType"))
    }

    @Test fun nativeSwipeActionFollowsThePersistedWorkflowState() {
        assertEquals("trip_create", DriverTransitionPolicy.swipeEvent("shift_active"))
        assertEquals("start_ride", DriverTransitionPolicy.swipeEvent("going_to_pickup"))
        assertEquals("end_ride", DriverTransitionPolicy.swipeEvent("trip_active"))
        assertNull(DriverTransitionPolicy.swipeEvent("idle"))
        assertNull(DriverTransitionPolicy.swipeEvent("needs_attention"))
    }


}
