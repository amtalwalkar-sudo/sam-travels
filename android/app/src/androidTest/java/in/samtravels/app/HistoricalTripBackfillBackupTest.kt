package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class HistoricalTripBackfillBackupTest {
    @Before fun ensureBackupParticipants() {
        NativeBusinessSettingsBackup.ensureRegistered()
        NativeVehicleBackup.ensureRegistered()
        NativeDriverRecordsBackup.ensureRegistered()
        NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered()
        NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered()
        NativePerformanceBackup.ensureRegistered()
    }

    @Test fun historicalTripBackfillRoundTripsAsPortablePlatformRecord() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val at = "2026-11-11T10:00:00.000Z"
        val id = "historical-trip-backfill:paper-trip-1"
        try {
            val data = JSONObject()
                .put("schemaVersion", 1).put("kind", "historical_trip_backfill")
                .put("backfillId", "paper-trip-1").put("status", "submitted")
                .put("attribution", "admin_declared").put("driverId", "driver-1")
                .put("vehicleId", "vehicle-1").put("operationalDate", "2026-11-10")
                .put("startedAt", "2026-11-10T08:00:00.000Z")
                .put("endedAt", "2026-11-10T08:30:00.000Z").put("farePaise", 12500)
                .put("reason", "Reconciled from paper trip sheet").put("recordedAt", at)
                .put("actor", JSONObject().put("role", "admin").put("actorId", "admin-1"))
            val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
                .put("createdAt", at).put("updatedAt", at).put("businessDate", "2026-11-10")
                .put("source", "android").put("revision", 1)
                .put("createdBy", JSONObject().put("personId", "admin-1").put("role", "admin"))
                .put("data", data)
            database.records().put(StoredRecord(id, envelope.toString(), 1, at))

            val exported = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
            NativeBackupCoverage.validateBusinessRecords(exported)
            val row = (0 until exported.length()).map { exported.getJSONObject(it) }.single { it.optString("id") == id }
            assertEquals("platform-records", row.getString("participantId"))
            assertEquals(1, exported.length())

            NativeBackupCoverage.replaceBusinessRecords(database, org.json.JSONArray())
            assertTrue(database.records().get(id) == null)
            NativeBackupCoverage.replaceBusinessRecords(database, exported)
            val restored = JSONObject(database.records().get(id)!!.json)
            assertEquals("historical_trip_backfill", restored.getJSONObject("data").getString("kind"))
            assertEquals("admin_declared", restored.getJSONObject("data").getString("attribution"))
            assertEquals(12500, restored.getJSONObject("data").getInt("farePaise"))
            assertEquals("admin-1", restored.getJSONObject("createdBy").getString("personId"))
        } finally { database.close() }
    }
}
