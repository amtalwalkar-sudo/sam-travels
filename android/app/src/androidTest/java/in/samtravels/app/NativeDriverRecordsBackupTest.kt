package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeDriverRecordsBackupTest {
    private fun row(driverId: String, id: String = "feature:driver-records:driver:$driverId"): JSONObject {
        val timestamp = "2026-11-07T00:00:00.000Z"
        val data = JSONObject().put("schemaVersion", 1).put("driverId", driverId)
            .put("name", "Example Driver").put("lifecycleState", "active")
        val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp)
            .put("source", "web").put("revision", 1).put("data", data)
        return JSONObject().put("id", id).put("json", envelope.toString())
            .put("schemaVersion", 1).put("updatedAt", timestamp).put("participantId", "driver-records")
    }

    @Test fun validatesDriverProfileAndParticipantRegistration() {
        val registration = NativeDriverRecordsBackup.register()
        try {
            NativeBackupCoverage.validateBusinessRecords(
                JSONArray().put(row("driver-001")), requireExplicitOwnerTags = true,
            )
            assertEquals(true, NativeBackupCoverage.registeredParticipantIds().contains("driver-records"))
        } finally { registration.close() }
    }

    @Test fun rejectsMismatchedIdentityAndInvalidLicenceDate() {
        val registration = NativeDriverRecordsBackup.register()
        try {
            assertEquals("driver_record_invalid", runCatching {
                NativeBackupCoverage.validateBusinessRecords(
                    JSONArray().put(row("driver-001", "feature:driver-records:driver:driver-002")),
                    requireExplicitOwnerTags = true,
                )
            }.exceptionOrNull()?.message)
            val invalid = row("driver-001")
            val envelope = JSONObject(invalid.getString("json"))
            envelope.getJSONObject("data").put("licenceExpiryDate", "2025-02-29")
            invalid.put("json", envelope.toString())
            assertEquals("driver_record_invalid", runCatching {
                NativeBackupCoverage.validateBusinessRecords(JSONArray().put(invalid), requireExplicitOwnerTags = true)
            }.exceptionOrNull()?.message)
        } finally { registration.close() }
    }

    @Test fun acceptsLegacyManifestOnlyWhenNoDriverRecordsExist() {
        val registration = NativeDriverRecordsBackup.register()
        try {
            val current = NativeBackupCoverage.participantManifest()
            val older = JSONArray()
            for (index in 0 until current.length()) {
                val item = current.getJSONObject(index)
                if (item.getString("id") != "driver-records") older.put(JSONObject(item.toString()))
            }
            NativeBackupCoverage.validateParticipantManifest(older, JSONArray())
            assertEquals("backup_participant_manifest_mismatch", runCatching {
                NativeBackupCoverage.validateParticipantManifest(older, JSONArray().put(row("driver-001")))
            }.exceptionOrNull()?.message)
        } finally { registration.close() }
    }
}
