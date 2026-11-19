package `in`.samtravels.app
import androidx.room.Room
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import android.content.Context
import org.junit.Assert.assertEquals
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

}
