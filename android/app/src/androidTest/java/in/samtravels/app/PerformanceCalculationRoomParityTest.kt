package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PerformanceCalculationRoomParityTest {
    @Test fun roomPreservesTheSameSharedPerformanceFixtureEnvelopes() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val fixture = context.assets.open("performance-calculation-v1-parity.json")
            .bufferedReader().use { JSONObject(it.readText()) }
        val records = fixture.getJSONArray("records")
        val expected = fixture.getJSONObject("expected")
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            for (index in 0 until records.length()) {
                val record = records.getJSONObject(index)
                RecordEnvelopeContract.validate(record)
                db.records().put(StoredRecord(
                    record.getString("id"),
                    record.toString(),
                    record.getInt("schemaVersion"),
                    record.getString("updatedAt"),
                ))
            }
            assertEquals(records.length(), db.records().list().size)
            for (index in 0 until records.length()) {
                val source = records.getJSONObject(index)
                val restored = db.records().get(source.getString("id"))
                assertNotNull(restored)
                val restoredEnvelope = JSONObject(restored!!.json)
                assertEquals(source.getString("id"), restoredEnvelope.getString("id"))
                assertEquals(source.getInt("revision"), restoredEnvelope.getInt("revision"))
                assertEquals(source.getJSONObject("data").toString(),
                    restoredEnvelope.getJSONObject("data").toString())
            }
            // These expected values are consumed by the TypeScript browser test,
            // which runs the shared platform-neutral calculation against this
            // same fixture. Room must preserve the exact source records supplied
            // to that calculation, including source revisions.
            assertEquals(30_000, expected.getInt("recoveryTotalPaise"))
            assertEquals("2027-09-15", expected.getString("recoveryToExclusive"))
            assertEquals(-4_000, expected.getInt("lifetimeProfitPaise"))
        } finally {
            db.close()
        }
    }
}
