package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate

/** Installs Compliance Room backup validation before native backup, restore, or recovery. */
internal object NativeComplianceBackup {
    private const val PARTICIPANT_ID = "compliance-records"
    private const val FEATURE_ID = "compliance"
    private const val RECORD_PREFIX = "feature:compliance:"
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")
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
        validateRelationships = { rows, allRows ->
            val records = linkedMapOf<String, JSONObject>()
            rows.forEach { row ->
                val id = row.optString("id")
                require(id.startsWith(RECORD_PREFIX)) { "compliance_record_namespace_mismatch" }
                val envelope = JSONObject(row.getString("json"))
                RecordEnvelopeContract.validate(envelope)
                require(envelope.optString("id") == id) { "compliance_record_identity_mismatch" }
                val data = envelope.getJSONObject("data")
                val keys = data.keys().asSequence().toSet()
                val required = setOf("schemaVersion", "vehicleId", "complianceName", "validFrom", "validTo", "totalCostPaise")
                val allowed = required + setOf("supportingDocumentRef", "renewedFromRecordId")
                require(keys.containsAll(required) && keys.all { it in allowed } &&
                    data.optInt("schemaVersion", -1) == 1) { "compliance_record_invalid" }
                val uuid = id.removePrefix(RECORD_PREFIX)
                require(UUID.matches(uuid) && id == RECORD_PREFIX + uuid.lowercase()) {
                    "compliance_record_identity_invalid"
                }
                val vehicleId = data.optString("vehicleId")
                require(vehicleId.startsWith("feature:vehicle:") &&
                    vehicleId.removePrefix("feature:vehicle:").isNotBlank()) { "compliance_record_invalid" }
                val name = data.optString("complianceName")
                require(name.isNotBlank() && name == name.trim()) { "compliance_record_invalid" }
                val from = data.optString("validFrom")
                val to = data.optString("validTo")
                val validPeriod = runCatching {
                    LocalDate.parse(from).toString() == from &&
                        LocalDate.parse(to).toString() == to &&
                        !LocalDate.parse(to).isBefore(LocalDate.parse(from))
                }.getOrDefault(false)
                require(validPeriod) { "compliance_record_invalid" }
                val cost = data.opt("totalCostPaise")
                require(cost is Number && (cost is Int || cost is Long) && cost.toLong() >= 0L) {
                    "compliance_record_invalid"
                }
                if (data.has("supportingDocumentRef")) {
                    require(data.optString("supportingDocumentRef").isNotBlank()) {
                        "compliance_record_document_reference_invalid"
                    }
                }
                records[id] = data
            }
            val vehicles = allRows.filter { it.optString("participantId") == "vehicle-records" }
                .associate { row ->
                    val vehicleId = row.optString("id")
                    val envelope = JSONObject(row.getString("json"))
                    val vehicle = envelope.getJSONObject("data")
                    val registration = vehicle.optString("registrationNumber")
                    require(vehicleId == "feature:vehicle:" + registration &&
                        registration.isNotBlank() &&
                        registration == registration.uppercase().filterNot { it.isWhitespace() || it == '-' }) {
                        "compliance_vehicle_identity_mismatch"
                    }
                    vehicleId to vehicle
                }
            rows.forEach { row ->
                val id = row.optString("id")
                val data = records.getValue(id)
                require(vehicles.containsKey(data.optString("vehicleId"))) {
                    "compliance_vehicle_not_found"
                }
                if (data.has("renewedFromRecordId")) {
                    val previousId = data.optString("renewedFromRecordId")
                    val previous = records[previousId] ?: error("compliance_renewal_source_not_found")
                    require(previous.optString("vehicleId") == data.optString("vehicleId") &&
                        previous.optString("complianceName") == data.optString("complianceName")) {
                        "compliance_renewal_source_mismatch"
                    }
                }
            }
        },
    )
}
