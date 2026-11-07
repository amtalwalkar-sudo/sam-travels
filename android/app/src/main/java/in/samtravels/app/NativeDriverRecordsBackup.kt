package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate

/** Installs Driver profile validation before native backup, restore, or recovery. */
internal object NativeDriverRecordsBackup {
    private const val PARTICIPANT_ID = "driver-records"
    private const val FEATURE_ID = "driver-records"
    private const val RECORD_PREFIX = "feature:driver-records:driver:"
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
        validateRelationships = { rows ->
            rows.forEach { row ->
                val id = row.optString("id")
                val envelope = JSONObject(row.getString("json"))
                val data = envelope.getJSONObject("data")
                val keys = data.keys().asSequence().toSet()
                val required = setOf("schemaVersion", "driverId", "name", "lifecycleState")
                val allowed = required + setOf("licenceNumber", "licenceExpiryDate", "mobileNumber")
                require(keys.containsAll(required) && keys.all { it in allowed } &&
                    data.optInt("schemaVersion", -1) == 1) { "driver_record_invalid" }
                val driverId = data.optString("driverId")
                require(driverId.matches(Regex("[A-Za-z0-9_-]{1,128}")) &&
                    id == RECORD_PREFIX + driverId && data.optString("name").isNotBlank() &&
                    data.optString("lifecycleState") in setOf("active", "inactive")) {
                    "driver_record_invalid"
                }
                listOf("licenceNumber", "mobileNumber").forEach { key ->
                    if (data.has(key)) require(data.optString(key).isNotBlank()) { "driver_record_invalid" }
                }
                if (data.has("licenceExpiryDate")) {
                    val date = data.optString("licenceExpiryDate")
                    require(runCatching { LocalDate.parse(date).toString() == date }.getOrDefault(false)) {
                        "driver_record_invalid"
                    }
                }
            }
        },
    )
}
