package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeBusinessExpensesBackupTest {
    private val timestamp = "2026-11-15T05:00:00.000Z"
    private val vehicleId = "feature:vehicle:MH01AB1234"

    private fun row(id: String, participant: String, data: JSONObject): JSONObject {
        val envelope = JSONObject().put("id", id).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp)
            .put("source", "web").put("revision", 1).put("businessDate", "2026-11-15")
            .put("data", data)
        return JSONObject().put("id", id).put("json", envelope.toString())
            .put("schemaVersion", 1).put("updatedAt", timestamp).put("participantId", participant)
    }

    private fun vehicleRow() = row(vehicleId, "vehicle-records", JSONObject()
        .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
        .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
        .put("fuelType", "CNG").put("yearOfManufacture", 2022)
        .put("ownership", "Owned").put("lifecycleState", "active"))

    private fun fuelRow() = row(
        "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000",
        "business-expenses-records",
        JSONObject().put("schemaVersion", 1).put("kind", "fuel_purchase")
            .put("id", "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000")
            .put("revision", 1).put("businessDate", "2026-11-15")
            .put("occurredAt", timestamp).put("vehicleId", vehicleId)
            .put("odometerKm", 45000).put("pricePaisePerKg", 9000)
            .put("amountPaise", 18000).put("partialRefill", false),
    )

    private fun expenseRow(sourceKind: String, uuid: String, extras: JSONObject = JSONObject()) =
        row("feature:business-expenses:entry:$uuid", "business-expenses-records",
            JSONObject().put("schemaVersion", 1).put("kind", "business_expense")
                .put("id", "feature:business-expenses:entry:$uuid").put("revision", 1)
                .put("sourceKind", sourceKind).put("businessDate", "2026-11-15")
                .put("amountPaise", 1200).put("currencyCode", "INR").put("effect", "charge")
                .put("vehicleId", vehicleId).put("description", "Business expense")
                .also { data -> extras.keys().asSequence().forEach { key -> data.put(key, extras.get(key)) } })

    private fun tripFinancialRow() = row(
        "work:trip-financial-obligation:trip-dup", "work-driver-records",
        JSONObject().put("schemaVersion", 1).put("tripId", "trip-dup")
            .put("kind", "completed_ride_financials").put("status", "submitted")
            .put("tripContext", JSONObject().put("schemaVersion", 1)
                .put("shiftId", "shift-1").put("driverId", "driver-1")
                .put("assignmentId", "assignment-1").put("vehicleId", vehicleId)
                .put("operationalDate", "2026-11-15"))
            .put("tollPaise", 1200).put("tollPayer", "driver"),
    )

    private fun withParticipants(block: () -> Unit) {
        val vehicle = NativeVehicleBackup.register()
        NativeBusinessExpensesBackup.ensureRegistered()
        try { block() } finally { vehicle.close() }
    }

    @Test
    fun acceptsFuelPlatformFeeMiscellaneousAndTrafficChallanRecords() = withParticipants {
        val records = JSONArray().put(vehicleRow()).put(fuelRow())
            .put(expenseRow("platform_fee", "123e4567-e89b-42d3-a456-426614174001",
                JSONObject().put("reference", "platform-settlement-1").put("alreadyNettedFromIncome", false)))
            .put(expenseRow("miscellaneous", "123e4567-e89b-42d3-a456-426614174002",
                JSONObject().put("category", "Parking")))
            .put(expenseRow("traffic_challan", "123e4567-e89b-42d3-a456-426614174003",
                JSONObject().put("paymentStatus", "unpaid")))
        NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
    }

    @Test
    fun rejectsExpenseRecordsWhoseVehicleIsMissingFromTheSameSnapshot() = withParticipants {
        val records = JSONArray().put(expenseRow("traffic_challan", "123e4567-e89b-42d3-a456-426614174004",
            JSONObject().put("paymentStatus", "unpaid")))
        val error = assertThrows(IllegalArgumentException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        }
        assertEquals("business_expense_vehicle_not_found", error.message)
    }

    @Test
    fun rejectsLegacyNettedPlatformFeeState() = withParticipants {
        val records = JSONArray().put(vehicleRow()).put(expenseRow(
            "platform_fee", "123e4567-e89b-42d3-a456-426614174006",
            JSONObject().put("reference", "platform-settlement-2").put("alreadyNettedFromIncome", true),
        ))
        val error = assertThrows(IllegalArgumentException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        }
        assertEquals("business_expense_platform_fee_netting_not_supported", error.message)
    }
    @Test
    fun acceptsLinkedTripTollDuplicateAndItsReversalWithoutBreakingSourceIdentity() = withParticipants {
        val tripId = "work:trip-financial-obligation:trip-dup"
        val originalId = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174020"
        val reversalId = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174021"
        val original = expenseRow("miscellaneous", "123e4567-e89b-42d3-a456-426614174020",
            JSONObject().put("category", "Toll").put("tripFinancialSourceId", tripId)
                .put("tripFinancialComponent", "toll"))
        val reversal = expenseRow("miscellaneous", "123e4567-e89b-42d3-a456-426614174021",
            JSONObject().put("category", "Toll").put("effect", "reversal")
                .put("businessDate", "2026-11-16").put("reversesSourceId", originalId)
                .put("tripFinancialSourceId", tripId).put("tripFinancialComponent", "toll"))
        NativeBackupCoverage.validateBusinessRecords(
            JSONArray().put(vehicleRow()).put(tripFinancialRow()).put(original).put(reversal),
            requireExplicitOwnerTags = true,
        )
    }

    @Test
    fun rejectsTripLinkedManualExpenseWhenAmountDoesNotMatchTripComponent() = withParticipants {
        val tripId = "work:trip-financial-obligation:trip-dup"
        val invalid = expenseRow("miscellaneous", "123e4567-e89b-42d3-a456-426614174022",
            JSONObject().put("category", "Toll").put("amountPaise", 1300)
                .put("tripFinancialSourceId", tripId).put("tripFinancialComponent", "toll"))
        val error = assertThrows(IllegalArgumentException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(
                JSONArray().put(vehicleRow()).put(tripFinancialRow()).put(invalid),
                requireExplicitOwnerTags = true,
            )
        }
        assertEquals("business_expense_trip_financial_link_invalid", error.message)
    }

    @Test
    fun rejectsTrafficChallanWithoutPaymentState() = withParticipants {
        val records = JSONArray().put(vehicleRow()).put(expenseRow(
            "traffic_challan", "123e4567-e89b-42d3-a456-426614174005",
        ))
        val error = assertThrows(IllegalArgumentException::class.java) {
            NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        }
        assertEquals("traffic_challan_payment_status_required", error.message)
    }
}
