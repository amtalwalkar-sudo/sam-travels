package `in`.samtravels.app

import org.json.JSONObject

/** Installs Vehicle record validation before native backup, restore, or recovery. */
internal object NativeVehicleBackup {
    private const val PARTICIPANT_ID = "vehicle-records"
    private const val FEATURE_ID = "vehicle"
    private const val RECORD_PREFIX = "feature:vehicle:"
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
            val identities = mutableSetOf<String>()
            rows.forEach { row ->
                val id = row.optString("id")
                val envelope = JSONObject(row.getString("json"))
                val data = envelope.getJSONObject("data")
                val keys = data.keys().asSequence().toSet()
                require(keys == setOf(
                    "schemaVersion", "registrationNumber", "make", "model", "vehicleType",
                    "fuelType", "yearOfManufacture", "ownership", "lifecycleState",
                ) && data.optInt("schemaVersion", -1) == 1) { "vehicle_record_invalid" }
                val registration = data.optString("registrationNumber")
                val canonical = registration.uppercase().filterNot { it.isWhitespace() || it == '-' }
                require(registration.isNotBlank() && registration == canonical &&
                    registration.all { it in 'A'..'Z' || it in '0'..'9' }) { "vehicle_record_invalid" }
                require(id == RECORD_PREFIX + registration) { "vehicle_backup_record_identity_invalid" }
                require(listOf("make", "model", "vehicleType", "fuelType", "ownership")
                    .all { data.optString(it).isNotBlank() }) { "vehicle_record_invalid" }
                require(data.optInt("yearOfManufacture", 0) >= 1 &&
                    data.optString("lifecycleState") in setOf("active", "inactive", "sold")) {
                    "vehicle_record_invalid"
                }
                require(identities.add(registration)) { "vehicle_backup_duplicate_registration" }
            }
        },
    )
}
