package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeVehicleBackupTest {
    private fun row(registration: String, id: String = "feature:vehicle:$registration"): JSONObject {
        val timestamp = "2026-11-07T00:00:00.000Z"
        val data = JSONObject()
            .put("schemaVersion", 1).put("registrationNumber", registration)
            .put("make", "Example Make").put("model", "Example Model")
            .put("vehicleType", "Sedan").put("fuelType", "Petrol")
            .put("yearOfManufacture", 2022).put("ownership", "Owned")
            .put("lifecycleState", "active")
        val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp)
            .put("source", "web").put("revision", 1).put("data", data)
        return JSONObject().put("id", id).put("json", envelope.toString())
            .put("schemaVersion", 1).put("updatedAt", timestamp).put("participantId", "vehicle-records")
    }

    @Test fun validatesCanonicalVehicleRecordsAndParticipant() {
        val registration = NativeVehicleBackup.register()
        try {
            NativeBackupCoverage.validateBusinessRecords(
                JSONArray().put(row("MH01AB1234")), requireExplicitOwnerTags = true,
            )
            assertEquals(true, NativeBackupCoverage.registeredParticipantIds().contains("vehicle-records"))
        } finally {
            registration.close()
        }
    }

    @Test fun rejectsNonCanonicalIdentityAndMismatchedRecordId() {
        val registration = NativeVehicleBackup.register()
        try {
            assertEquals("vehicle_record_invalid", runCatching {
                NativeBackupCoverage.validateBusinessRecords(
                    JSONArray().put(row("MH 01 AB 1234")), requireExplicitOwnerTags = true,
                )
            }.exceptionOrNull()?.message)
            assertEquals("vehicle_backup_record_identity_invalid", runCatching {
                NativeBackupCoverage.validateBusinessRecords(
                    JSONArray().put(row("MH01AB1234", "feature:vehicle:MH02CD5678")),
                    requireExplicitOwnerTags = true,
                )
            }.exceptionOrNull()?.message)
        } finally {
            registration.close()
        }
    }

    @Test fun rejectsDuplicateCanonicalVehicleIdentity() {
        val registration = NativeVehicleBackup.register()
        try {
            assertEquals("vehicle_backup_duplicate_registration", runCatching {
                NativeBackupCoverage.validateBusinessRecords(
                    JSONArray().put(row("MH01AB1234"))
                        .put(row("MH01AB1234", "feature:vehicle:MH01AB1234-copy")),
                    requireExplicitOwnerTags = true,
                )
            }.exceptionOrNull()?.message)
        } finally {
            registration.close()
        }
    }
}
