package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject

/** Validates the small settlement-to-Loan lifecycle link in a Finance backup snapshot. */
internal object NativeFinanceSettlementBackup {
    private fun integer(value: JSONObject, key: String, minimum: Long = 0L): Long {
        val raw = value.opt(key)
        require(raw is Number && (raw is Int || raw is Long) && raw.toLong() >= minimum) {
            "finance_loan_field_invalid:$key"
        }
        return raw.toLong()
    }

    fun validate(
        loanData: JSONObject,
        settlements: List<JSONObject>,
        payments: Map<String, JSONObject>,
        reversedIds: Set<String>,
        scheduleRowsForVersion: (Int) -> JSONArray,
    ) {
        val lifecycleState = loanData.optString("lifecycleState", "active")
        require(lifecycleState in setOf("active", "closed") &&
            ((lifecycleState == "closed" && settlements.size == 1) ||
                (lifecycleState == "active" && settlements.isEmpty()))) {
            "finance_loan_settlement_lifecycle_mismatch"
        }
        val settlement = settlements.singleOrNull() ?: return
        val version = integer(settlement, "scheduleVersion", 1).toInt()
        val rows = scheduleRowsForVersion(version)
        val settlementDate = settlement.optString("businessDate")
        val paidThrough = integer(settlement, "paidThroughInstallment", 1).toInt()
        val dueRows = (0 until rows.length()).map { rows.getJSONObject(it) }
            .filter { it.optString("dueDate") <= settlementDate }
        val settlementRow = dueRows.firstOrNull { it.optInt("installmentNumber", -1) == paidThrough }
            ?: error("finance_payment_settlement_not_emi_date")
        require(settlementRow.optString("dueDate") == settlementDate &&
            integer(settlement, "amountPaise", 1) == integer(settlementRow, "closingPrincipalPaise", 1)) {
            "finance_payment_settlement_amount_invalid"
        }
        for (dueRow in dueRows) {
            val installment = dueRow.optInt("installmentNumber", -1)
            val paid = payments.filterKeys { it !in reversedIds }.values.sumOf { payment ->
                val allocations = payment.getJSONArray("allocations")
                (0 until allocations.length()).sumOf { index ->
                    val allocation = allocations.getJSONObject(index)
                    if (integer(payment, "scheduleVersion", 1).toInt() == version &&
                        integer(allocation, "installmentNumber", 1).toInt() == installment)
                        integer(allocation, "amountPaise", 1) else 0L
                }
            }
            require(paid == integer(dueRow, "installmentAmountPaise", 1)) {
                "finance_payment_settlement_due_emi_not_fully_paid"
            }
        }
    }
}
