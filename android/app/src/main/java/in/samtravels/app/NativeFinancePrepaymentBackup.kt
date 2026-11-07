package `in`.samtravels.app

import org.json.JSONObject
import java.math.BigInteger
import java.time.LocalDate
import java.time.YearMonth

/** Native backup/restore participant for Finance-owned prepayment schedule revisions. */
internal object NativeFinancePrepaymentBackup {
    const val PARTICIPANT_ID = "finance-prepayment-records"
    const val RECORD_ID_PREFIX = "feature:finance:prepayments:"
    private const val LOAN_PARTICIPANT_ID = "finance-records"
    private const val LOAN_PREFIX = "feature:finance:loan:"
    private const val CALCULATION_ID = "finance.loan-prepayment-reamortization.v1"
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")

    private fun date(value: String): LocalDate = LocalDate.parse(value).also {
        require(it.toString() == value) { "finance_loan_date_invalid" }
    }
    private fun validInstant(value: String): Boolean =
        runCatching { java.time.Instant.parse(value) }.isSuccess
    private fun integer(value: JSONObject, key: String, minimum: Long = 0L): Long {
        val raw = value.opt(key)
        require(raw is Number && (raw is Int || raw is Long) && raw.toLong() >= minimum) {
            "finance_loan_field_invalid:$key"
        }
        return raw.toLong()
    }

    private fun validateRecords(rows: List<JSONObject>, allRows: List<JSONObject>) {
        val identities = mutableSetOf<String>()
        rows.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(envelope.optString("id") == id) { "finance_loan_prepayment_record_identity_invalid" }
            val suffix = id.removePrefix(RECORD_ID_PREFIX)
            require(id.startsWith(RECORD_ID_PREFIX) && UUID.matches(suffix) &&
                id == RECORD_ID_PREFIX + suffix.lowercase() && identities.add(id)) {
                "finance_loan_prepayment_record_identity_invalid"
            }
            val data = envelope.getJSONObject("data")
            require(data.keys().asSequence().toSet() == setOf("schemaVersion", "kind", "loanId",
                "baseScheduleVersion", "currentScheduleVersion", "revisions") &&
                data.optInt("schemaVersion", -1) == 1 && data.optString("kind") == "loan-prepayment-state") {
                "finance_loan_prepayment_state_invalid"
            }
            val loanId = data.optString("loanId")
            require(loanId == LOAN_PREFIX + suffix.lowercase()) { "finance_loan_prepayment_record_identity_invalid" }
            val loanRow = allRows.firstOrNull {
                it.optString("participantId") == LOAN_PARTICIPANT_ID && it.optString("id") == loanId
            } ?: error("finance_loan_not_found")
            val loanData = JSONObject(loanRow.getString("json")).getJSONObject("data")
            val baseVersion = integer(data, "baseScheduleVersion", 1).toInt()
            require(baseVersion <= loanData.getJSONArray("scheduleVersions").length()) {
                "finance_loan_prepayment_base_schedule_not_found"
            }
            val revisions = data.getJSONArray("revisions")
            require(revisions.length() > 0 &&
                integer(data, "currentScheduleVersion", 1) == (baseVersion + revisions.length()).toLong()) {
                "finance_loan_prepayment_schedule_history_invalid"
            }
            val commands = mutableSetOf<String>()
            var previousCreatedAt = ""
            for (index in 0 until revisions.length()) {
                val revision = revisions.getJSONObject(index)
                val before = integer(revision, "principalBeforePaise", 1)
                val amount = integer(revision, "prepaymentAmountPaise", 1)
                val after = integer(revision, "principalAfterPaise", 1)
                val commandId = revision.optString("commandId")
                val createdAt = revision.optString("createdAt")
                val mode = revision.optString("mode")
                require(revision.keys().asSequence().toSet() == setOf("version", "commandId", "effectiveDate",
                    "createdAt", "mode", "principalBeforePaise", "prepaymentAmountPaise", "principalAfterPaise",
                    "calculationId", "calculationVersion", "inputSchemaVersion", "outputSchemaVersion", "input", "output") &&
                    integer(revision, "version", 1) == baseVersion + index + 1L &&
                    commandId.isNotBlank() && commands.add(commandId) &&
                    date(revision.optString("effectiveDate")).toString() == revision.optString("effectiveDate") &&
                    validInstant(createdAt) && (previousCreatedAt.isEmpty() || createdAt >= previousCreatedAt) &&
                    mode in setOf("reduce_tenure", "reduce_emi") && amount < before && after == before - amount &&
                    revision.optString("calculationId") == CALCULATION_ID &&
                    integer(revision, "calculationVersion", 1) == 1L &&
                    integer(revision, "inputSchemaVersion", 1) == 1L &&
                    integer(revision, "outputSchemaVersion", 1) == 1L) {
                    "finance_loan_prepayment_revision_invalid"
                }
                previousCreatedAt = createdAt
                val input = revision.getJSONObject("input")
                require(input.keys().asSequence().toSet() == setOf("principalPaise", "baselinePrincipalPaise",
                    "annualInterestRateBasisPoints", "regularEmiPaise", "remainingDueDates", "mode") &&
                    integer(input, "principalPaise", 1) == after &&
                    integer(input, "baselinePrincipalPaise", 1) == before &&
                    integer(input, "annualInterestRateBasisPoints") ==
                        integer(loanData.getJSONObject("details"), "annualInterestRateBasisPoints") &&
                    integer(input, "regularEmiPaise", 1) > 0 && input.optString("mode") == mode) {
                    "finance_loan_prepayment_input_invalid"
                }
                val dates = input.getJSONArray("remainingDueDates")
                require(dates.length() in 1..1200) { "finance_loan_prepayment_due_dates_invalid" }
                val firstDue = date(dates.getString(0))
                for (dateIndex in 0 until dates.length()) {
                    require(date(dates.getString(dateIndex)) == YearMonth.from(firstDue)
                        .plusMonths(dateIndex.toLong()).atDay(1)) { "finance_loan_prepayment_due_dates_invalid" }
                }
                val output = revision.getJSONObject("output")
                require(output.optString("calculationId") == CALCULATION_ID &&
                    integer(output, "calculationVersion", 1) == 1L && output.optString("mode") == mode &&
                    integer(output, "openingPrincipalPaise", 1) == after) {
                    "finance_loan_prepayment_output_invalid"
                }
                val emi = integer(output, "regularEmiPaise", 1)
                val priorEmi = integer(input, "regularEmiPaise", 1)
                require(if (mode == "reduce_tenure") emi == priorEmi else emi <= priorEmi) {
                    "finance_loan_prepayment_emi_invalid"
                }
                val scheduleRows = output.getJSONArray("rows")
                require(scheduleRows.length() in 1..dates.length() &&
                    (mode != "reduce_emi" || scheduleRows.length() == dates.length())) {
                    "finance_loan_prepayment_rows_invalid"
                }
                var opening = after
                var interestTotal = 0L
                var paymentTotal = 0L
                for (rowIndex in 0 until scheduleRows.length()) {
                    val scheduleRow = scheduleRows.getJSONObject(rowIndex)
                    val interest = BigInteger.valueOf(opening)
                        .multiply(BigInteger.valueOf(integer(input, "annualInterestRateBasisPoints")))
                        .add(BigInteger.valueOf(60000L)).divide(BigInteger.valueOf(120000L)).longValueExact()
                    val payment = integer(scheduleRow, "installmentAmountPaise", 1)
                    val principalPart = integer(scheduleRow, "principalComponentPaise", 1)
                    val closing = integer(scheduleRow, "closingPrincipalPaise")
                    require(scheduleRow.optInt("installmentNumber", -1) == rowIndex + 1 &&
                        scheduleRow.optString("dueDate") == dates.getString(rowIndex) &&
                        integer(scheduleRow, "openingPrincipalPaise", 1) == opening &&
                        integer(scheduleRow, "interestPaise") == interest &&
                        principalPart == payment - interest && closing == opening - principalPart &&
                        scheduleRow.optBoolean("finalAdjusted") == (payment == opening + interest) &&
                        (rowIndex == scheduleRows.length() - 1 || payment == emi)) {
                        "finance_loan_prepayment_schedule_row_invalid"
                    }
                    interestTotal = Math.addExact(interestTotal, interest)
                    paymentTotal = Math.addExact(paymentTotal, payment)
                    opening = closing
                }
                require(opening == 0L &&
                    integer(output, "remainingInstallmentCount", 1) == scheduleRows.length().toLong() &&
                    output.optString("finalDueDate") == scheduleRows.getJSONObject(scheduleRows.length() - 1).optString("dueDate") &&
                    integer(output, "totalInterestPaise") == interestTotal &&
                    integer(output, "totalScheduledPaymentsPaise") == paymentTotal) {
                    "finance_loan_prepayment_schedule_totals_invalid"
                }
            }
        }
    }



    fun register(): AutoCloseable = NativeBackupCoverage.registerFeatureRecordParticipant(
        id = PARTICIPANT_ID,
        featureId = "finance",
        snapshotVersion = 1,
        recordIdPrefix = RECORD_ID_PREFIX,
        validateRelationships = ::validateRecords,
    )
}
