package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DriverTripFinancialStoreTest {
 @Test fun completedRideCreatesRecoverableFareObligationAndWorkingCopy(){val db=Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(),LocalDatabase::class.java).allowMainThreadQueries().build();try{val now=java.time.Instant.now().toString();DriverTripFinancialStore.createPendingObligation(db,"trip-fare-1","end-ride-1",now,JSONObject().put("shiftId","shift-1"));val obligation=DriverTripFinancialStore.pendingObligations(db).single();assertEquals("completed_ride_financials",obligation.getJSONObject("data").getString("kind"));assertEquals("pending",obligation.getJSONObject("data").getString("status"));val draft=DriverTripFinancialStore.ensureDraft(db,"trip-fare-1");assertEquals("work.trip-completed-financials",draft.getString("formId"));assertEquals("in_progress",draft.getString("status"));assertTrue(!draft.getJSONObject("values").has("farePaise"))}finally{db.close()} }
 @Test fun fareZeroIsValidAndPayerWithoutAmountIsRejected(){val db=Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(),LocalDatabase::class.java).allowMainThreadQueries().build();try{val now=java.time.Instant.now().toString();DriverTripFinancialStore.createPendingObligation(db,"trip-fare-2","end-ride-2",now,null);DriverTripFinancialStore.ensureDraft(db,"trip-fare-2");val zero=JSONObject().put("farePaise",0L);DriverTripFinancialStore.updateDraft(db,"trip-fare-2",zero);assertEquals("submitted",DriverTripFinancialStore.submit(db,"trip-fare-2",zero).getJSONObject("data").getString("status"));assertTrue(runCatching{DriverTripFinancialStore.updateDraft(db,"trip-fare-2",JSONObject().put("farePaise",100L).put("tollPayer","driver"))}.isFailure)}finally{db.close()} }
}
