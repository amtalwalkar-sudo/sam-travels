package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HistoricalCorrectionRoomBatchTest {
    @Test fun correctionAndChainHeadCommitAtomicallyAndRemainInNativeBackup() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val vehicleRegistration = NativeVehicleBackup.register()
        val maintenanceRegistration = NativeMaintenanceBackup.register()
        try {
            val now = java.time.Instant.now().toString()
            val vehicleId = "feature:vehicle:MH01AB1234"
            val targetId = "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174100"
            val correctionId = "historical-correction:room-correction-1"
            val secondId = "historical-correction:room-correction-2"
            val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(targetId, "UTF-8")

            fun envelope(id: String, revision: Int, data: JSONObject, createdBy: JSONObject? = null): JSONObject {
                val result = JSONObject()
                    .put("id", id).put("schemaVersion", 1).put("createdAt", now)
                    .put("updatedAt", now).put("source", "android").put("revision", revision)
                    .put("data", data)
                if (createdBy != null) result.put("createdBy", createdBy)
                return result
            }

            val vehicle = envelope(vehicleId, 1, JSONObject()
                .put("schemaVersion", 1).put("registrationNumber", "MH01AB1234")
                .put("make", "Tata").put("model", "Ace").put("vehicleType", "LCV")
                .put("fuelType", "CNG").put("yearOfManufacture", 2022)
                .put("ownership", "Owned").put("lifecycleState", "active"))
            db.records().put(StoredRecord(vehicleId, vehicle.toString(), 1, now))

            val driverAuthor = JSONObject().put("personId", "driver-room").put("role", "driver")
            val expense = envelope(targetId, 1, JSONObject()
                .put("schemaVersion", 1).put("kind", "expense").put("vehicleId", vehicleId)
                .put("expenseDate", "2026-11-01").put("expenseName", "Tyre repair")
                .put("description", "Receipt amount").put("amountPaise", 10000L), driverAuthor)
            db.records().put(StoredRecord(targetId, expense.toString(), 1, now))

            fun correction(id: String, chainRevision: Int, before: Long, after: Long,
                reason: String, actorId: String, supersedes: String? = null): JSONObject {
                val actor = JSONObject().put("role", "driver").put("actorId", actorId)
                val data = JSONObject().put("schemaVersion", 1)
                    .put("correctionId", id.removePrefix("historical-correction:"))
                    .put("targetRecordId", targetId).put("targetRecordRevision", 1)
                    .put("featureId", "maintenance").put("chainRevision", chainRevision)
                    .put("fieldPath", "amountPaise").put("beforeValue", before)
                    .put("afterValue", after).put("reason", reason)
                    .put("actor", actor).put("recordedAt", now)
                    .put("businessEffectiveDate", "2026-11-01")
                if (supersedes != null) data.put("supersedesCorrectionId", supersedes)
                return envelope(id, 1, data,
                    JSONObject().put("personId", actorId).put("role", "driver"))
            }
            fun chainHead(chainRevision: Int, head: String, envelopeRevision: Int) = envelope(
                chainId, envelopeRevision, JSONObject().put("schemaVersion", 1)
                    .put("targetRecordId", targetId).put("chainRevision", chainRevision)
                    .put("headCorrectionId", head),
            )

            val first = correction(correctionId, 1, 10000L, 12500L,
                "Receipt amount was entered incorrectly", "driver-room")
            val firstHead = chainHead(1, "room-correction-1", 1)
            assertTrue(commitFeatureUpgradeBatch(
                db, JSONArray().put(first).put(firstHead), JSONArray(),
                JSONObject().put(correctionId, -1).put(chainId, -1),
            ))
            assertTrue(db.records().get(correctionId) != null)
            assertTrue(db.records().get(chainId) != null)

            val second = correction(secondId, 2, 12500L, 13000L,
                "Second receipt verification", "driver-room", "room-correction-1")
            val nextHead = chainHead(2, "room-correction-2", 2)
            assertFalse(commitFeatureUpgradeBatch(
                db, JSONArray().put(second).put(nextHead), JSONArray(),
                JSONObject().put(secondId, -1).put(chainId, -1),
            ))
            assertNull("A stale chain head must reject the correction row too", db.records().get(secondId))

            assertTrue(commitFeatureUpgradeBatch(
                db, JSONArray().put(second).put(nextHead), JSONArray(),
                JSONObject().put(secondId, -1).put(chainId, 1),
            ))

            val backup = NativeBackupCoverage.exportBusinessRecords(db) { false }
            val backupIds = (0 until backup.length()).map { backup.getJSONObject(it).getString("id") }
            assertTrue(backupIds.containsAll(listOf(vehicleId, targetId, correctionId, secondId, chainId)))
            NativeBackupCoverage.validateBusinessRecords(backup, requireExplicitOwnerTags = true)
        } finally {
            maintenanceRegistration.close()
            vehicleRegistration.close()
            db.close()
        }
    }
}
