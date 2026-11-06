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
 }
}
