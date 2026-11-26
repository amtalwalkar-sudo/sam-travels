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
    @Test fun correctedHistoricalTripFinancialChainRoundTripsThroughRoomBackup() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val at = "2026-11-11T10:00:00.000Z"
        val operationalDate = "2026-11-10"
        val targetId = "historical-trip-backfill:room-corrected-trip"
        val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(targetId, "UTF-8")
        val correctionIds = listOf(
            "room-backfill-fare-fix",
            "room-backfill-toll-payer-fix",
            "room-backfill-parking-amount-fix",
            "room-backfill-parking-payer-fix",
        )
        try {
            val targetData = JSONObject()
                .put("schemaVersion", 1).put("kind", "historical_trip_backfill")
                .put("backfillId", "room-corrected-trip").put("status", "submitted")
                .put("attribution", "admin_declared").put("driverId", "driver-1")
                .put("vehicleId", "vehicle-1").put("operationalDate", operationalDate)
                .put("startedAt", "2026-11-10T08:00:00.000Z")
                .put("endedAt", "2026-11-10T08:30:00.000Z")
                .put("farePaise", 10000).put("tollPaise", 32000).put("tollPayer", "driver")
                .put("parkingPaise", 12000).put("parkingPayer", "customer")
                .put("reason", "Room correction parity fixture").put("recordedAt", at)
                .put("actor", JSONObject().put("role", "admin").put("actorId", "admin-room"))
            val target = JSONObject().put("id", targetId).put("schemaVersion", 1)
                .put("createdAt", at).put("updatedAt", at).put("businessDate", operationalDate)
                .put("source", "android").put("revision", 1)
                .put("createdBy", JSONObject().put("personId", "admin-room").put("role", "admin"))
                .put("data", targetData)
            database.records().put(StoredRecord(targetId, target.toString(), 1, at))

            val before = listOf<Any>(10000, "driver", 12000, "customer")
            val after = listOf<Any>(15000, "customer", 15000, "driver")
            var previousCorrection: String? = null
            correctionIds.forEachIndexed { index, correctionId ->
                val correctionData = JSONObject()
                    .put("schemaVersion", 1).put("correctionId", correctionId)
                    .put("targetRecordId", targetId).put("targetRecordRevision", 1)
                    .put("featureId", "historical-trip-backfill-finance")
                    .put("chainRevision", index + 1)
                    .put("fieldPath", listOf("farePaise", "tollPayer", "parkingPaise", "parkingPayer")[index])
                    .put("beforeValue", before[index]).put("afterValue", after[index])
                    .put("reason", "Verified paper trip correction")
                    .put("actor", JSONObject().put("role", "admin").put("actorId", "admin-room")
                        .put("adminPinVerifiedAt", at))
                    .put("recordedAt", at).put("businessEffectiveDate", operationalDate)
                previousCorrection?.let { correctionData.put("supersedesCorrectionId", it) }
                val correctionIdWithPrefix = "historical-correction:" + correctionId
                val correction = JSONObject().put("id", correctionIdWithPrefix)
                    .put("schemaVersion", 1).put("createdAt", at).put("updatedAt", at)
                    .put("businessDate", operationalDate).put("source", "android").put("revision", 1)
                    .put("createdBy", JSONObject().put("personId", "admin-room").put("role", "admin"))
                    .put("data", correctionData)
                database.records().put(StoredRecord(correctionIdWithPrefix, correction.toString(), 1, at))
                previousCorrection = correctionId
            }
            val head = JSONObject().put("id", chainId).put("schemaVersion", 1)
                .put("createdAt", at).put("updatedAt", at).put("businessDate", operationalDate)
                .put("source", "android").put("revision", 4)
                .put("data", JSONObject().put("schemaVersion", 1).put("targetRecordId", targetId)
                    .put("chainRevision", 4).put("headCorrectionId", correctionIds.last()))
            database.records().put(StoredRecord(chainId, head.toString(), 1, at))

            val exported = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
            NativeBackupCoverage.validateBusinessRecords(exported)
            val exportedIds = (0 until exported.length()).map { exported.getJSONObject(it).getString("id") }
            assertTrue(exportedIds.containsAll(listOf(targetId, chainId) +
                correctionIds.map { "historical-correction:" + it }))

            NativeBackupCoverage.replaceBusinessRecords(database, org.json.JSONArray())
            NativeBackupCoverage.replaceBusinessRecords(database, exported)
            val restoredTarget = JSONObject(database.records().get(targetId)!!.json).getJSONObject("data")
            assertEquals(10000, restoredTarget.getInt("farePaise"))
            assertEquals(32000, restoredTarget.getInt("tollPaise"))
            assertEquals("driver", restoredTarget.getString("tollPayer"))
            assertEquals(12000, restoredTarget.getInt("parkingPaise"))
            assertEquals("customer", restoredTarget.getString("parkingPayer"))

            val restoredCorrections = correctionIds.mapIndexed { index, correctionId ->
                val id = "historical-correction:" + correctionId
                JSONObject(database.records().get(id)!!.json).getJSONObject("data").also { correction ->
                    assertEquals(index + 1, correction.getInt("chainRevision"))
                    assertEquals(targetId, correction.getString("targetRecordId"))
                    assertEquals(1, correction.getInt("targetRecordRevision"))
                }
            }
            assertEquals(4, restoredCorrections.size)
            assertEquals("farePaise", restoredCorrections[0].getString("fieldPath"))
            assertEquals(15000, restoredCorrections[0].getInt("afterValue"))
            assertEquals("customer", restoredCorrections[1].getString("afterValue"))
            assertEquals("parkingPaise", restoredCorrections[2].getString("fieldPath"))
            assertEquals(15000, restoredCorrections[2].getInt("afterValue"))
            assertEquals("driver", restoredCorrections[3].getString("afterValue"))
            val restoredHead = JSONObject(database.records().get(chainId)!!.json)
            assertEquals(4, restoredHead.getInt("revision"))
            assertEquals(4, restoredHead.getJSONObject("data").getInt("chainRevision"))
            assertEquals(correctionIds.last(), restoredHead.getJSONObject("data").getString("headCorrectionId"))
        } finally { database.close() }
    }

}
