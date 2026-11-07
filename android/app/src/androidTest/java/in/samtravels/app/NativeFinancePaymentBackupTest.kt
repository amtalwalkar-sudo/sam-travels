package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NativeFinancePaymentBackupTest {
    private val timestamp = "2026-11-08T00:00:00.000Z"
    private val vehicleId = "feature:vehicle:MH01AB1234"
    private val loanId = "feature:finance:loan:123e4567-e89b-42d3-a456-426614174000"
    private val paymentLedgerId = "feature:finance:payments:123e4567-e89b-42d3-a456-426614174000"
    private val prepaymentStateId = "feature:finance:prepayments:123e4567-e89b-42d3-a456-426614174000"

    private fun record(id: String, data: JSONObject): StoredRecord {
        val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp)
            .put("source", "web").put("revision", 1).put("data", data)
        return StoredRecord(id, envelope.toString(), 1, timestamp)
    }

    private fun vehicleRecord() = record(vehicleId, JSONObject()
        .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
        .put("make", "Example").put("model", "Sedan").put("vehicleType", "Car")
        .put("fuelType", "Petrol").put("yearOfManufacture", 2022)
        .put("ownership", "Owned").put("lifecycleState", "active"))

    private fun loanRecord(): StoredRecord {
        val scheduleRow = JSONObject().put("installmentNumber", 1).put("dueDate", "2026-11-01")
            .put("openingPrincipalPaise", 10000).put("interestPaise", 0)
            .put("installmentAmountPaise", 10000).put("principalComponentPaise", 10000)
            .put("closingPrincipalPaise", 0).put("finalAdjusted", true)
        val output = JSONObject().put("currencyCode", "INR").put("principalPaise", 10000)
            .put("annualInterestRateBasisPoints", 0).put("tenureMonths", 1)
            .put("monthlyRateNumerator", 0).put("monthlyRateDenominator", 120000)
            .put("regularEmiPaise", 10000).put("rows", JSONArray().put(scheduleRow))
            .put("totalInterestPaise", 0).put("totalScheduledPaymentsPaise", 10000)
        val input = JSONObject().put("principalPaise", 10000)
            .put("annualInterestRateBasisPoints", 0).put("tenureMonths", 1)
            .put("loanStartDate", "2026-10-01").put("firstEmiDate", "2026-11-01")
        val version = JSONObject().put("version", 1).put("createdAt", timestamp)
            .put("effectiveDate", "2026-10-01")
            .put("calculationId", "finance.loan-monthly-reducing-balance.v1")
            .put("calculationVersion", 1).put("inputSchemaVersion", 1)
            .put("outputSchemaVersion", 1).put("input", input).put("output", output)
        val details = JSONObject().put("loanName", "Vehicle loan").put("lenderName", "Example lender")
            .put("vehicleId", vehicleId).put("principalPaise", 10000)
            .put("annualInterestRateBasisPoints", 0).put("loanStartDate", "2026-10-01")
            .put("tenureMonths", 1).put("firstEmiDate", "2026-11-01")
        return record(loanId, JSONObject().put("schemaVersion", 1).put("kind", "loan")
            .put("details", details).put("currentScheduleVersion", 1)
            .put("scheduleVersions", JSONArray().put(version)))
    }

    private fun prepaymentRecord(): StoredRecord {
        val row = JSONObject().put("installmentNumber", 1).put("dueDate", "2026-11-01")
            .put("openingPrincipalPaise", 5000).put("interestPaise", 0)
            .put("installmentAmountPaise", 5000).put("principalComponentPaise", 5000)
            .put("closingPrincipalPaise", 0).put("finalAdjusted", true)
        val input = JSONObject().put("principalPaise", 5000).put("baselinePrincipalPaise", 10000)
            .put("annualInterestRateBasisPoints", 0).put("regularEmiPaise", 10000)
            .put("remainingDueDates", JSONArray().put("2026-11-01")).put("mode", "reduce_emi")
        val output = JSONObject().put("calculationId", "finance.loan-prepayment-reamortization.v1")
            .put("calculationVersion", 1).put("mode", "reduce_emi").put("openingPrincipalPaise", 5000)
            .put("regularEmiPaise", 5000).put("remainingInstallmentCount", 1).put("finalDueDate", "2026-11-01")
            .put("rows", JSONArray().put(row)).put("totalInterestPaise", 0)
            .put("totalScheduledPaymentsPaise", 5000).put("baselineRemainingInterestPaise", 0)
            .put("interestSavedPaise", 0)
        val revision = JSONObject().put("version", 2).put("commandId", "prepayment-command-1")
            .put("effectiveDate", "2026-10-15").put("createdAt", timestamp).put("mode", "reduce_emi")
            .put("principalBeforePaise", 10000).put("prepaymentAmountPaise", 5000)
            .put("principalAfterPaise", 5000).put("calculationId", "finance.loan-prepayment-reamortization.v1")
            .put("calculationVersion", 1).put("inputSchemaVersion", 1).put("outputSchemaVersion", 1)
            .put("input", input).put("output", output)
        val data = JSONObject().put("schemaVersion", 1).put("kind", "loan-prepayment-state")
            .put("loanId", loanId).put("baseScheduleVersion", 1).put("currentScheduleVersion", 2)
            .put("revisions", JSONArray().put(revision))
        return record(prepaymentStateId, data)
    }

    private fun paymentRecord() : StoredRecord {
        val allocation = JSONObject().put("id", "payment-1:allocation:1")
            .put("paymentId", "payment-1").put("loanId", loanId)
            .put("scheduleVersion", 2).put("installmentNumber", 1)
            .put("amountPaise", 5000).put("createdAt", timestamp).put("source", "web")
        val payment = JSONObject().put("kind", "payment").put("id", "payment-1")
            .put("commandId", "payment-command-1").put("loanId", loanId)
            .put("businessDate", "2026-11-08").put("amountPaise", 5000)
            .put("method", "upi").put("scheduleVersion", 2).put("createdAt", timestamp)
            .put("source", "web").put("allocations", JSONArray().put(allocation))
            .put("unallocatedCreditPaise", 0).put("status", "committed")
        return record(paymentLedgerId, JSONObject().put("schemaVersion", 1)
            .put("loanId", loanId).put("entries", JSONArray().put(payment)))
    }

    @Test fun exportsRestoresAndRevalidatesLoanPaymentHistoryInRoomBackup() {
        val vehicleRegistration = NativeVehicleBackup.register()
        val financeRegistration = NativeFinanceBackup.register()
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.records().put(vehicleRecord())
            database.records().put(loanRecord())
            database.records().put(paymentRecord())
            database.records().put(prepaymentRecord())

            val snapshot = NativeBackupCoverage.exportBusinessRecords(database) { false }
            assertEquals(setOf("vehicle-records", "finance-records", "finance-payment-records", "finance-prepayment-records"),
                (0 until snapshot.length()).map { snapshot.getJSONObject(it).getString("participantId") }
                    .filter { it != "platform-records" }.toSet())
            assertNotNull(snapshot)
            NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
            assertNull(database.records().get(paymentLedgerId))

            NativeBackupCoverage.replaceBusinessRecords(database, snapshot)
            val restored = database.records().get(paymentLedgerId)
            assertNotNull(restored)
            assertNotNull(database.records().get(prepaymentStateId))
            assertEquals("payment-1", JSONObject(restored!!.json).getJSONObject("data")
                .getJSONArray("entries").getJSONObject(0).getString("id"))
            NativeBackupCoverage.validateBusinessRecords(
                NativeBackupCoverage.exportBusinessRecords(database) { false },
                requireExplicitOwnerTags = true,
            )
        } finally {
            database.close()
            financeRegistration.close()
            vehicleRegistration.close()
        }
    }

    @Test fun acceptsLoanOnlyManifestWhenNoPaymentLedgerWasPresent() {
        val vehicleRegistration = NativeVehicleBackup.register()
        val financeRegistration = NativeFinanceBackup.register()
        try {
            val current = NativeBackupCoverage.participantManifest()
            val legacy = JSONArray()
            for (index in 0 until current.length()) {
                val item = current.getJSONObject(index)
                if (item.getString("id") !in setOf("finance-payment-records", "finance-prepayment-records")) legacy.put(JSONObject(item.toString()))
            }
            val oldLoanSnapshot = JSONArray().put(JSONObject()
                .put("id", loanId).put("json", loanRecord().json)
                .put("schemaVersion", 1).put("updatedAt", timestamp).put("participantId", "finance-records"))
            NativeBackupCoverage.validateParticipantManifest(legacy, oldLoanSnapshot)
        } finally {
            financeRegistration.close()
            vehicleRegistration.close()
        }
    }

    @Test fun rejectsPaymentAllocationThatReferencesAnUnknownInstallment() {
        val vehicleRegistration = NativeVehicleBackup.register()
        val financeRegistration = NativeFinanceBackup.register()
        try {
            val valid = JSONArray().put(JSONObject().put("id", vehicleId)
                .put("json", vehicleRecord().json).put("schemaVersion", 1)
                .put("updatedAt", timestamp).put("participantId", "vehicle-records"))
                .put(JSONObject().put("id", loanId).put("json", loanRecord().json)
                    .put("schemaVersion", 1).put("updatedAt", timestamp).put("participantId", "finance-records"))
                .put(JSONObject().put("id", prepaymentStateId).put("json", prepaymentRecord().json)
                    .put("schemaVersion", 1).put("updatedAt", timestamp).put("participantId", "finance-prepayment-records"))
                .put(JSONObject().put("id", paymentLedgerId).put("json", paymentRecord().json)
                    .put("schemaVersion", 1).put("updatedAt", timestamp).put("participantId", "finance-payment-records"))
            val ledger = JSONObject(valid.getJSONObject(2).getString("json"))
            val allocation = ledger.getJSONObject("data").getJSONArray("entries")
                .getJSONObject(0).getJSONArray("allocations").getJSONObject(0)
            allocation.put("installmentNumber", 2)
            valid.getJSONObject(2).put("json", ledger.toString())
            val failure = runCatching {
                NativeBackupCoverage.validateBusinessRecords(valid, requireExplicitOwnerTags = true)
            }.exceptionOrNull()
            assertEquals("finance_payment_allocation_schedule_reference_invalid", failure?.message)
        } finally {
            financeRegistration.close()
            vehicleRegistration.close()
        }
    }
}
