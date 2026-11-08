package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

        val pickup=run("trip-v2","trip_create","shift_active",1)
        assertEquals("going_to_pickup",pickup.getString("state"))
        assertEquals("shift-v2",pickup.getJSONObject("tripContext").getString("shiftId"))
        assertEquals("assignment-v2",pickup.getJSONObject("tripContext").getString("assignmentId"))
        assertTrue(pickup.getJSONObject("tripContext").getString("operationalDate").matches(Regex("\\d{4}-\\d{2}-\\d{2}")))

        val riding=run("ride-start-v2","start_ride","going_to_pickup",2)
        assertEquals("trip_active",riding.getString("state"))
        val ended=run("ride-end-v2","end_ride","trip_active",3)
        assertEquals("shift_active",ended.getString("state"))
        val shiftEnded=run("shift-end-v2","shift_end","shift_active",4)
        assertEquals("idle",shiftEnded.getString("state"))
        val selectedAfterEnd=JSONObject(db.records().get("work:selected-driver")!!.json).getJSONObject("data")
        assertFalse(selectedAfterEnd.has("lockedShiftId"))
        val events=DriverWorkflowStore.listEvents(db)
        assertEquals(5,events.size)
        assertTrue(JSONObject(events.first { it.optString("eventId")=="shift-v2" }.toString())
            .getJSONObject("command").has("driverContext"))
        assertTrue(JSONObject(events.first { it.optString("eventId")=="trip-v2" }.toString())
            .getJSONObject("command").has("tripContext"))
    }


}
