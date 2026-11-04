package `in`.samtravels.app
import androidx.room.Room
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
   assertEquals(2,db.openHelper.readableDatabase.version)
  } finally { db.close() }
 }
}