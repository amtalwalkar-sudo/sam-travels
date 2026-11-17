package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PerformanceCalculationRoomParityTest {
    @Test fun roomPreservesTheSameSharedPerformanceFixtureEnvelopes() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val fixture = InstrumentationRegistry.getInstrumentation().context.assets.open("performance-calculation-v1-parity.json")
            .bufferedReader().use { JSONObject(it.readText()) }
        val records = fixture.getJSONArray("records")
        val expected = fixture.getJSONObject("expected")
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        NativeBusinessExpensesBackup.ensureRegistered()
        NativePerformanceBackup.ensureRegistered()
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
            val backupRows = JSONArray()
            for (index in 0 until records.length()) {
                val source = records.getJSONObject(index)
                val id = source.getString("id")
                val participant = when {
                    id.startsWith("feature:business-expenses:") -> "business-expenses-records"
                    id.startsWith("feature:performance:") -> "performance-records"
                    else -> "platform-records"
                }
                backupRows.put(JSONObject()
                    .put("id", id)
                    .put("json", source.toString())
                    .put("schemaVersion", source.getInt("schemaVersion"))
                    .put("updatedAt", source.getString("updatedAt"))
                    .put("participantId", participant))
            }
            NativeBackupCoverage.validateBusinessRecords(backupRows, requireExplicitOwnerTags = true)

            // These expected values are consumed by the TypeScript browser test,
            // which runs the shared platform-neutral calculation against this
            // same fixture. Room must preserve the exact source records supplied
            // to that calculation, including source revisions.
            assertEquals(18_000, expected.getInt("recoveryTotalPaise"))
            assertEquals("2027-09-15", expected.getString("recoveryToExclusive"))
            assertEquals(8_000, expected.getInt("lifetimeProfitPaise"))
            assertEquals(902_419, expected.getInt("lifetimeTargetPaise"))
            assertEquals(-894_419, expected.getInt("lifetimeTargetPositionPaise"))
        } finally {
            db.close()
        }
    }
}
