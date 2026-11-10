package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DriverTripFinancialStoreTest {
 @Test fun completedRideCreatesRecoverableFareObligationAndWorkingCopy() {
  val db=Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(),LocalDatabase::class.java).allowMainThreadQueries().build()
  try {
   val now=java.time.Instant.now().toString()
   DriverTripFinancialStore.createPendingObligation(db,"trip-fare-1","end-ride-1",now,JSONObject().put("shiftId","shift-1"))
   val obligation=DriverTripFinancialStore.pendingObligations(db).single()
   assertEquals("completed_ride_financials",obligation.getJSONObject("data").getString("kind"))
   assertEquals("pending",obligation.getJSONObject("data").getString("status"))
   val draft=DriverTripFinancialStore.ensureDraft(db,"trip-fare-1")
   assertEquals("work.trip-completed-financials",draft.getString("formId"))
   assertEquals("in_progress",draft.getString("status"))
   assertTrue(!draft.getJSONObject("values").has("farePaise"))
  } finally { db.close() }
 }

 @Test fun fareZeroIsValidAndPayerWithoutAmountIsRejected() {
  val db=Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(),LocalDatabase::class.java).allowMainThreadQueries().build()
  try {
   val now=java.time.Instant.now().toString()
   DriverTripFinancialStore.createPendingObligation(db,"trip-fare-2","end-ride-2",now,null)
   DriverTripFinancialStore.ensureDraft(db,"trip-fare-2")
   val zero=JSONObject().put("farePaise",0L)
   DriverTripFinancialStore.updateDraft(db,"trip-fare-2",zero)
   assertEquals("submitted",DriverTripFinancialStore.submit(db,"trip-fare-2",zero).getJSONObject("data").getString("status"))
   assertTrue(runCatching {
    DriverTripFinancialStore.updateDraft(db,"trip-fare-2",JSONObject().put("farePaise",100L).put("tollPayer","driver"))
   }.isFailure)
  } finally { db.close() }
 }

 @Test fun completedRideObligationAndDraftSurvivePersistentRoomReopen() {
  val context=ApplicationProvider.getApplicationContext<Context>()
  val name="completed-trip-financial-reopen.db"
  context.deleteDatabase(name)
  try {
   val first=Room.databaseBuilder(context,LocalDatabase::class.java,name).allowMainThreadQueries().build()
   val now=java.time.Instant.now().toString()
   DriverTripFinancialStore.createPendingObligation(first,"reopen-fare-trip","reopen-end-event",now,null)
   DriverTripFinancialStore.ensureDraft(first,"reopen-fare-trip")
   DriverTripFinancialStore.updateDraft(first,"reopen-fare-trip",JSONObject().put("farePaise",0L))
   first.close()
   val reopened=Room.databaseBuilder(context,LocalDatabase::class.java,name).allowMainThreadQueries().build()
   try {
    val obligation=DriverTripFinancialStore.pendingObligations(reopened).single()
    assertEquals("reopen-fare-trip",obligation.getJSONObject("data").getString("tripId"))
    val draft=DriverTripFinancialStore.ensureDraft(reopened,"reopen-fare-trip")
    assertEquals(0L,draft.getJSONObject("values").getLong("farePaise"))
    assertEquals("in_progress",draft.getString("status"))
   } finally { reopened.close() }
  } finally { context.deleteDatabase(name) }
 }

 @Test fun completedRideObligationAndDraftSurviveNativeBackupRestore() {
  val db=Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(),LocalDatabase::class.java).allowMainThreadQueries().build()
  try {
   val now=java.time.Instant.now().toString()
   DriverTripFinancialStore.createPendingObligation(db,"backup-fare-trip","backup-end-event",now,null)
   DriverTripFinancialStore.ensureDraft(db,"backup-fare-trip")
   DriverTripFinancialStore.updateDraft(db,"backup-fare-trip",JSONObject().put("farePaise",0L))
   val snapshot=NativeBackupCoverage.exportBusinessRecords(db){false}
   val ids=(0 until snapshot.length()).map{snapshot.getJSONObject(it).getString("id")}
   assertTrue(ids.contains("work:trip-financial-obligation:backup-fare-trip"))
   assertTrue(ids.contains("__sam_travels_form_working_copy__:work.trip-completed-financials:backup-fare-trip"))
   db.runInTransaction { NativeBackupCoverage.replaceBusinessRecords(db,JSONArray()) }
   db.runInTransaction { NativeBackupCoverage.replaceBusinessRecords(db,snapshot) }
   assertEquals("pending",DriverTripFinancialStore.pendingObligations(db).single().getJSONObject("data").getString("status"))
   assertEquals(0L,DriverTripFinancialStore.ensureDraft(db,"backup-fare-trip").getJSONObject("values").getLong("farePaise"))
  } finally { db.close() }
 }
}
