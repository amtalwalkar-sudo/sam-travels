package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NativePerformanceBackupTest {
    private fun row(id: String, data: JSONObject): JSONObject {
        val timestamp = "2026-11-16T00:00:00.000Z"
        val envelope = JSONObject()
            .put("id", id).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp)
            .put("source", "web").put("revision", 1).put("data", data)
        return JSONObject().put("id", id).put("json", envelope.toString())
            .put("schemaVersion", 1).put("updatedAt", timestamp)
            .put("participantId", "performance-records")
    }

    private fun settingsRow() = row(
        "feature:performance:settings",
        JSONObject().put("schemaVersion", 1).put("kind", "settings")
            .put("monthlyDriverTargetPaise", 4_500_000),
    )

    private fun costRow(commandId: String = "11111111-1111-4111-8111-111111111111") = row(
        "feature:performance:pre-business-cost:$commandId",
        JSONObject().put("schemaVersion", 1).put("kind", "pre_business_cost")
            .put("amountPaise", 12_000).put("note", "Vehicle setup").put("commandId", commandId),
    )

    @Test fun registersParticipantAndValidatesMultipleManualCosts() {
        val registration = NativePerformanceBackup.register()
        try {
            NativeBackupCoverage.validateBusinessRecords(
                JSONArray().put(settingsRow()).put(costRow()).put(costRow("22222222-2222-4222-8222-222222222222")),
                requireExplicitOwnerTags = true,
            )
            val participant = (0 until NativeBackupCoverage.participantManifest().length())
                .map { NativeBackupCoverage.participantManifest().getJSONObject(it) }
                .first { it.getString("id") == "performance-records" }
            assertEquals("performance", participant.getString("featureId"))
        } finally {
            registration.close()
        }
    }

    @Test fun rejectsInvalidAmountsAndMismatchedCostIdentities() {
        val registration = NativePerformanceBackup.register()
        try {
            val invalid = costRow().apply {
                val envelope = JSONObject(getString("json"))
                envelope.getJSONObject("data").put("amountPaise", 0)
                put("json", envelope.toString())
            }
            assertEquals("performance_pre_business_cost_invalid",
                runCatching {
                    NativeBackupCoverage.validateBusinessRecords(JSONArray().put(invalid), true)
                }.exceptionOrNull()?.message)
            val mismatched = costRow().apply { put("id", "feature:performance:pre-business-cost:other") }
            assertEquals("performance_pre_business_cost_backup_identity_invalid",
                runCatching {
                    NativeBackupCoverage.validateBusinessRecords(JSONArray().put(mismatched), true)
                }.exceptionOrNull()?.message)
        } finally {
            registration.close()
        }
    }

    @Test fun acceptsLegacyManifestWithoutPerformanceOnlyWhenNoPerformanceRecordsExist() {
        val registration = NativePerformanceBackup.register()
        try {
            val current = NativeBackupCoverage.participantManifest()
            val older = JSONArray()
            for (index in 0 until current.length()) {
                val item = current.getJSONObject(index)
                if (item.getString("id") != "performance-records") older.put(JSONObject(item.toString()))
            }
            NativeBackupCoverage.validateParticipantManifest(older, JSONArray())
            assertEquals("backup_participant_manifest_mismatch",
                runCatching {
                    NativeBackupCoverage.validateParticipantManifest(
                        older, JSONArray().put(settingsRow()),
                    )
                }.exceptionOrNull()?.message)
        } finally {
            registration.close()
        }
    }
}
