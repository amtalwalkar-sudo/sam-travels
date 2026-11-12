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
   DriverWorkflowIdentityTestFixtures.seed(db,"driver-fare-2","person-fare-2")
   val submitted=DriverTripFinancialStore.submit(db,"trip-fare-2",zero)
   assertEquals("submitted",submitted.getJSONObject("data").getString("status"))
   assertEquals("person-fare-2",submitted.getJSONObject("createdBy").getString("personId"))
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
 @Test fun nativeOverlayAndAndroidWebViewRoomClientsObserveTheSameFinancialRecords() {
  val context=ApplicationProvider.getApplicationContext<Context>()
  val name="completed-trip-paired-surfaces.db"
  context.deleteDatabase(name)
  val webView=Room.databaseBuilder(context,LocalDatabase::class.java,name).enableMultiInstanceInvalidation().allowMainThreadQueries().build()
  val overlay=Room.databaseBuilder(context,LocalDatabase::class.java,name).enableMultiInstanceInvalidation().allowMainThreadQueries().build()
  val invalidated=java.util.concurrent.CountDownLatch(1)
  val observer=object:androidx.room.InvalidationTracker.Observer("records") {
   override fun onInvalidated(tables:Set<String>) { invalidated.countDown() }
  }
  webView.invalidationTracker.addObserver(observer)
  try {
   val now=java.time.Instant.now().toString()
   DriverTripFinancialStore.createPendingObligation(overlay,"paired-surface-trip","paired-end-event",now,null)
   DriverTripFinancialStore.ensureDraft(overlay,"paired-surface-trip")
   DriverTripFinancialStore.updateDraft(overlay,"paired-surface-trip",JSONObject().put("farePaise",12345L))
   val obligationId="work:trip-financial-obligation:paired-surface-trip"
   val draftId="__sam_travels_form_working_copy__:work.trip-completed-financials:paired-surface-trip"
   assertEquals("completed_ride_financials",JSONObject(webView.records().get(obligationId)!!.json)
    .getJSONObject("data").getString("kind"))
   val draftEnvelope=JSONObject(webView.records().get(draftId)!!.json)
   assertEquals(12345L,draftEnvelope.getJSONObject("data").getJSONObject("values").getLong("farePaise"))
   assertTrue("Room multi-instance invalidation should notify the WebView-side client",invalidated.await(5,java.util.concurrent.TimeUnit.SECONDS))

   // Simulate the WebView RoomRecordRepository committing its generic working-copy envelope.
   val copy=draftEnvelope.getJSONObject("data")
   val values=copy.getJSONObject("values").put("farePaise",23456L)
   copy.put("values",values).put("revision",copy.getInt("revision")+1).put("updatedAt",now)
   draftEnvelope.put("data",copy).put("revision",draftEnvelope.getInt("revision")+1).put("updatedAt",now)
   webView.records().put(StoredRecord(draftId,draftEnvelope.toString(),1,now))
   assertEquals(23456L,DriverTripFinancialStore.ensureDraft(overlay,"paired-surface-trip")
    .getJSONObject("values").getLong("farePaise"))
  } finally {
   webView.invalidationTracker.removeObserver(observer)
   overlay.close()
   webView.close()
   context.deleteDatabase(name)
  }
 }


 @Test fun staleOverlaySubmissionCannotOverwriteNewerWebViewDraft() {
  val context=ApplicationProvider.getApplicationContext<Context>()
  val name="completed-trip-stale-cross-surface.db"
  context.deleteDatabase(name)
  val webView=Room.databaseBuilder(context,LocalDatabase::class.java,name).enableMultiInstanceInvalidation().allowMainThreadQueries().build()
  val overlay=Room.databaseBuilder(context,LocalDatabase::class.java,name).enableMultiInstanceInvalidation().allowMainThreadQueries().build()
  try {
   val now=java.time.Instant.now().toString()
   val tripId="stale-cross-surface-trip"
   DriverTripFinancialStore.createPendingObligation(overlay,tripId,"stale-cross-surface-end",now,null)
   DriverTripFinancialStore.ensureDraft(overlay,tripId)
   val overlayValues=JSONObject().put("farePaise",12345L)
   DriverTripFinancialStore.updateDraft(overlay,tripId,overlayValues)
   DriverWorkflowIdentityTestFixtures.seed(overlay,"driver-stale","person-stale")

   // The WebView client edits the same durable working copy after the overlay read.
   val webViewValues=JSONObject().put("farePaise",23456L)
   DriverTripFinancialStore.updateDraft(webView,tripId,webViewValues)

   assertTrue("A stale overlay submission must not replace the newer WebView draft",
    runCatching { DriverTripFinancialStore.submit(overlay,tripId,overlayValues) }.isFailure)
   val submitted=DriverTripFinancialStore.submit(webView,tripId,webViewValues)
   assertEquals("submitted",submitted.getJSONObject("data").getString("status"))
   assertEquals(23456L,submitted.getJSONObject("data").getLong("farePaise"))
   val persisted=JSONObject(webView.records().get("work:trip-financial-obligation:$tripId")!!.json)
    .getJSONObject("data")
   assertEquals("submitted",persisted.getString("status"))
   assertEquals(23456L,persisted.getLong("farePaise"))
  } finally {
   overlay.close()
   webView.close()
   context.deleteDatabase(name)
  }
 }
}
