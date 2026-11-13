package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** Native backup/restore validation for the shared Business Expenses source records. */
internal object NativeBusinessExpensesBackup {
    private const val PARTICIPANT_ID = "business-expenses-records"
    private const val FEATURE_ID = "business-expenses"
    private const val PREFIX = "feature:business-expenses:"
    private const val FUEL_PREFIX = PREFIX + "fuel:"
    private const val ENTRY_PREFIX = PREFIX + "entry:"
    @Volatile private var processRegistration: AutoCloseable? = null

    @Synchronized
    fun ensureRegistered() {
        if (processRegistration == null) processRegistration = register()
    }

    private fun integer(data: JSONObject, key: String, minimum: Long = 1L): Long {
        val value = data.opt(key)
        require(value is Number && value.toDouble() == value.toLong().toDouble() && value.toLong() >= minimum) {
            "business_expense_field_invalid:$key"
        }
        return value.toLong()
    }

    private fun validDate(value: String): Boolean =
        runCatching { java.time.LocalDate.parse(value).toString() == value }.getOrDefault(false)

    private fun validUuid(value: String): Boolean =
        runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)

    private fun validateFuel(data: JSONObject, id: String) {
        val keys = setOf("schemaVersion", "kind", "id", "revision", "businessDate", "occurredAt",
            "vehicleId", "odometerKm", "pricePaisePerKg", "amountPaise", "partialRefill")
        val optional = setOf("locationEvidence")
        val actualKeys = data.keys().asSequence().toSet()
        require(actualKeys.containsAll(keys) && actualKeys.all { it in keys || it in optional } && data.optInt("schemaVersion", -1) == 1 &&
            data.optString("kind") == "fuel_purchase" && data.optString("id") == id &&
            id.startsWith(FUEL_PREFIX) && validUuid(id.removePrefix(FUEL_PREFIX)) &&
            integer(data, "revision") == 1L && validDate(data.optString("businessDate")) &&
            data.optString("vehicleId").startsWith("feature:vehicle:") &&
            data.opt("partialRefill") is Boolean) {
            "fuel_purchase_invalid"
        }
        val instant = Instant.parse(data.optString("occurredAt"))
        require(instant.plusSeconds(330L * 60L).atZone(ZoneOffset.UTC).toLocalDate().toString() ==
            data.optString("businessDate")) { "fuel_purchase_business_date_invalid" }
        integer(data, "odometerKm")
        integer(data, "pricePaisePerKg")
        integer(data, "amountPaise")
        if (data.has("locationEvidence")) {
            val evidence = data.getJSONObject("locationEvidence")
            require(evidence.keys().asSequence().toSet() == setOf("latitude", "longitude", "accuracyMeters", "capturedAt", "provider") &&
                evidence.optDouble("latitude", 999.0) in -90.0..90.0 &&
                evidence.optDouble("longitude", 999.0) in -180.0..180.0 &&
                evidence.optDouble("accuracyMeters", 0.0) > 0.0 &&
                evidence.optString("provider") == "device") { "fuel_location_evidence_invalid" }
            Instant.parse(evidence.optString("capturedAt"))
        }
    }

    private fun validateExpense(data: JSONObject, id: String) {
        val required = setOf("schemaVersion", "kind", "id", "revision", "sourceKind", "businessDate",
            "amountPaise", "currencyCode", "effect")
        val optional = setOf("reversesSourceId", "vehicleId", "driverId", "category", "description",
            "reference", "alreadyNettedFromIncome", "paymentStatus")
        val keys = data.keys().asSequence().toSet()
        require(keys.containsAll(required) && keys.all { it in required || it in optional } &&
            data.optInt("schemaVersion", -1) == 1 && data.optString("kind") == "business_expense" &&
            data.optString("id") == id && id.startsWith(ENTRY_PREFIX) &&
            validUuid(id.removePrefix(ENTRY_PREFIX)) && integer(data, "revision") == 1L &&
            data.optString("sourceKind") in setOf("platform_fee", "traffic_challan", "miscellaneous") &&
            validDate(data.optString("businessDate")) && integer(data, "amountPaise") > 0L &&
            data.optString("currencyCode") == "INR" && data.optString("effect") in setOf("charge", "reversal")) {
            "business_expense_entry_invalid"
        }
        if (data.optString("effect") == "reversal") {
            require(data.optString("reversesSourceId").startsWith(ENTRY_PREFIX)) {
                "business_expense_reversal_link_invalid"
            }
        } else require(!data.has("reversesSourceId")) { "business_expense_entry_invalid" }
        if (data.has("vehicleId")) require(data.optString("vehicleId").startsWith("feature:vehicle:")) {
            "business_expense_entry_invalid"
        }
        if (data.has("driverId")) require(data.optString("driverId").startsWith("feature:driver:")) {
            "business_expense_entry_invalid"
        }
        when (data.optString("sourceKind")) {
            "platform_fee" -> require(data.optString("reference").isNotBlank()) { "platform_fee_source_reference_required" }
            "traffic_challan" -> require(data.optString("vehicleId").isNotBlank() &&
                (data.optString("description").isNotBlank() || data.optString("reference").isNotBlank())) { "traffic_challan_vehicle_required" }
            "miscellaneous" -> require(data.optString("category").isNotBlank()) { "miscellaneous_expense_category_required" }
        }
        if (data.has("alreadyNettedFromIncome")) require(data.opt("alreadyNettedFromIncome") is Boolean && data.optString("sourceKind") == "platform_fee") {
            "business_expense_income_treatment_not_applicable"
        }
        if (data.has("paymentStatus")) require(data.optString("sourceKind") == "traffic_challan" && data.optString("paymentStatus") in setOf("unpaid", "paid")) {
            "traffic_challan_payment_status_invalid"
        }
        if (data.optString("sourceKind") == "traffic_challan") require(data.has("paymentStatus")) {
            "traffic_challan_payment_status_required"
        }
        if (data.has("paymentStatus")) require(data.optString("sourceKind") == "traffic_challan" && data.optString("paymentStatus") in setOf("unpaid", "paid")) {
            "traffic_challan_payment_status_invalid"
        }
        if (data.optString("sourceKind") == "traffic_challan") require(data.has("paymentStatus")) {
            "traffic_challan_payment_status_required"
        }
    }

    private fun validateRecords(rows: List<JSONObject>, allRows: List<JSONObject>) {
        val entries = mutableMapOf<String, JSONObject>()
        rows.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(envelope.optString("id") == id) { "business_expense_record_identity_invalid" }
            val data = envelope.getJSONObject("data")
            when (data.optString("kind")) {
                "fuel_purchase" -> validateFuel(data, id)
                "business_expense" -> validateExpense(data, id)
                else -> error("business_expense_record_kind_invalid")
            }
            require(entries.put(id, data) == null) { "business_expense_backup_duplicate_identity" }
            val vehicleId = data.optString("vehicleId")
            if (vehicleId.isNotBlank()) require(allRows.any {
                it.optString("participantId") == "vehicle-records" && it.optString("id") == vehicleId
            }) { "business_expense_vehicle_not_found" }
            val driverId = data.optString("driverId")
            if (driverId.isNotBlank()) require(allRows.any {
                it.optString("participantId") == "driver-records" && it.optString("id") == driverId
            }) { "business_expense_driver_not_found" }
        }
        val reversed = mutableSetOf<String>()
        entries.values.filter { it.optString("kind") == "business_expense" && it.optString("effect") == "reversal" }
            .forEach { reversal ->
                val originalId = reversal.optString("reversesSourceId")
                require(reversed.add(originalId)) { "business_expense_reversal_link_invalid" }
                val original = entries[originalId]
                    ?: error("business_expense_reversal_link_invalid")
                require(original.optString("kind") == "business_expense" &&
                    original.optString("effect") == "charge" &&
                    original.optString("sourceKind") == reversal.optString("sourceKind") &&
                    integer(original, "amountPaise") == integer(reversal, "amountPaise") &&
                    original.optString("businessDate") <= reversal.optString("businessDate") &&
                    original.optBoolean("alreadyNettedFromIncome") == reversal.optBoolean("alreadyNettedFromIncome") &&
                    original.optString("paymentStatus") == reversal.optString("paymentStatus")) {
                    "business_expense_reversal_link_invalid"
                }
            }
    }

    private fun register(): AutoCloseable = NativeBackupCoverage.registerFeatureRecordParticipant(
        id = PARTICIPANT_ID,
        featureId = FEATURE_ID,
        snapshotVersion = 1,
        recordIdPrefix = PREFIX,
        validateRelationships = ::validateRecords,
    )
}
