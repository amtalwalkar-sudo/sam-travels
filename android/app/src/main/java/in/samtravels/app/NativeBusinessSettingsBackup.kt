package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate

/**
 * Installs the Business Settings Room backup participant before any native
 * startup recovery/export path can inspect feature-owned records.
 */
internal object NativeBusinessSettingsBackup {
    private const val PARTICIPANT_ID = "business-settings-records"
    private const val FEATURE_ID = "business-settings"
    private const val RECORD_ID = "feature:business-settings:business"
    private const val RECORD_PREFIX = "feature:business-settings:"
    @Volatile private var processRegistration: AutoCloseable? = null

    @Synchronized
    fun ensureRegistered() {
        if (processRegistration == null) processRegistration = register()
    }

    fun register(): AutoCloseable = NativeBackupCoverage.registerFeatureRecordParticipant(
        id = PARTICIPANT_ID,
        featureId = FEATURE_ID,
        snapshotVersion = 1,
        recordIdPrefix = RECORD_PREFIX,
        validateRelationships = { rows, _ ->
            require(rows.size <= 1) { "business_settings_backup_singleton_duplicate" }
            rows.forEach { row ->
                require(row.optString("id") == RECORD_ID) {
                    "business_settings_backup_singleton_identity_invalid"
                }
                val envelope = JSONObject(row.getString("json"))
                val data = envelope.getJSONObject("data")
                val keys = data.keys().asSequence().toSet()
                require(keys == setOf("schemaVersion", "businessStartDate") &&
                    data.optInt("schemaVersion", -1) == 1) {
                    "business_settings_record_invalid"
                }
                val date = data.optString("businessStartDate")
                require(runCatching { LocalDate.parse(date).toString() == date }.getOrDefault(false)) {
                    "business_settings_record_invalid"
                }
            }
        },
    )
}
