package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate

/** Installs Driver profile and assignment-history validation before native backup, restore, or recovery. */
internal object NativeDriverRecordsBackup {
    private const val PARTICIPANT_ID = "driver-records"
    private const val FEATURE_ID = "driver-records"
    private const val RECORD_PREFIX = "feature:driver-records:"
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
            rows.forEach { row ->
                val id = row.optString("id")
                val data = JSONObject(row.getString("json")).getJSONObject("data")
                val keys = data.keys().asSequence().toSet()
                val driverId = data.optString("driverId")
                require(driverId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "driver_record_invalid" }
                when {
                    id.startsWith(RECORD_PREFIX + "driver:") -> {
                        val required = setOf("schemaVersion", "driverId", "name", "lifecycleState")
                        val allowed = required + setOf("licenceNumber", "licenceExpiryDate", "mobileNumber")
                        require(keys.containsAll(required) && keys.all { it in allowed } &&
                            data.optInt("schemaVersion", -1) == 1 &&
                            id == RECORD_PREFIX + "driver:" + driverId &&
                            data.optString("name").isNotBlank() &&
                            data.optString("lifecycleState") in setOf("active", "inactive")) { "driver_record_invalid" }
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
                    id.startsWith(RECORD_PREFIX + "assignment:") -> {
                        require(keys == setOf("schemaVersion", "driverId", "assignments") &&
                            data.optInt("schemaVersion", -1) == 1 &&
                            id == RECORD_PREFIX + "assignment:" + driverId) { "driver_assignment_history_invalid" }
                        val assignments = data.getJSONArray("assignments")
                        val ids = mutableSetOf<String>()
                        var active = 0
                        var previous = Long.MIN_VALUE
                        for (index in 0 until assignments.length()) {
                            val assignment = assignments.getJSONObject(index)
                            val assignmentKeys = assignment.keys().asSequence().toSet()
                            require(assignmentKeys.all { it in setOf("assignmentId", "vehicleId", "assignedAt", "unassignedAt") } &&
                                assignmentKeys.containsAll(setOf("assignmentId", "vehicleId", "assignedAt")) &&
                                assignment.optString("assignmentId").matches(Regex("[A-Za-z0-9_-]{1,128}")) &&
                                ids.add(assignment.optString("assignmentId")) &&
                                assignment.optString("vehicleId").startsWith("feature:vehicle:")) { "driver_assignment_invalid" }
                            val assigned = Instant.parse(assignment.getString("assignedAt")).toEpochMilli()
                            require(assigned >= previous) { "driver_assignment_history_order_invalid" }
                            previous = assigned
                            if (assignment.has("unassignedAt")) {
                                val ended = Instant.parse(assignment.getString("unassignedAt")).toEpochMilli()
                                require(ended >= assigned) { "driver_assignment_period_invalid" }
                            } else active++
                        }
                        require(active <= 1) { "driver_multiple_active_assignments" }
                    }
                    else -> throw IllegalArgumentException("driver_record_namespace_mismatch")
                }
            }
        },
    )
}
