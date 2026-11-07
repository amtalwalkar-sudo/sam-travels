package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeBusinessSettingsBackupTest {
    private fun row(date: String, id: String = "feature:business-settings:business"): JSONObject {
        val timestamp = "2026-11-07T00:00:00.000Z"
        val envelope = JSONObject()
            .put("id", id)
            .put("schemaVersion", 1)
            .put("createdAt", timestamp)
            .put("updatedAt", timestamp)
            .put("source", "web")
            .put("revision", 1)
            .put("data", JSONObject().put("schemaVersion", 1).put("businessStartDate", date))
        return JSONObject()
            .put("id", id)
            .put("json", envelope.toString())
            .put("schemaVersion", 1)
            .put("updatedAt", timestamp)
            .put("participantId", "business-settings-records")
    }

    @Test fun registersSingletonParticipantAndValidatesItsPayload() {
        val registration = NativeBusinessSettingsBackup.register()
        try {
            val records = JSONArray().put(row("2020-02-29"))
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
            assertEquals("business-settings-records", NativeBackupCoverage.participantManifest()
                .let { manifest ->
                    (0 until manifest.length()).map { manifest.getJSONObject(it) }
                        .first { it.getString("id") == "business-settings-records" }
                        .getString("id")
                })
        } finally {
            registration.close()
        }
    }

    @Test fun rejectsInvalidDateAndDuplicateSingletonRows() {
        val registration = NativeBusinessSettingsBackup.register()
        try {
            assertEquals("business_settings_record_invalid",
                runCatching {
                    NativeBackupCoverage.validateBusinessRecords(
                        JSONArray().put(row("2025-02-29")),
                        requireExplicitOwnerTags = true,
                    )
                }.exceptionOrNull()?.message)
            assertEquals("backup_duplicate_participant_record_id",
                runCatching {
                    NativeBackupCoverage.validateBusinessRecords(
                        JSONArray().put(row("2020-01-01")).put(row("2020-01-02")),
                        requireExplicitOwnerTags = true,
                    )
                }.exceptionOrNull()?.message)
        } finally {
            registration.close()
        }
    }

    @Test fun acceptsOlderParticipantManifestOnlyWhenNoBusinessSettingsRecordExists() {
        val registration = NativeBusinessSettingsBackup.register()
        try {
            val current = NativeBackupCoverage.participantManifest()
            val older = JSONArray()
            for (index in 0 until current.length()) {
                val item = current.getJSONObject(index)
                if (item.getString("id") != "business-settings-records") older.put(JSONObject(item.toString()))
            }
            NativeBackupCoverage.validateParticipantManifest(older, JSONArray())
            assertEquals("backup_participant_manifest_mismatch",
                runCatching {
                    NativeBackupCoverage.validateParticipantManifest(
                        older,
                        JSONArray().put(row("2020-01-01")),
                    )
                }.exceptionOrNull()?.message)
        } finally {
            registration.close()
        }
    }

}
