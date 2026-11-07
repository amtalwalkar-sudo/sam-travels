package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.math.BigInteger

/** Finance-owned Room backup/restore validation for immutable original EMI schedules. */
internal object NativeFinanceBackup {
    private const val PARTICIPANT_ID = "finance-records"
    private const val FEATURE_ID = "finance"
    private const val RECORD_PREFIX = "feature:finance:loan:"
    private const val CALCULATION_ID = "finance.loan-monthly-reducing-balance.v1"
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")
    @Volatile private var processRegistration: AutoCloseable? = null

    @Synchronized
    fun ensureRegistered() {
        if (processRegistration == null) processRegistration = register()
    }

    private fun date(value: String): LocalDate = LocalDate.parse(value).also {
        require(it.toString() == value) { "finance_loan_date_invalid" }
    }

    private fun integer(value: JSONObject, key: String, minimum: Long = 0L): Long {
        val raw = value.opt(key)
        require(raw is Number && (raw is Int || raw is Long) && raw.toLong() >= minimum) {
            "finance_loan_field_invalid:$key"
        }
        return raw.toLong()
    }

    private fun validateDetails(details: JSONObject) {
        val required = setOf("loanName", "lenderName", "vehicleId", "principalPaise",
            "annualInterestRateBasisPoints", "loanStartDate", "tenureMonths", "firstEmiDate")
        val allowed = required + "loanAccountReference"
        val keys = details.keys().asSequence().toSet()
        require(keys.containsAll(required) && keys.all { it in allowed }) { "finance_loan_details_invalid" }
        require(details.optString("loanName").isNotBlank() && details.optString("lenderName").isNotBlank()) {
            "finance_loan_details_invalid"
        }
        if (details.has("loanAccountReference")) require(details.optString("loanAccountReference").isNotBlank()) {
            "finance_loan_details_invalid"
        }
        require(details.optString("vehicleId").startsWith("feature:vehicle:")) { "finance_loan_vehicle_invalid" }
        integer(details, "principalPaise", 1)
        integer(details, "annualInterestRateBasisPoints")
        val tenure = integer(details, "tenureMonths", 1)
        require(tenure <= 1200L) { "finance_loan_tenure_invalid" }
        val start = date(details.optString("loanStartDate"))
        val first = date(details.optString("firstEmiDate"))
        require(!first.isBefore(start) && first.dayOfMonth == 1) { "finance_loan_dates_invalid" }
    }

    private fun validateSchedule(version: JSONObject, expectedVersion: Int, loanData: JSONObject, details: JSONObject) {
        require(version.optInt("version", -1) == expectedVersion &&
            version.optString("calculationId") == CALCULATION_ID &&
            version.optInt("calculationVersion", -1) == 1 &&
            version.optInt("inputSchemaVersion", -1) == 1 &&
            version.optInt("outputSchemaVersion", -1) == 1) { "finance_loan_schedule_version_invalid" }
        require(runCatching { java.time.Instant.parse(version.optString("createdAt")) }.isSuccess) {
            "finance_loan_schedule_created_at_invalid"
        }
        val input = version.getJSONObject("input")
        val inputKeys = setOf("principalPaise", "annualInterestRateBasisPoints", "tenureMonths", "loanStartDate", "firstEmiDate")
        require(input.keys().asSequence().toSet() == inputKeys) { "finance_loan_schedule_input_invalid" }
        val principal = integer(input, "principalPaise", 1)
        val rate = integer(input, "annualInterestRateBasisPoints")
        val tenure = integer(input, "tenureMonths", 1)
        require(tenure <= 1200L) { "finance_loan_schedule_input_invalid" }
        val start = date(input.optString("loanStartDate"))
        val first = date(input.optString("firstEmiDate"))
        require(!first.isBefore(start) && first.dayOfMonth == 1 &&
            version.optString("effectiveDate") == start.toString()) { "finance_loan_schedule_input_invalid" }

        val output = version.getJSONObject("output")
        require(output.optString("currencyCode") == "INR" &&
            integer(output, "principalPaise", 1) == principal &&
            integer(output, "annualInterestRateBasisPoints") == rate &&
            integer(output, "tenureMonths", 1) == tenure &&
            integer(output, "monthlyRateNumerator") == rate &&
            integer(output, "monthlyRateDenominator", 1) == 120000L) {
            "finance_loan_schedule_output_invalid"
        }
        val regularEmi = integer(output, "regularEmiPaise", 1)
        val rows = output.getJSONArray("rows")
        require(rows.length() in 1..tenure.toInt()) { "finance_loan_schedule_rows_invalid" }
        var opening = principal
        var interestTotal = 0L
        var paymentTotal = 0L
        for (index in 0 until rows.length()) {
            val row = rows.getJSONObject(index)
            val interest = BigInteger.valueOf(opening).multiply(BigInteger.valueOf(rate))\n                .add(BigInteger.valueOf(60000L)).divide(BigInteger.valueOf(120000L)).longValueExact()
            val amount = integer(row, "installmentAmountPaise", 1)
            val principalPart = integer(row, "principalComponentPaise", 1)
            val closing = integer(row, "closingPrincipalPaise")
            require(row.optInt("installmentNumber", -1) == index + 1 &&
                row.optString("dueDate") == YearMonth.from(first).plusMonths(index.toLong()).atDay(1).toString() &&
                integer(row, "openingPrincipalPaise") == opening &&
                integer(row, "interestPaise") == interest &&
                principalPart == amount - interest && closing == opening - principalPart &&
                amount <= Math.addExact(opening, interest) &&
                row.optBoolean("finalAdjusted") == (index == rows.length() - 1)) {
                "finance_loan_schedule_row_invalid"
            }
            if (index < rows.length() - 1) require(amount == regularEmi) { "finance_loan_schedule_emi_invalid" }
            interestTotal += interest
            paymentTotal += amount
            opening = closing
        }
        require(opening == 0L && integer(output, "totalInterestPaise") == interestTotal &&
            integer(output, "totalScheduledPaymentsPaise") == paymentTotal) {
            "finance_loan_schedule_totals_invalid"
        }
        if (expectedVersion == loanData.optInt("currentScheduleVersion")) {
            require(principal == integer(details, "principalPaise", 1) &&
                rate == integer(details, "annualInterestRateBasisPoints") &&
                tenure == integer(details, "tenureMonths", 1) &&
                start.toString() == details.optString("loanStartDate") &&
                first.toString() == details.optString("firstEmiDate")) {
                "finance_loan_current_schedule_details_mismatch"
            }
        }
    }

    fun register(): AutoCloseable = NativeBackupCoverage.registerFeatureRecordParticipant(
        id = PARTICIPANT_ID,
        featureId = FEATURE_ID,
        snapshotVersion = 1,
        recordIdPrefix = RECORD_PREFIX,
        validateRelationships = { rows, allRows ->
            val identities = mutableSetOf<String>()
            rows.forEach { row ->
                val id = row.optString("id")
                val envelope = JSONObject(row.getString("json"))
                RecordEnvelopeContract.validate(envelope)
                require(envelope.optString("id") == id) { "finance_loan_record_identity_invalid" }
                val suffix = id.removePrefix(RECORD_PREFIX)
                require(id.startsWith(RECORD_PREFIX) && UUID.matches(suffix) &&
                    id == RECORD_PREFIX + suffix.lowercase()) { "finance_loan_record_identity_invalid" }
                require(identities.add(id)) { "finance_backup_duplicate_loan_identity" }
                val data = envelope.getJSONObject("data")
                require(data.keys().asSequence().toSet() ==
                    setOf("schemaVersion", "kind", "details", "currentScheduleVersion", "scheduleVersions") &&
                    data.optInt("schemaVersion", -1) == 1 && data.optString("kind") == "loan") {
                    "finance_loan_record_invalid"
                }
                val details = data.getJSONObject("details")
                validateDetails(details)
                val vehicleId = details.optString("vehicleId")
                val vehicle = allRows.firstOrNull {
                    it.optString("participantId") == "vehicle-records" && it.optString("id") == vehicleId
                } ?: error("finance_loan_vehicle_not_found")
                val vehicleEnvelope = JSONObject(vehicle.getString("json"))
                val vehicleData = vehicleEnvelope.getJSONObject("data")
                val registration = vehicleData.optString("registrationNumber")
                require(vehicleId == "feature:vehicle:" + registration &&
                    registration.isNotBlank() &&
                    registration == registration.uppercase().filterNot { it.isWhitespace() || it == '-' }) {
                    "finance_loan_vehicle_identity_mismatch"
                }
                val versions = data.getJSONArray("scheduleVersions")
                require(versions.length() >= 1 && data.optInt("currentScheduleVersion", -1) == versions.length()) {
                    "finance_loan_schedule_history_invalid"
                }
                for (index in 0 until versions.length()) {
                    validateSchedule(versions.getJSONObject(index), index + 1, data, details)
                }
            }
        },
    )
}
