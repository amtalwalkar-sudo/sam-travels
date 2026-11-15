package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class NativeBusinessExpensesRoomBackupTest {
    @Before fun registerOwners() {
        NativeBusinessSettingsBackup.ensureRegistered(); NativeVehicleBackup.ensureRegistered()
        NativeDriverRecordsBackup.ensureRegistered(); NativeComplianceBackup.ensureRegistered()
        NativeMaintenanceBackup.ensureRegistered(); NativeFinanceBackup.ensureRegistered()
        NativeBusinessExpensesBackup.ensureRegistered()
    }
    private fun record(id: String, data: JSONObject, at: String) = StoredRecord(id, JSONObject()
        .put("id", id).put("schemaVersion", 1).put("createdAt", at).put("updatedAt", at)
        .put("source", "web").put("revision", 1).put("data", data).toString(), 1, at)

    @Test fun fuelAndExpenseOwnersRoundTripThroughRoomBackup() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java).allowMainThreadQueries().build()
        val at = "2026-11-15T05:00:00.000Z"
        val vehicleId = "feature:vehicle:MH01AB1234"
        try {
            db.records().put(record(vehicleId, JSONObject().put("schemaVersion", 1).put("registrationNumber", "MH01AB1234").put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV").put("fuelType", "CNG").put("yearOfManufacture", 2022).put("ownership", "Owned").put("lifecycleState", "active"), at))
            val fuelId = "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000"
            db.records().put(record(fuelId, JSONObject().put("schemaVersion", 1).put("kind", "fuel_purchase").put("id", fuelId).put("revision", 1).put("businessDate", "2026-11-15").put("occurredAt", at).put("vehicleId", vehicleId).put("odometerKm", 45000).put("pricePaisePerKg", 9000).put("amountPaise", 18000).put("partialRefill", false), at))
            fun expense(id: String, kind: String, extra: JSONObject) = record(id, JSONObject().put("schemaVersion", 1).put("kind", "business_expense").put("id", id).put("revision", 1).put("sourceKind", kind).put("businessDate", "2026-11-15").put("amountPaise", 1200).put("currencyCode", "INR").put("effect", "charge").put("vehicleId", vehicleId).put("description", "Backup acceptance").also { data -> extra.keys().asSequence().forEach { key -> data.put(key, extra.get(key)) } }, at)
            val platform = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174001"
            val misc = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174002"
            val challan = "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174003"
            db.records().put(expense(platform, "platform_fee", JSONObject().put("reference", "settlement-1").put("alreadyNettedFromIncome", true)))
            db.records().put(expense(misc, "miscellaneous", JSONObject().put("category", "Parking")))
            db.records().put(expense(challan, "traffic_challan", JSONObject().put("paymentStatus", "unpaid")))
            val snapshot = NativeBackupCoverage.exportBusinessRecords(db) { false }
            NativeBackupCoverage.validateBusinessRecords(snapshot, requireExplicitOwnerTags = true)
            NativeBackupCoverage.replaceBusinessRecords(db, JSONArray())
            assertNull(db.records().get(fuelId)); assertNull(db.records().get(platform))
            NativeBackupCoverage.replaceBusinessRecords(db, snapshot)
            assertNotNull(db.records().get(fuelId)); assertNotNull(db.records().get(platform))
            assertNotNull(db.records().get(misc)); assertNotNull(db.records().get(challan))
            NativeBackupCoverage.validateBusinessRecords(NativeBackupCoverage.exportBusinessRecords(db) { false }, requireExplicitOwnerTags = true)
        } finally { db.close() }
    }
}