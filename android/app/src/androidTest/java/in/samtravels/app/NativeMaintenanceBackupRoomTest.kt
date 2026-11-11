package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeMaintenanceBackupRoomTest {
    private val timestamp = "2026-10-31T20:00:00.000Z"
    private val vehicleId = "feature:vehicle:MH01AB1234"
    private val visitId = "feature:maintenance:visit:123e4567-e89b-42d3-a456-426614174000"
    private val rateId = "feature:maintenance:rate:feature%3Avehicle%3AMH01AB1234"

    private fun stored(id: String, data: JSONObject, at: String = timestamp) = StoredRecord(
        id,
        JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", at).put("updatedAt", at).put("source", "web")
            .put("revision", 1).put("data", data).toString(),
        1, at,
    )

    private fun vehicleRecord() = stored(
        vehicleId,
        JSONObject().put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
            .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
            .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
            .put("ownership", "Owned").put("lifecycleState", "active"),
    )

    private fun visitRecord(total: Long = 200000L) = stored(
        visitId,
        JSONObject().put("schemaVersion", 1).put("kind", "visit").put("vehicleId", vehicleId)
            .put("maintenanceDate", "2026-10-05").put("maintenanceType", "Regular service")
            .put("description", "Oil and filter replacement")
            .put("items", JSONArray().put(
                JSONObject().put("id", "123e4567-e89b-42d3-a456-426614174001")
                    .put("description", "Engine oil").put("amountPaise", 200000L),
            ))
            .put("totalPaise", total),
    )

    private fun rateRecord() = stored(
        rateId,
        JSONObject().put("schemaVersion", 1).put("kind", "rate_history").put("vehicleId", vehicleId)
            .put("entries", JSONArray()
                .put(JSONObject().put("effectiveFrom", "2026-11-01").put("ratePaisePerKm", 250)
                    .put("savedAt", timestamp).put("isDefault", true))
                .put(JSONObject().put("effectiveFrom", "2026-11-02").put("ratePaisePerKm", 300)
                    .put("savedAt", "2026-11-02T10:00:00.000Z").put("isDefault", false)
                    .put("commandId", "123e4567-e89b-42d3-a456-426614174002").put("source", "web"))),
        at = "2026-11-02T10:00:00.000Z",
    )

    @Test
    fun roomBackupRoundTripsMaintenanceAndVehicleRecordsAtomically() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val vehicle = NativeVehicleBackup.register()
        val maintenance = NativeMaintenanceBackup.register()
        try {
            NativeBackupCoverage.assertRoomSchemaCovered(database)
            database.records().put(vehicleRecord())
            database.records().put(visitRecord())
            database.records().put(rateRecord())

            val exported = NativeBackupCoverage.exportBusinessRecords(database) { false }
            NativeBackupCoverage.validateBusinessRecords(exported, requireExplicitOwnerTags = true)
            assertEquals(3, exported.length())
            assertTrue((0 until exported.length()).map {
                exported.getJSONObject(it).optString("participantId")
            }.containsAll(listOf("vehicle-records", "maintenance-records")))

            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertNull(database.records().get(vehicleId))
            assertNull(database.records().get(visitId))
            assertNull(database.records().get(rateId))

            NativeBackupCoverage.replaceBusinessRecords(database, exported)
            assertEquals(visitId, database.records().get(visitId)?.id)
            assertEquals(rateId, database.records().get(rateId)?.id)
            NativeBackupCoverage.validateBusinessRecords(
                NativeBackupCoverage.exportBusinessRecords(database) { false },
                requireExplicitOwnerTags = true,
            )
        } finally {
            maintenance.close()
            vehicle.close()
            database.close()
        }
    }

    @Test
    fun maintenanceExpenseCorrectionChainCommitsAtomicallyAndSurvivesNativeRecovery() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val vehicle = NativeVehicleBackup.register()
        val maintenance = NativeMaintenanceBackup.register()
        val expenseId = "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174003"
        val firstId = "historical-correction:maintenance-fix-1"
        val secondId = "historical-correction:maintenance-fix-2"
        val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(expenseId, "UTF-8")
        try {
            database.records().put(vehicleRecord())
            val expense = stored(expenseId, JSONObject().put("schemaVersion", 1).put("kind", "expense")
                .put("vehicleId", vehicleId).put("expenseDate", "2026-10-10")
                .put("expenseName", "Tyre repair").put("description", "Receipt amount")
                .put("amountPaise", 10000L))
            val originalEnvelope = JSONObject(expense.json).put("createdBy",
                JSONObject().put("personId", "driver-1").put("role", "driver"))
            database.records().put(StoredRecord(expenseId, originalEnvelope.toString(), 1, timestamp))

            fun correction(id: String, revision: Int, before: Long, after: Long, reason: String,
                actor: JSONObject, supersedes: String? = null): JSONObject {
                val data = JSONObject().put("schemaVersion", 1)
                    .put("correctionId", id.removePrefix("historical-correction:"))
                    .put("targetRecordId", expenseId).put("targetRecordRevision", 1)
                    .put("featureId", "maintenance").put("chainRevision", revision)
                    .put("fieldPath", "amountPaise").put("beforeValue", before)
                    .put("afterValue", after).put("reason", reason)
                    .put("actor", actor).put("recordedAt", timestamp)
                    .put("businessEffectiveDate", "2026-10-10")
                if (supersedes != null) data.put("supersedesCorrectionId", supersedes)
                return JSONObject().put("id", id).put("schemaVersion", 1)
                    .put("createdAt", timestamp).put("updatedAt", timestamp)
                    .put("source", "android").put("revision", 1)
                    .put("createdBy", JSONObject().put("personId", actor.getString("actorId"))
                        .put("role", actor.getString("role")))
                    .put("data", data)
            }
            fun chainHead(revision: Int, head: String, envelopeRevision: Int) = JSONObject()
                .put("id", chainId).put("schemaVersion", 1).put("createdAt", timestamp)
                .put("updatedAt", timestamp).put("source", "android").put("revision", envelopeRevision)
                .put("data", JSONObject().put("schemaVersion", 1).put("targetRecordId", expenseId)
                    .put("chainRevision", revision).put("headCorrectionId", head))

            val driverActor = JSONObject().put("role", "driver").put("actorId", "driver-1")
            val adminActor = JSONObject().put("role", "admin").put("actorId", "admin-1")
                .put("adminPinVerifiedAt", timestamp)
            val first = correction(firstId, 1, 10000L, 12500L,
                "Receipt amount was entered incorrectly", driverActor)
            val firstHead = chainHead(1, "maintenance-fix-1", 1)
            assertTrue(commitFeatureUpgradeBatch(database, JSONArray().put(first).put(firstHead),
                JSONArray(), JSONObject().put(firstId, -1).put(chainId, -1)))
            assertFalse("A stale chain head must reject correction and head together",
                commitFeatureUpgradeBatch(database,
                    JSONArray().put(correction(secondId, 2, 12500L, 13000L, "Admin verified receipt",
                        adminActor, "maintenance-fix-1"))
                        .put(chainHead(2, "maintenance-fix-2", 2)),
                    JSONArray(), JSONObject().put(secondId, -1).put(chainId, -1)))
            assertNull(database.records().get(secondId))
            assertEquals(1, JSONObject(database.records().get(chainId)!!.json)
                .getJSONObject("data").getInt("chainRevision"))

            val second = correction(secondId, 2, 12500L, 13000L, "Admin verified receipt",
                adminActor, "maintenance-fix-1")
            val secondHead = chainHead(2, "maintenance-fix-2", 2)
            assertTrue(commitFeatureUpgradeBatch(database, JSONArray().put(second).put(secondHead),
                JSONArray(), JSONObject().put(secondId, -1).put(chainId, 1)))

            val originalBeforeRecovery = JSONObject(database.records().get(expenseId)!!.json)
            assertEquals(10000L, originalBeforeRecovery.getJSONObject("data").getLong("amountPaise"))
            val firstData = JSONObject(database.records().get(firstId)!!.json).getJSONObject("data")
            val secondData = JSONObject(database.records().get(secondId)!!.json).getJSONObject("data")
            assertEquals(10000L, firstData.getLong("beforeValue"))
            assertEquals(12500L, firstData.getLong("afterValue"))
            assertEquals("driver-1", firstData.getJSONObject("actor").getString("actorId"))
            assertEquals(12500L, secondData.getLong("beforeValue"))
            assertEquals(13000L, secondData.getLong("afterValue"))
            assertEquals("admin-1", secondData.getJSONObject("actor").getString("actorId"))
            assertEquals("maintenance-fix-1", secondData.getString("supersedesCorrectionId"))
            assertEquals("Receipt amount was entered incorrectly", firstData.getString("reason"))
            assertEquals("Admin verified receipt", secondData.getString("reason"))

            val exported = NativeBackupCoverage.exportBusinessRecords(database) { false }
            val exportedIds = (0 until exported.length()).map { exported.getJSONObject(it).optString("id") }
            assertTrue(exportedIds.containsAll(listOf(expenseId, firstId, secondId, chainId)))
            NativeBackupCoverage.validateBusinessRecords(exported, requireExplicitOwnerTags = true)
            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertNull(database.records().get(expenseId))
            assertNull(database.records().get(firstId))
            assertNull(database.records().get(secondId))
            assertNull(database.records().get(chainId))
            NativeBackupCoverage.replaceBusinessRecords(database, exported)

            val restoredExpense = JSONObject(database.records().get(expenseId)!!.json)
            val restoredFirst = JSONObject(database.records().get(firstId)!!.json).getJSONObject("data")
            val restoredSecond = JSONObject(database.records().get(secondId)!!.json).getJSONObject("data")
            val restoredHead = JSONObject(database.records().get(chainId)!!.json).getJSONObject("data")
            assertEquals(10000L, restoredExpense.getJSONObject("data").getLong("amountPaise"))
            assertEquals("driver-1", restoredExpense.getJSONObject("createdBy").getString("personId"))
            assertEquals(12500L, restoredFirst.getLong("afterValue"))
            assertEquals(13000L, restoredSecond.getLong("afterValue"))
            assertEquals("admin-1", restoredSecond.getJSONObject("actor").getString("actorId"))
            assertEquals(2, restoredHead.getInt("chainRevision"))
            assertEquals("maintenance-fix-2", restoredHead.getString("headCorrectionId"))
        } finally {
            maintenance.close()
            vehicle.close()
            database.close()
        }
    }

    @Test
    fun invalidMaintenanceSnapshotIsRejectedBeforeRoomReplacement() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val vehicle = NativeVehicleBackup.register()
        val maintenance = NativeMaintenanceBackup.register()
        try {
            database.records().put(vehicleRecord())
            database.records().put(visitRecord())
            val valid = NativeBackupCoverage.exportBusinessRecords(database) { false }
            val invalid = JSONArray()
            for (index in 0 until valid.length()) {
                val row = JSONObject(valid.getJSONObject(index).toString())
                if (row.optString("id") == visitId) {
                    val envelope = JSONObject(row.getString("json"))
                    envelope.getJSONObject("data").put("totalPaise", 200001L)
                    row.put("json", envelope.toString())
                }
                invalid.put(row)
            }
            assertThrows(IllegalArgumentException::class.java) {
                NativeBackupCoverage.replaceBusinessRecords(database, invalid)
            }
            assertEquals(visitId, database.records().get(visitId)?.id)
            assertEquals(vehicleId, database.records().get(vehicleId)?.id)
        } finally {
            maintenance.close()
            vehicle.close()
            database.close()
        }
    }
}
