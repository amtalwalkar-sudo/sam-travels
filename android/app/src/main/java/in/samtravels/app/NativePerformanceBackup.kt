package `in`.samtravels.app

import org.json.JSONObject
import java.util.UUID

/** Native Room backup/restore validation for Admin-owned Performance source records. */
internal object NativePerformanceBackup {
    private const val PARTICIPANT_ID = "performance-records"
    private const val FEATURE_ID = "performance"
    private const val PREFIX = "feature:performance:"
    private const val SETTINGS_ID = PREFIX + "settings"
    private const val PRE_BUSINESS_PREFIX = PREFIX + "pre-business-cost:"
    @Volatile private var processRegistration: AutoCloseable? = null

    @Synchronized
    fun ensureRegistered() {
        if (processRegistration == null) processRegistration = register()
    }

    private fun integer(data: JSONObject, key: String, minimum: Long): Long {
        val value = data.opt(key)
        require(value is Number && value.toDouble() == value.toLong().toDouble() && value.toLong() >= minimum) {
            "performance_record_field_invalid:$key"
        }
        return value.toLong()
    }

    private fun validUuid(value: String): Boolean =
        runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)

    fun register(): AutoCloseable = NativeBackupCoverage.registerFeatureRecordParticipant(
        id = PARTICIPANT_ID,
        featureId = FEATURE_ID,
        snapshotVersion = 1,
        recordIdPrefix = PREFIX,
        validateRelationships = { rows, _ ->
            var settingsCount = 0
            rows.forEach { row ->
                val id = row.optString("id")
                val envelope = JSONObject(row.getString("json"))
                val data = envelope.getJSONObject("data")
                require(data.optInt("schemaVersion", -1) == 1) { "performance_admin_record_invalid" }
                when (data.optString("kind")) {
                    "settings" -> {
                        settingsCount += 1
                        require(id == SETTINGS_ID) { "performance_settings_backup_identity_invalid" }
                        val keys = data.keys().asSequence().toSet()
                        require(keys == setOf("schemaVersion", "kind", "monthlyDriverTargetPaise")) {
                            "performance_driver_target_invalid"
                        }
                        integer(data, "monthlyDriverTargetPaise", 0)
                    }
                    "pre_business_cost" -> {
                        val keys = data.keys().asSequence().toSet()
                        require(keys == setOf("schemaVersion", "kind", "amountPaise", "note", "commandId")) {
                            "performance_pre_business_cost_invalid"
                        }
                        val amount = integer(data, "amountPaise", 1)
                        val note = data.optString("note")
                        val commandId = data.optString("commandId")
                        require(amount > 0 && note.isNotBlank() && validUuid(commandId) &&
                            id == PRE_BUSINESS_PREFIX + commandId.lowercase()) {
                            "performance_pre_business_cost_backup_identity_invalid"
                        }
                    }
                    else -> error("performance_admin_record_kind_invalid")
                }
            }
            require(settingsCount <= 1) { "performance_settings_backup_duplicate" }
        },
    )
}
