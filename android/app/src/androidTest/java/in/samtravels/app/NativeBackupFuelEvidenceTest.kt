package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class NativeBackupFuelEvidenceTest {
    @Before fun ensureAllFeatureParticipants() {
        NativeBusinessSettingsBackup.ensureRegistered(); NativeVehicleBackup.ensureRegistered()
        NativeDriverRecordsBackup.ensureRegistered(); NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered(); NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered(); NativePerformanceBackup.ensureRegistered()
    }

    @Test fun fuelLocationCaptureRoundTripsAsPlatformDataWhileRecoveryInternalsStayLocal() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val timestamp = "2026-11-18T00:00:00.000Z"
        val fuelId = "feature:business-expenses:fuel:purchase-1"
        val fuelLocationId = "timeline-enrichment:fuel:" + fuelId
        val checkpointId = "__sam_travels_recovery_checkpoint__:local"
        val journalId = "__sam_travels_recovery_journal__:local"
        try {
            val locationEnvelope = JSONObject()
                .put("id", fuelLocationId)
                .put("schemaVersion", 1)
                .put("createdAt", timestamp)
                .put("updatedAt", timestamp)
                .put("source", "integration")
                .put("revision", 1)
                .put("data", JSONObject()
                    .put("eventId", fuelId)
                    .put("eventType", "fuel_purchase")
                    .put("latitude", 19.076)
                    .put("longitude", 72.8777)
                    .put("accuracyMeters", 12)
                    .put("fixAt", timestamp)
                    .put("capturedAt", timestamp)
                    .put("captureTiming", "at_entry")
                    .put("status", "pending"))
            database.records().put(StoredRecord(fuelLocationId, locationEnvelope.toString(), 1, timestamp))
            database.records().put(StoredRecord(
                checkpointId,
                JSONObject().put("id", checkpointId).put("status", "checkpoint").toString(),
                1,
                timestamp,
            ))
            database.records().put(StoredRecord(
                journalId,
                JSONObject().put("id", journalId).put("status", "restored_unverified").toString(),
                1,
                timestamp,
            ))

            val exported = NativeBackupCoverage.exportBusinessRecords(database) { false }
            assertEquals(1, exported.length())
            assertEquals("platform-records", exported.getJSONObject(0).getString("participantId"))
            assertEquals(fuelLocationId, exported.getJSONObject(0).getString("id"))
            assertTrue((0 until exported.length()).none { index ->
                exported.getJSONObject(index).getString("id").startsWith("__sam_travels_recovery_")
            })
            NativeBackupCoverage.validateBusinessRecords(exported)

            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertNull(database.records().get(fuelLocationId))
            assertNotNull(database.records().get(checkpointId))
            assertNotNull(database.records().get(journalId))

            NativeBackupCoverage.replaceBusinessRecords(database, exported)
            val restored = JSONObject(database.records().get(fuelLocationId)!!.json).getJSONObject("data")
            assertEquals("fuel_purchase", restored.getString("eventType"))
            assertEquals("at_entry", restored.getString("captureTiming"))
            assertEquals(19.076, restored.getDouble("latitude"), 0.000001)
            assertNotNull(database.records().get(checkpointId))
            assertNotNull(database.records().get(journalId))
        } finally {
            database.close()
        }
    }
}
