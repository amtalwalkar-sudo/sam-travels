package `in`.samtravels.app

import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.math.BigInteger

/** Finance-owned Room backup/restore validation for Loan schedules and payment history. */
internal object NativeFinanceBackup {
    private const val LOAN_PARTICIPANT_ID = "finance-records"
    private const val PAYMENT_PARTICIPANT_ID = "finance-payment-records"
    private const val PREPAYMENT_PARTICIPANT_ID = "finance-prepayment-records"
    private const val FEATURE_ID = "finance"
    private const val LOAN_PREFIX = "feature:finance:loan:"
    private const val PAYMENT_PREFIX = "feature:finance:payments:"
    private const val PREPAYMENT_PREFIX = "feature:finance:prepayments:"
    private const val PREPAYMENT_CALCULATION_ID = "finance.loan-prepayment-reamortization.v1"
    private const val CALCULATION_ID = "finance.loan-monthly-reducing-balance.v1"
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")
    private val PAYMENT_METHODS = setOf("cash", "bank_transfer", "cheque", "upi", "other")
    @Volatile private var processRegistration: AutoCloseable? = null

    @Synchronized
    fun ensureRegistered() {
        if (processRegistration == null) processRegistration = register()
    }

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
        require(validInstant(version.optString("createdAt"))) { "finance_loan_schedule_created_at_invalid" }
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
            val interest = BigInteger.valueOf(opening).multiply(BigInteger.valueOf(rate))
                .add(BigInteger.valueOf(60000L)).divide(BigInteger.valueOf(120000L)).longValueExact()
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

    private fun validateLoanRecords(rows: List<JSONObject>, allRows: List<JSONObject>) {
        val identities = mutableSetOf<String>()
        rows.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(envelope.optString("id") == id) { "finance_loan_record_identity_invalid" }
            val suffix = id.removePrefix(LOAN_PREFIX)
            require(id.startsWith(LOAN_PREFIX) && UUID.matches(suffix) &&
                id == LOAN_PREFIX + suffix.lowercase()) { "finance_loan_record_identity_invalid" }
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
    }

    private fun validatePaymentRecords(rows: List<JSONObject>, allRows: List<JSONObject>) {
        val ledgerIds = mutableSetOf<String>()
        rows.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(envelope.optString("id") == id) { "finance_payment_ledger_identity_invalid" }
            val suffix = id.removePrefix(PAYMENT_PREFIX)
            require(id.startsWith(PAYMENT_PREFIX) && UUID.matches(suffix) &&
                id == PAYMENT_PREFIX + suffix.lowercase()) { "finance_payment_ledger_identity_invalid" }
            require(ledgerIds.add(id)) { "finance_backup_duplicate_payment_ledger_identity" }

            val data = envelope.getJSONObject("data")
            require(data.keys().asSequence().toSet() == setOf("schemaVersion", "loanId", "entries") &&
                data.optInt("schemaVersion", -1) == 1) { "finance_payment_ledger_invalid" }
            val loanId = data.optString("loanId")
            require(loanId == LOAN_PREFIX + suffix.lowercase()) { "finance_payment_ledger_identity_invalid" }
            val loanRow = allRows.firstOrNull {
                it.optString("participantId") == LOAN_PARTICIPANT_ID && it.optString("id") == loanId
            } ?: error("finance_payment_loan_not_found")
            val loanData = JSONObject(loanRow.getString("json")).getJSONObject("data")
            val scheduleVersions = loanData.getJSONArray("scheduleVersions")

            val ids = mutableSetOf<String>()
            val commands = mutableSetOf<String>()
            val payments = linkedMapOf<String, JSONObject>()
            val reversals = mutableMapOf<String, JSONObject>()
            val activeAllocations = mutableMapOf<Pair<Int, Int>, Long>()
            val entries = data.getJSONArray("entries")

            for (index in 0 until entries.length()) {
                val entry = entries.getJSONObject(index)
                val kind = entry.optString("kind")
                val entryId = entry.optString("id")
                val commandId = entry.optString("commandId")
                require(entryId.isNotBlank() && ids.add(entryId) &&
                    commandId.isNotBlank() && commands.add(commandId) &&
                    entry.optString("loanId") == loanId &&
                    validInstant(entry.optString("createdAt")) &&
                    date(entry.optString("businessDate")).toString() == entry.optString("businessDate") &&
                    integer(entry, "amountPaise", 1) > 0 &&
                    entry.optString("status") == "committed" &&
                    entry.optString("source").isNotBlank()) { "finance_payment_entry_invalid" }

                when (kind) {
                    "payment" -> {
                        val allowed = setOf("kind", "id", "commandId", "loanId", "businessDate", "amountPaise",
                            "method", "reference", "note", "scheduleVersion", "createdAt", "source",
                            "allocations", "unallocatedCreditPaise", "status")
                        require(entry.keys().asSequence().all { it in allowed } &&
                            PAYMENT_METHODS.contains(entry.optString("method")) &&
                            (!entry.has("reference") || entry.optString("reference").isNotBlank()) &&
                            (!entry.has("note") || entry.optString("note").isNotBlank())) {
                            "finance_payment_entry_invalid"
                        }
                        val scheduleVersion = integer(entry, "scheduleVersion", 1).toInt()
                        require(scheduleVersion <= scheduleVersions.length()) { "finance_payment_schedule_version_not_found" }
                        val scheduleRows = scheduleVersions.getJSONObject(scheduleVersion - 1)
                            .getJSONObject("output").getJSONArray("rows")
                        val allocations = entry.getJSONArray("allocations")
                        var allocatedTotal = 0L
                        val installmentSet = mutableSetOf<Int>()
                        for (allocationIndex in 0 until allocations.length()) {
                            val allocation = allocations.getJSONObject(allocationIndex)
                            val installment = integer(allocation, "installmentNumber", 1).toInt()
                            val amount = integer(allocation, "amountPaise", 1)
                            val allocationId = allocation.optString("id")
                            require(allocation.keys().asSequence().toSet() == setOf("id", "paymentId", "loanId",
                                "scheduleVersion", "installmentNumber", "amountPaise", "createdAt", "source") &&
                                allocationId.isNotBlank() && ids.add(allocationId) &&
                                allocation.optString("paymentId") == entryId &&
                                allocation.optString("loanId") == loanId &&
                                integer(allocation, "scheduleVersion", 1) == scheduleVersion.toLong() &&
                                validInstant(allocation.optString("createdAt")) &&
                                allocation.optString("source").isNotBlank() &&
                                installmentSet.add(installment)) { "finance_payment_allocation_invalid" }
                            val scheduleRow = (0 until scheduleRows.length()).map { scheduleRows.getJSONObject(it) }
                                .firstOrNull { it.optInt("installmentNumber", -1) == installment }
                                ?: error("finance_payment_allocation_schedule_reference_invalid")
                            require(scheduleRow.optString("dueDate") <= entry.optString("businessDate")) {
                                "finance_payment_allocation_future_installment"
                            }
                            allocatedTotal = Math.addExact(allocatedTotal, amount)
                            val key = scheduleVersion to installment
                            activeAllocations[key] = Math.addExact(activeAllocations[key] ?: 0L, amount)
                        }
                        val paymentAmount = integer(entry, "amountPaise", 1)
                        val unallocated = integer(entry, "unallocatedCreditPaise")
                        require(allocatedTotal <= paymentAmount && allocatedTotal + unallocated == paymentAmount) {
                            "finance_payment_allocation_total_invalid"
                        }
                        payments[entryId] = entry
                    }
                    "reversal" -> {
                        val allowed = setOf("kind", "id", "commandId", "loanId", "paymentId", "businessDate",
                            "reason", "amountPaise", "createdAt", "source", "status")
                        require(entry.keys().asSequence().toSet() == allowed &&
                            entry.optString("paymentId").isNotBlank() &&
                            entry.optString("reason").isNotBlank() &&
                            !reversals.containsKey(entry.optString("paymentId"))) {
                            "finance_payment_reversal_invalid"
                        }
                        reversals[entry.optString("paymentId")] = entry
                    }
                    else -> error("finance_payment_entry_kind_invalid")
                }
            }
            reversals.forEach { (paymentId, reversal) ->
                val payment = payments[paymentId] ?: error("finance_payment_reversal_link_invalid")
                require(integer(reversal, "amountPaise", 1) == integer(payment, "amountPaise", 1)) {
                    "finance_payment_reversal_link_invalid"
                }
            }
            val reversedIds = reversals.keys
            for ((key, total) in activeAllocations) {
                val scheduleRows = scheduleVersions.getJSONObject(key.first - 1)
                    .getJSONObject("output").getJSONArray("rows")
                val rowForInstallment = (0 until scheduleRows.length()).map { scheduleRows.getJSONObject(it) }
                    .first { it.optInt("installmentNumber", -1) == key.second }
                // Reversed payments release their EMI coverage; recompute from active entries below.
                val activeTotal = payments.filterKeys { it !in reversedIds }.values.sumOf { payment ->
                    val allocations = payment.getJSONArray("allocations")
                    (0 until allocations.length()).sumOf { allocationIndex ->
                        val allocation = allocations.getJSONObject(allocationIndex)
                        if (integer(allocation, "scheduleVersion", 1).toInt() == key.first &&
                            integer(allocation, "installmentNumber", 1).toInt() == key.second) {
                            integer(allocation, "amountPaise", 1)
                        } else 0L
                    }
                }
                require(activeTotal <= integer(rowForInstallment, "installmentAmountPaise", 1)) {
                    "finance_payment_installment_overallocated"
                }
            }
        }
    }

    private fun validatePrepaymentRecords(rows: List<JSONObject>, allRows: List<JSONObject>) {
        val identities = mutableSetOf<String>()
        rows.forEach { row ->
            val id = row.optString("id")
            val envelope = JSONObject(row.getString("json"))
            RecordEnvelopeContract.validate(envelope)
            require(envelope.optString("id") == id) { "finance_loan_prepayment_record_identity_invalid" }
            val suffix = id.removePrefix(PREPAYMENT_PREFIX)
            require(id.startsWith(PREPAYMENT_PREFIX) && UUID.matches(suffix) &&
                id == PREPAYMENT_PREFIX + suffix.lowercase() && identities.add(id)) {
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
                integer(data, "currentScheduleVersion", 1) == baseVersion + revisions.length()) {
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
                    revision.optString("calculationId") == PREPAYMENT_CALCULATION_ID &&
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
                require(output.optString("calculationId") == PREPAYMENT_CALCULATION_ID &&
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

    fun register(): AutoCloseable {
        val loans = NativeBackupCoverage.registerFeatureRecordParticipant(
            id = LOAN_PARTICIPANT_ID,
            featureId = FEATURE_ID,
            snapshotVersion = 1,
            recordIdPrefix = LOAN_PREFIX,
            validateRelationships = ::validateLoanRecords,
        )
        try {
            val payments = NativeBackupCoverage.registerFeatureRecordParticipant(
                id = PAYMENT_PARTICIPANT_ID,
                featureId = FEATURE_ID,
                snapshotVersion = 1,
                recordIdPrefix = PAYMENT_PREFIX,
                validateRelationships = ::validatePaymentRecords,
            )
            val prepayments = NativeBackupCoverage.registerFeatureRecordParticipant(
                id = PREPAYMENT_PARTICIPANT_ID,
                featureId = FEATURE_ID,
                snapshotVersion = 1,
                recordIdPrefix = PREPAYMENT_PREFIX,
                validateRelationships = ::validatePrepaymentRecords,
            )
            return AutoCloseable {
                prepayments.close()
                payments.close()
                loans.close()
            }
        } catch (error: Throwable) {
            loans.close()
            throw error
        }
    }
}
