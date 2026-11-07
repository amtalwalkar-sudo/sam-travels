package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeMaintenanceBackupTest {
    private val timestamp = "2026-10-31T20:00:00Z"
    private val vehicleId = "feature:vehicle:MH01AB1234"
    private val rateId = "feature:maintenance:rate:feature%3Avehicle%3AMH01AB1234"

    private fun row(id: String, participant: String, data: JSONObject, createdAt: String = timestamp): JSONObject {
        val envelope = JSONObject()
            .put("id", id).put("schemaVersion", 1)
            .put("createdAt", createdAt).put("updatedAt", createdAt)
            .put("source", "web").put("revision", 1).put("data", data)
        return JSONObject().put("id", id).put("json", envelope.toString())
            .put("schemaVersion", 1).put("updatedAt", createdAt).put("participantId", participant)
    }

    private fun vehicleRow() = row(
        vehicleId, "vehicle-records",
        JSONObject().put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
            .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
            .put("fuelType", "Diesel").put("yearOfManufacture", 2022)
            .put("ownership", "Owned").put("lifecycleState", "active"),
    )

    private fun visitRow(total: Long = 200000L, vehicle: String = vehicleId) = row(
        "feature:maintenance:visit:123e4567-e89b-42d3-a456-426614174000",
        "maintenance-records",
        JSONObject().put("schemaVersion", 1).put("kind", "visit").put("vehicleId", vehicle)
            .put("maintenanceDate", "2026-10-05").put("maintenanceType", "Regular service")
            .put("description", "Oil and filter replacement")
            .put("items", JSONArray().put(
                JSONObject().put("id", "123e4567-e89b-42d3-a456-426614174001")
                    .put("description", "Engine oil").put("amountPaise", 200000L),
            ))
            .put("totalPaise", total),
    )

    private fun rateRow() = row(
        rateId, "maintenance-records",
        JSONObject().put("schemaVersion", 1).put("kind", "rate_history").put("vehicleId", vehicleId)
            .put("entries", JSONArray()
                .put(JSONObject().put("effectiveFrom", "2026-11-01").put("ratePaisePerKm", 250)
                    .put("savedAt", timestamp).put("isDefault", true))
                .put(JSONObject().put("effectiveFrom", "2026-11-02").put("ratePaisePerKm", 300)
                    .put("savedAt", "2026-11-02T10:00:00Z").put("isDefault", false)
                    .put("commandId", "123e4567-e89b-42d3-a456-426614174002").put("source", "web"))),
        createdAt = "2026-11-02T10:00:00Z",
    )

    private fun withParticipants(block: () -> Unit) {
        val vehicle = NativeVehicleBackup.register()
        val maintenance = NativeMaintenanceBackup.register()
        try { block() } finally {
            maintenance.close()
            vehicle.close()
        }
    }

    @Test
    fun acceptsMaintenanceVisitsAndRateHistoryWithVehicleInSnapshot() = withParticipants {
        val records = JSONArray().put(vehicleRow()).put(visitRow()).put(rateRow())
        NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
    }

    @Test
    fun rejectsMaintenanceRecordWithoutVehicle() = withParticipants {
        val records = JSONArray().put(visitRow())
        val failure = assertThrows(IllegalStateException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        }
        assertEquals("maintenance_vehicle_not_found", failure.message)
    }

    @Test
    fun rejectsVisitTotalThatDoesNotMatchItems() = withParticipants {
        val records = JSONArray().put(vehicleRow()).put(visitRow(total = 200001L))
        val failure = assertThrows(IllegalArgumentException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        }
        assertEquals("maintenance_visit_total_mismatch", failure.message)
    }
}
