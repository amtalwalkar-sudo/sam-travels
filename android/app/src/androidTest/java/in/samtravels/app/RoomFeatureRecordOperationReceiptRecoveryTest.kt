package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class RoomFeatureRecordOperationReceiptRecoveryTest {
    @Test fun fuelOperationReceiptAndTargetCommitAtomicallyAndSurviveRoomReopen() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "feature-operation-receipt-" + UUID.randomUUID() + ".db"
        val targetId = "feature:business-expenses:fuel:room-recovery-001"
        val operationId = "android-fuel-first-submit-001"
        val receiptId = "__sam_travels_feature_operation__:$operationId"
        val firstSubmittedAt = "2026-11-23T04:15:00.000Z"
        val payloadFingerprint = "8f14e45fceea167a5a36dedd4bea2543"

        fun openDatabase() = Room.databaseBuilder(
            context,
            LocalDatabase::class.java,
            databaseName,
        ).addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3).build()

        fun fuelRecord() = JSONObject()
            .put("id", targetId)
            .put("schemaVersion", 1)
            .put("createdAt", firstSubmittedAt)
            .put("updatedAt", firstSubmittedAt)
            .put("source", "android")
            .put("revision", 1)
            .put("data", JSONObject()
                .put("schemaVersion", 1)
                .put("kind", "fuel_purchase")
                .put("vehicleId", "feature:vehicle:ROOM001")
                .put("amountPaise", 82500)
                .put("pricePaisePerKg", 8250)
                .put("quantityMilliKg", 10000)
                .put("partialRefill", false))

        fun receiptRecord(result: JSONObject) = JSONObject()
            .put("id", receiptId)
            .put("schemaVersion", 1)
            .put("createdAt", firstSubmittedAt)
            .put("updatedAt", firstSubmittedAt)
            .put("source", "android")
            .put("revision", 1)
            .put("data", JSONObject()
                .put("schemaVersion", 1)
                .put("kind", "feature_record_operation_receipt")
                .put("operationId", operationId)
                .put("payloadFingerprint", payloadFingerprint)
                .put("action", "create")
                .put("targetRecordId", targetId)
                .put("result", result))

        fun expected(targetRevision: Int, receiptRevision: Int) = JSONObject()
            .put(targetId, targetRevision)
            .put(receiptId, receiptRevision)

        var db = openDatabase()
        try {
            val target = fuelRecord()
            val receipt = receiptRecord(target)

            // A revision mismatch must leave both sides absent; no orphan receipt or target.
            val rejected = commitFeatureUpgradeBatch(
                db, JSONArray().put(target).put(receipt), JSONArray(), expected(0, -1),
            )
            assertFalse(rejected)
            assertEquals(null, db.records().get(targetId))
            assertEquals(null, db.records().get(receiptId))

            val committed = commitFeatureUpgradeBatch(
                db, JSONArray().put(target).put(receipt), JSONArray(), expected(-1, -1),
            )
            assertTrue(committed)
        } finally {
            db.close()
        }

        db = openDatabase()
        try {
            val restoredTarget = db.records().get(targetId)
            val restoredReceipt = db.records().get(receiptId)
            assertNotNull("Domain record must survive Room reopen", restoredTarget)
            assertNotNull("Operation receipt must survive Room reopen", restoredReceipt)
            val targetEnvelope = JSONObject(restoredTarget!!.json)
            val receiptEnvelope = JSONObject(restoredReceipt!!.json)
            val receiptData = receiptEnvelope.getJSONObject("data")
            assertEquals(operationId, receiptData.getString("operationId"))
            assertEquals(payloadFingerprint, receiptData.getString("payloadFingerprint"))
            assertEquals(targetId, receiptData.getString("targetRecordId"))
            assertEquals(targetEnvelope.toString(), receiptData.getJSONObject("result").toString())
            assertEquals(firstSubmittedAt, receiptEnvelope.getString("createdAt"))
            assertEquals(firstSubmittedAt, receiptEnvelope.getString("updatedAt"))
            assertEquals(targetEnvelope.getString("updatedAt"), receiptEnvelope.getString("updatedAt"))

            // Replaying the original first-submit identity cannot create a second pair.
            val duplicate = commitFeatureUpgradeBatch(
                db,
                JSONArray().put(fuelRecord()).put(receiptRecord(fuelRecord())),
                JSONArray(),
                expected(-1, -1),
            )
            assertFalse(duplicate)
            assertEquals(1, db.records().list().count { it.id == targetId })
            assertEquals(1, db.records().list().count { it.id == receiptId })
        } finally {
            db.close()
            context.deleteDatabase(databaseName)
        }
    }
}
