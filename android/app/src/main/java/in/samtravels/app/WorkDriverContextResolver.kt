package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant
import java.time.OffsetDateTime

/** Resolves and validates the one operating Driver–Vehicle pair from a single Room snapshot. */
internal object WorkDriverContextResolver {
    private const val DRIVER_PREFIX = "feature:driver-records:driver:"
    private const val ASSIGNMENT_PREFIX = "feature:driver-records:assignment:"
    private const val VEHICLE_PREFIX = "feature:vehicle:"
    private val identity = Regex("[A-Za-z0-9_-]{1,128}")

    private data class Profile(val id: String, val envelope: JSONObject, val data: JSONObject)
    private data class ActiveAssignment(
        val driverId: String, val record: JSONObject, val assignmentId: String,
        val vehicleId: String, val assignedAt: Instant,
    )

    fun resolve(db: LocalDatabase, transitionAt: String): JSONObject {
        // RecordDao.list() is one synchronous Room read. Do not make independent lookups
        // for the pair: every decision below is based on this same returned snapshot.
        val records = db.records().list()
        val selectedRows = records.filter { it.id == "work:selected-driver" }
        require(selectedRows.size == 1) { if (selectedRows.isEmpty()) "work_driver_not_selected" else "operating_driver_selection_ambiguous" }
        val selectionEnvelope = JSONObject(selectedRows.single().json)
        val selected = selectionEnvelope.optJSONObject("data") ?: error("work_selected_driver_invalid")
        require(selected.optInt("schemaVersion", -1) == 1) { "work_selected_driver_invalid" }
        val driverId = selected.optString("driverId")
        require(identity.matches(driverId)) { "work_selected_driver_invalid" }
        require(!selected.has("lockedShiftId") || selected.isNull("lockedShiftId")) {
            "operating_driver_selection_locked"
        }

        val activeDrivers = mutableListOf<Profile>()
        records.filter { it.id.startsWith(DRIVER_PREFIX) }.forEach { stored ->
            val envelope = JSONObject(stored.json)
            val data = envelope.optJSONObject("data") ?: error("operating_driver_invalid")
            val lifecycle = data.optString("lifecycleState")
            require(lifecycle == "active" || lifecycle == "inactive") { "operating_driver_invalid" }
            if (lifecycle == "active") {
                val id = data.optString("driverId")
                require(identity.matches(id) && stored.id == DRIVER_PREFIX + id &&
                    data.optInt("schemaVersion", -1) == 1 && data.optString("name").isNotBlank()) {
                    "operating_driver_invalid"
                }
                activeDrivers.add(Profile(stored.id, envelope, data))
            }
        }
        require(activeDrivers.isNotEmpty()) { "operating_driver_missing" }
        require(activeDrivers.size == 1) { "operating_driver_ambiguous" }
        val driver = activeDrivers.single()
        require(driver.data.optString("driverId") == driverId) { "operating_driver_selection_mismatch" }

        val activeVehicles = mutableListOf<Profile>()
        records.filter { it.id.startsWith(VEHICLE_PREFIX) }.forEach { stored ->
            val envelope = JSONObject(stored.json)
            val data = envelope.optJSONObject("data") ?: error("operating_vehicle_invalid")
            val lifecycle = data.optString("lifecycleState")
            require(lifecycle == "active" || lifecycle == "inactive" || lifecycle == "sold") {
                "operating_vehicle_invalid"
            }
            if (lifecycle == "active") {
                val registration = data.optString("registrationNumber").replace(Regex("[\\s-]+"), "")
                    .uppercase(java.util.Locale.ROOT)
                val year = data.opt("yearOfManufacture") as? Number
                val fields = setOf("schemaVersion", "registrationNumber", "make", "model", "vehicleType",
                    "fuelType", "yearOfManufacture", "ownership", "lifecycleState")
                require(data.keys().asSequence().toSet() == fields && data.optInt("schemaVersion", -1) == 1 &&
                    registration.isNotBlank() && stored.id == VEHICLE_PREFIX + registration &&
                    data.optString("registrationNumber") == registration &&
                    listOf("make", "model", "vehicleType", "fuelType", "ownership").all {
                        data.optString(it).isNotBlank()
                    } && year != null && year.toDouble().isFinite() && year.toDouble() % 1.0 == 0.0 &&
                    year.toInt() > 0) { "operating_vehicle_invalid" }
                activeVehicles.add(Profile(stored.id, envelope, data))
            }
        }
        require(activeVehicles.isNotEmpty()) { "operating_vehicle_missing" }
        require(activeVehicles.size == 1) { "operating_vehicle_ambiguous" }
        val vehicle = activeVehicles.single()

        val activeAssignments = mutableListOf<ActiveAssignment>()
        records.filter { it.id.startsWith(ASSIGNMENT_PREFIX) }.forEach { stored ->
            val envelope = JSONObject(stored.json)
            val history = envelope.optJSONObject("data") ?: error("operating_assignment_invalid")
            val historyDriverId = history.optString("driverId")
            require(identity.matches(historyDriverId) && stored.id == ASSIGNMENT_PREFIX + historyDriverId &&
                history.optInt("schemaVersion", -1) == 1) { "operating_assignment_invalid" }
            val assignments = history.optJSONArray("assignments") ?: error("operating_assignment_invalid")
            val ids = mutableSetOf<String>()
            var previousAssignedAt: Instant? = null
            var previousUnassignedAt: Instant? = null
            for (index in 0 until assignments.length()) {
                val item = assignments.optJSONObject(index) ?: error("operating_assignment_invalid")
                require(item.keys().asSequence().all { it in setOf("assignmentId", "vehicleId", "assignedAt", "unassignedAt") } &&
                    identity.matches(item.optString("assignmentId")) && ids.add(item.optString("assignmentId")) &&
                    item.optString("vehicleId").matches(Regex("feature:vehicle:[A-Za-z0-9_-]{1,128}"))) {
                    "operating_assignment_invalid"
                }
                val assignedAt = runCatching { OffsetDateTime.parse(item.optString("assignedAt")).toInstant() }
                    .getOrElse { error("operating_assignment_invalid") }
                require(previousAssignedAt == null || !assignedAt.isBefore(previousAssignedAt)) {
                    "operating_assignment_invalid"
                }
                require(previousUnassignedAt == null || !assignedAt.isBefore(previousUnassignedAt)) {
                    "operating_assignment_invalid"
                }
                previousAssignedAt = assignedAt
                if (item.has("unassignedAt")) {
                    val unassignedAt = runCatching { OffsetDateTime.parse(item.optString("unassignedAt")).toInstant() }
                        .getOrElse { error("operating_assignment_invalid") }
                    require(!unassignedAt.isBefore(assignedAt)) { "operating_assignment_invalid" }
                    previousUnassignedAt = unassignedAt
                } else {
                    activeAssignments.add(ActiveAssignment(historyDriverId, envelope,
                        item.optString("assignmentId"), item.optString("vehicleId"), assignedAt))
                    previousUnassignedAt = null
                }
            }
        }
        require(activeAssignments.isNotEmpty()) { "operating_assignment_missing" }
        require(activeAssignments.size == 1) { "operating_assignment_ambiguous" }
        val assignment = activeAssignments.single()
        require(assignment.driverId == driverId && assignment.vehicleId == vehicle.id) {
            "operating_assignment_pair_mismatch"
        }
        val eventTime = runCatching { OffsetDateTime.parse(transitionAt).toInstant() }
            .getOrElse { error("invalid_transition_timestamp") }
        require(!assignment.assignedAt.isAfter(eventTime)) { "operating_assignment_not_effective" }

        return JSONObject().put("schemaVersion", 1)
            .put("driverId", driverId).put("vehicleId", vehicle.id)
            .put("assignmentId", assignment.assignmentId)
            .put("selectionRevision", selectionEnvelope.optInt("revision", -1))
            .put("driverRevision", driver.envelope.optInt("revision", -1))
            .put("vehicleRevision", vehicle.envelope.optInt("revision", -1))
            .put("assignmentRevision", assignment.record.optInt("revision", -1))
    }
}
