package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeComplianceBackupTest {
    private val timestamp = "2026-11-07T00:00:00Z"
    private val vehicleId = "feature:vehicle:MH01AB1234"

    private fun row(id: String, participant: String, data: JSONObject): JSONObject {
        val envelope = JSONObject()
            .put("id", id)
            .put("schemaVersion", 1)
            .put("createdAt", timestamp)
            .put("updatedAt", timestamp)
            .put("source", "web")
            .put("revision", 1)
            .put("data", data)
        return JSONObject()
            .put("id", id)
            .put("json", envelope.toString())
            .put("schemaVersion", 1)
            .put("updatedAt", timestamp)
            .put("participantId", participant)
    }

    private fun vehicleRow() = row(
        vehicleId,
        "vehicle-records",
        JSONObject()
            .put("schemaVersion", 1)
            .put("registrationNumber", "MH01AB1234")
            .put("make", "Tata")
            .put("model", "Ace")
            .put("vehicleType", "LCV")
            .put("fuelType", "Diesel")
            .put("yearOfManufacture", 2022)
            .put("ownership", "Owned")
            .put("lifecycleState", "active"),
    )

    private fun complianceRow(
        id: String = "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
        vehicle: String = vehicleId,
        renewal: String? = null,
    ): JSONObject {
        val data = JSONObject()
            .put("schemaVersion", 1)
            .put("vehicleId", vehicle)
            .put("complianceName", "Insurance")
            .put("validFrom", "2026-01-01")
            .put("validTo", "2026-12-31")
            .put("totalCostPaise", 365000L)
        if (renewal != null) data.put("renewedFromRecordId", renewal)
        return row(id, "compliance-records", data)
    }

    private fun withParticipants(block: () -> Unit) {
        val vehicle = NativeVehicleBackup.register()
        val compliance = NativeComplianceBackup.register()
        try {
            block()
        } finally {
            compliance.close()
            vehicle.close()
        }
    }

    @Test
    fun acceptsComplianceRecordWhenVehicleIsPresentInSameSnapshot() = withParticipants {
        val records = JSONArray().put(vehicleRow()).put(complianceRow())
        NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
    }

    @Test
    fun rejectsComplianceRecordWhenVehicleIsMissingFromSnapshot() = withParticipants {
        val records = JSONArray().put(complianceRow())
        val error = assertThrows(IllegalArgumentException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        }
        org.junit.Assert.assertEquals("compliance_vehicle_not_found", error.message)
    }

    @Test
    fun rejectsRenewalWhosePredecessorIsAbsent() = withParticipants {
        val records = JSONArray().put(vehicleRow()).put(
            complianceRow(
                id = "feature:compliance:123e4567-e89b-42d3-a456-426614174001",
                renewal = "feature:compliance:123e4567-e89b-42d3-a456-426614174099",
            ),
        )
        val error = assertThrows(IllegalStateException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        }
        org.junit.Assert.assertEquals("compliance_renewal_source_not_found", error.message)
    }
}
