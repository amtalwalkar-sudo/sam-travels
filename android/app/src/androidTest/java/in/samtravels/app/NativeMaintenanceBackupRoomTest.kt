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
