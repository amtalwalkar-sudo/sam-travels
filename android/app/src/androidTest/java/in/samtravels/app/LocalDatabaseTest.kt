package `in`.samtravels.app
import androidx.room.Room
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
@RunWith(AndroidJUnit4::class)
class LocalDatabaseTest {
 @Test fun versionedRecordsRoundTrip() {
  val context=ApplicationProvider.getApplicationContext<Context>()
  val db=Room.inMemoryDatabaseBuilder(context,LocalDatabase::class.java).allowMainThreadQueries().build()
  try {
   val record=StoredRecord("test-1","{\"value\":42}",1,"2026-11-03T00:00:00Z")
   db.records().put(record)
   assertEquals(record,db.records().get("test-1"))
   assertEquals(3,db.openHelper.readableDatabase.version)
  } finally { db.close() }
 }

 @Test fun atomicRecordCompareAndSetPersistsAcrossDatabaseReopen() = runBlocking {
  val context=ApplicationProvider.getApplicationContext<Context>()
  val name="lifecycle-cas-test.db"
  context.deleteDatabase(name)
  fun record(revision:Int,value:Int)=JSONObject()
   .put("id","platform:feature-lifecycle")
   .put("schemaVersion",1)
   .put("createdAt","2026-11-06T00:00:00Z")
   .put("updatedAt","2026-11-06T00:00:00Z")
   .put("source","integration")
   .put("revision",revision)
   .put("data",JSONObject().put("value",value))
  try {
   var db=Room.databaseBuilder(context,LocalDatabase::class.java,name).build()
   try {
    assertEquals(true,compareAndSetStoredRecord(db,"platform:feature-lifecycle",-1,record(1,1)))
    assertEquals(false,compareAndSetStoredRecord(db,"platform:feature-lifecycle",-1,record(1,2)))
    assertEquals(false,compareAndSetStoredRecord(db,"platform:feature-lifecycle",0,record(2,2)))
    assertEquals(true,compareAndSetStoredRecord(db,"platform:feature-lifecycle",1,record(2,2)))
   } finally { db.close() }
   db=Room.databaseBuilder(context,LocalDatabase::class.java,name).build()
   try {
    val stored=db.records().get("platform:feature-lifecycle")
    assertEquals(2,JSONObject(stored!!.json).getInt("revision"))
    assertEquals(2,JSONObject(stored.json).getJSONObject("data").getInt("value"))
   } finally { db.close() }
  } finally { context.deleteDatabase(name) }
 }

 @Test fun formOperationReceiptAndBusinessRecordCommitAtomicallyAcrossReopen() = runBlocking {
  val context=ApplicationProvider.getApplicationContext<Context>()
  val name="form-operation-receipt-test.db"
  context.deleteDatabase(name)
  fun envelope(id:String,revision:Int,data:JSONObject)=JSONObject()
   .put("id",id).put("schemaVersion",1)
   .put("createdAt","2026-11-19T04:00:00.000Z")
   .put("updatedAt","2026-11-19T04:00:00.000Z")
   .put("source","android").put("revision",revision).put("data",data)
  val businessId="feature:vehicle:FORM-RECEIPT-TEST"
  val receiptId="__sam_travels_feature_operation__:form-room-operation"
  val business=envelope(businessId,1,JSONObject().put("registrationNumber","FORM-RECEIPT-TEST").put("make","Test"))
  val receiptData=JSONObject()
   .put("schemaVersion",1).put("kind","feature_record_operation_receipt")
   .put("operationId","form-room-operation").put("payloadFingerprint","canonical-form-payload")
   .put("action","create").put("targetRecordId",businessId).put("result",business)
  val receipt=envelope(receiptId,1,receiptData)
  try {
   var db=Room.databaseBuilder(context,LocalDatabase::class.java,name).build()
   try {
    assertTrue(commitFeatureUpgradeBatch(db,JSONArray().put(business).put(receipt),JSONArray(),
     JSONObject().put(businessId,-1).put(receiptId,-1)))
   } finally { db.close() }
   db=Room.databaseBuilder(context,LocalDatabase::class.java,name).build()
   try {
    assertEquals(1,JSONObject(db.records().get(businessId)!!.json).getInt("revision"))
    val storedReceipt=JSONObject(db.records().get(receiptId)!!.json).getJSONObject("data")
    assertEquals("canonical-form-payload",storedReceipt.getString("payloadFingerprint"))
    assertEquals(businessId,storedReceipt.getString("targetRecordId"))
    assertFalse(commitFeatureUpgradeBatch(db,JSONArray().put(business).put(receipt),JSONArray(),
     JSONObject().put(businessId,-1).put(receiptId,-1)))
    assertEquals(1,JSONObject(db.records().get(businessId)!!.json).getInt("revision"))
   } finally { db.close() }
  } finally { context.deleteDatabase(name) }
 }

 @Test fun pendingAdminCreateUpdateAndFuelOperationsRecoverFromRoomAfterProcessRestart() = runBlocking {
  val context=ApplicationProvider.getApplicationContext<Context>()
  suspend fun verifyRecovery(name:String, formId:String, instanceId:String, operationId:String,
   action:String, targetId:String, create:Boolean) {
   context.deleteDatabase(name)
   val copyId="__sam_travels_form_working_copy__:"+java.net.URLEncoder.encode(formId,"UTF-8")+":"+
    java.net.URLEncoder.encode(instanceId,"UTF-8")
   val receiptId="__sam_travels_feature_operation__:"+java.net.URLEncoder.encode(operationId,"UTF-8")
   fun envelope(id:String,revision:Int,data:JSONObject,at:String="2026-11-19T09:00:00.000Z")=JSONObject()
    .put("id",id).put("schemaVersion",1).put("createdAt",at).put("updatedAt",at)
    .put("source","android").put("revision",revision).put("data",data)
   val pending=envelope(copyId,1,JSONObject()
    .put("formId",formId).put("formVersion",1).put("instanceId",instanceId).put("revision",3)
    .put("status","pending").put("operationId",operationId).put("values",JSONObject().put("value",42))
    .put("submission",JSONObject().put("action",action).put("payloadFingerprint","fingerprint-$operationId")
     .put("submittedAt","2026-11-19T09:00:00.000Z").put("values",JSONObject().put("value",42))))
   val before=JSONObject().put("id",targetId).put("schemaVersion",1).put("createdAt","2026-11-19T08:00:00.000Z")
    .put("updatedAt","2026-11-19T08:00:00.000Z").put("source","android").put("revision",1)
    .put("data",JSONObject().put("value",1))
   val next=envelope(targetId,if(create) 1 else 2,JSONObject().put("value",if(create) 42 else 2))
   val receipt=envelope(receiptId,1,JSONObject().put("schemaVersion",1)
    .put("kind","feature_record_operation_receipt").put("operationId",operationId)
    .put("payloadFingerprint","fingerprint-$operationId").put("action",if(create) "create" else "update")
    .put("targetRecordId",targetId).put("result",next))
   try {
    var db=Room.databaseBuilder(context,LocalDatabase::class.java,name).build()
    try {
     if(!create) assertTrue(compareAndSetStoredRecord(db,targetId,-1,before))
     assertTrue(compareAndSetStoredRecord(db,copyId,-1,pending))
     assertTrue(commitFeatureUpgradeBatch(db,JSONArray().put(next).put(receipt),JSONArray(),
      JSONObject().put(targetId,if(create) -1 else 1).put(receiptId,-1)))
    } finally { db.close() }
    db=Room.databaseBuilder(context,LocalDatabase::class.java,name).build()
    try {
     val recoveredCopy=JSONObject(db.records().get(copyId)!!.json)
     assertEquals("pending",recoveredCopy.getJSONObject("data").getString("status"))
     val recoveredReceipt=JSONObject(db.records().get(receiptId)!!.json).getJSONObject("data")
     assertEquals(operationId,recoveredReceipt.getString("operationId"))
     assertEquals(targetId,recoveredReceipt.getString("targetRecordId"))
     assertEquals("fingerprint-$operationId",recoveredReceipt.getString("payloadFingerprint"))
     val recoveredTarget=JSONObject(db.records().get(targetId)!!.json)
     assertEquals(if(create) 1 else 2,recoveredTarget.getInt("revision"))
     // The reopened command observes its receipt and returns the original result;
     // it must not issue a second feature mutation.
     assertEquals(recoveredReceipt.getJSONObject("result").toString(),
      JSONObject(db.records().get(targetId)!!.json).toString())
     val completedData=recoveredCopy.getJSONObject("data").put("status","saved")
     val completed=envelope(copyId,2,completedData,"2026-11-19T09:01:00.000Z")
     assertTrue(compareAndSetStoredRecord(db,copyId,1,completed))
     assertEquals("saved",JSONObject(db.records().get(copyId)!!.json).getJSONObject("data").getString("status"))
    } finally { db.close() }
   } finally { context.deleteDatabase(name) }
  }
  verifyRecovery("room-admin-create-recovery.db","admin.vehicle","new:ROOM-CREATE","room-admin-create","save",
   "feature:vehicle:ROOM-CREATE",true)
  verifyRecovery("room-admin-update-recovery.db","admin.vehicle","feature:vehicle:ROOM-UPDATE","room-admin-update","save",
   "feature:vehicle:ROOM-UPDATE",false)
  verifyRecovery("room-fuel-recovery.db","driver.fuel-entry","fuel-room-instance","room-fuel-submit","submit",
   "feature:business-expenses:fuel:ROOM-FUEL",true)
 }

}
