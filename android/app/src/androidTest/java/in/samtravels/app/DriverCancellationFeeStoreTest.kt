package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverCancellationFeeStoreTest {
    private val db=Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(),LocalDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After fun closeDatabase()=db.close()

    private fun gps()=JSONObject().put("latitude",19.076).put("longitude",72.8777)
        .put("horizontalAccuracyM",8.0).put("fixAt",java.time.Instant.now().toString()).put("provider","android-test")

    private fun v2Command(id:String,event:String,prior:String,revision:Int,at:String)=JSONObject()
        .put("schemaVersion",1).put("workflowVersion",2).put("commandId",id).put("eventId",id)
        .put("eventType",event).put("originSurface","native_overlay").put("transitionAt",at)
        .put("expectedPriorState",prior).put("expectedRevision",revision).put("idempotencyKey",id)

    @Test fun pendingCancellationFeeAndDraftSurviveDatabaseReopen() {
        val context=ApplicationProvider.getApplicationContext<Context>()
        val name="cancellation-fee-reopen-test.db"
        context.deleteDatabase(name)
        try {
            val first=Room.databaseBuilder(context,LocalDatabase::class.java,name)
                .allowMainThreadQueries().build()
            DriverCancellationFeeStore.createPendingObligation(first,"reopen-trip","reopen-cancel-event",
                java.time.Instant.now().toString())
            DriverCancellationFeeStore.ensureCancellationFeeDraft(first,"reopen-trip")
            DriverCancellationFeeStore.updateCancellationFeeDraft(first,"reopen-trip",0L)
            first.close()

            val reopened=Room.databaseBuilder(context,LocalDatabase::class.java,name)
                .allowMainThreadQueries().build()
            try {
                val obligation=DriverCancellationFeeStore.pendingObligation(reopened)
                    ?: error("cancellation_fee_obligation_not_recovered")
                assertEquals("pending",obligation.getJSONObject("data").getString("status"))
                val draft=DriverCancellationFeeStore.ensureCancellationFeeDraft(reopened,"reopen-trip")
                assertEquals(0L,draft.getJSONObject("values").getLong("cancellationFeePaise"))
                assertEquals("in_progress",draft.getString("status"))
            } finally { reopened.close() }
        } finally { context.deleteDatabase(name) }
    }

    @Test fun cancellationRequiresZeroValidFeeBeforeShiftCanEnd() {
        val now=java.time.Instant.now().toString()
        val context=JSONObject().put("schemaVersion",1).put("driverId","driver-1")
            .put("assignmentId","assignment-1").put("vehicleId","feature:vehicle:vehicle-1")
        val state=JSONObject().put("schemaVersion",1).put("revision",1).put("state","shift_active")
            .put("shiftStartedAt",now).put("shiftStartOdometerKm",100).put("lastConfirmedOdometerKm",100).put("shiftId","shift-1").put("shiftContext",context)
        db.records().put(StoredRecord("driver-state",JSONObject().put("value",state).toString(),1,now))
        val selected=JSONObject().put("id","work:selected-driver").put("schemaVersion",1)
            .put("createdAt",now).put("updatedAt",now).put("source","android").put("revision",1)
            .put("data",JSONObject().put("schemaVersion",1).put("driverId","driver-1").put("lockedShiftId","shift-1"))
        db.records().put(StoredRecord("work:selected-driver",selected.toString(),1,now))
        DriverWorkflowIdentityTestFixtures.seedLink(db, "driver-1", "person-1")

        val create=v2Command("trip-1","trip_create","shift_active",1,java.time.Instant.now().toString())
        DriverWorkflowStore.queue(db,create)
        DriverWorkflowStore.complete(db,"trip-1",gps())
        val cancel=v2Command("cancel-1","cancel_ride","going_to_pickup",2,java.time.Instant.now().toString())
        DriverWorkflowStore.queue(db,cancel)
        DriverWorkflowStore.complete(db,"cancel-1",gps())

        val obligation=JSONObject(db.records().get("work:trip-financial-obligation:trip-1")!!.json)
        assertEquals("pending",obligation.getJSONObject("data").getString("status"))
        assertFalse(obligation.getJSONObject("data").has("toll"))
        assertFalse(obligation.getJSONObject("data").has("parking"))

        val end=v2Command("shift-end-1","shift_end","shift_active",3,java.time.Instant.now().toString())\n            .put("odometer",JSONObject().put("schemaVersion",1).put("readingKm",100).put("businessKm",0))
        assertEquals("trip_cancellation_fee_required",
            runCatching { DriverWorkflowStore.queue(db,end) }.exceptionOrNull()?.message)

        DriverCancellationFeeStore.ensureCancellationFeeDraft(db,"trip-1")
        DriverCancellationFeeStore.updateCancellationFeeDraft(db,"trip-1",0L)
        val saved=DriverCancellationFeeStore.submitCancellationFee(db,"trip-1",0L)
        assertEquals("submitted",saved.getJSONObject("data").getString("status"))
        assertEquals(0L,saved.getJSONObject("data").getLong("feePaise"))
        assertEquals("person-1", saved.getJSONObject("createdBy").getString("personId"))
        assertEquals("submitted",JSONObject(db.records().get(
            "__sam_travels_form_working_copy__:work.trip-cancellation-fee:trip-1")!!.json)
            .getJSONObject("data").getString("status"))

        DriverWorkflowStore.queue(db,end)
        val ended=DriverWorkflowStore.complete(db,"shift-end-1",gps())
        assertEquals("idle",ended.getString("state"))
    }

    @Test fun endRideCreatesCompletedTripFinancialObligation() {
        val now=java.time.Instant.now().toString()
        DriverWorkflowIdentityTestFixtures.seed(db, "driver-1", "person-1")
        val context=JSONObject().put("schemaVersion",1).put("driverId","driver-1")
            .put("assignmentId","assignment-1").put("vehicleId","feature:vehicle:vehicle-1")
        val state=JSONObject().put("schemaVersion",1).put("revision",1).put("state","shift_active")
            .put("shiftStartedAt",now).put("shiftId","shift-1").put("shiftContext",context)
        db.records().put(StoredRecord("driver-state",JSONObject().put("value",state).toString(),1,now))
        val selected=JSONObject().put("id","work:selected-driver").put("schemaVersion",1)
            .put("createdAt",now).put("updatedAt",now).put("source","android").put("revision",1)
            .put("data",JSONObject().put("schemaVersion",1).put("driverId","driver-1").put("lockedShiftId","shift-1"))
        db.records().put(StoredRecord("work:selected-driver",selected.toString(),1,now))

        val create=v2Command("fare-trip-1","trip_create","shift_active",1,java.time.Instant.now().toString())
        DriverWorkflowStore.queue(db,create)
        DriverWorkflowStore.complete(db,"fare-trip-1",gps())
        val start=v2Command("fare-start-1","start_ride","going_to_pickup",2,java.time.Instant.now().toString())
        DriverWorkflowStore.queue(db,start)
        DriverWorkflowStore.complete(db,"fare-start-1",gps())
        val end=v2Command("fare-end-1","end_ride","trip_active",3,java.time.Instant.now().toString())
        DriverWorkflowStore.queue(db,end)
        val completed=DriverWorkflowStore.complete(db,"fare-end-1",gps())
        assertEquals("shift_active",completed.getString("state"))

        val obligation=JSONObject(db.records().get("work:trip-financial-obligation:fare-trip-1")!!.json)
            .getJSONObject("data")
        assertEquals("completed_ride_financials",obligation.getString("kind"))
        assertEquals("pending",obligation.getString("status"))
        assertEquals("fare-end-1",obligation.getString("endRideEventId"))
        assertFalse(obligation.has("tollPaise"))
        assertFalse(obligation.has("parkingPaise"))
    }

}
