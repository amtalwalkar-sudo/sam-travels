package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HistoricalCorrectionRoomBatchTest {
    @Test fun correctionAndChainHeadCommitAtomicallyAndRemainInNativeBackup() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val now = java.time.Instant.now().toString()
            val targetId = "feature:maintenance:expense:room-pilot"
            val correctionId = "historical-correction:room-correction-1"
            val chainId = "historical-correction-chain:" + java.net.URLEncoder.encode(targetId, "UTF-8")
            fun envelope(id: String, revision: Int, data: JSONObject) = JSONObject()
                .put("id", id).put("schemaVersion", 1).put("createdAt", now)
                .put("updatedAt", now).put("source", "android").put("revision", revision)
                .put("data", data)
            val correction = envelope(correctionId, 1, JSONObject()
                .put("schemaVersion", 1).put("correctionId", "room-correction-1")
                .put("targetRecordId", targetId).put("chainRevision", 1))
            val head = envelope(chainId, 1, JSONObject()
                .put("schemaVersion", 1).put("targetRecordId", targetId)
                .put("chainRevision", 1).put("headCorrectionId", "room-correction-1"))
            assertTrue(commitFeatureUpgradeBatch(
                db, JSONArray().put(correction).put(head), JSONArray(),
                JSONObject().put(correctionId, -1).put(chainId, -1),
            ))
            assertTrue(db.records().get(correctionId) != null)
            assertTrue(db.records().get(chainId) != null)

            val secondId = "historical-correction:room-correction-2"
            val second = envelope(secondId, 1, JSONObject()
                .put("schemaVersion", 1).put("correctionId", "room-correction-2")
                .put("targetRecordId", targetId).put("chainRevision", 2))
            val nextHead = envelope(chainId, 2, JSONObject()
                .put("schemaVersion", 1).put("targetRecordId", targetId)
                .put("chainRevision", 2).put("headCorrectionId", "room-correction-2"))
            assertFalse(commitFeatureUpgradeBatch(
                db, JSONArray().put(second).put(nextHead), JSONArray(),
                JSONObject().put(secondId, -1).put(chainId, -1),
            ))
            assertTrue("A stale chain-head revision must reject the whole batch", db.records().get(secondId) == null)

            assertTrue(commitFeatureUpgradeBatch(
                db, JSONArray().put(second).put(nextHead), JSONArray(),
                JSONObject().put(secondId, -1).put(chainId, 1),
            ))
            val backup = NativeBackupCoverage.exportBusinessRecords(db) { false }
            val backupIds = (0 until backup.length()).map { backup.getJSONObject(it).getString("id") }
            assertTrue(backupIds.contains(correctionId))
            assertTrue(backupIds.contains(secondId))
            assertTrue(backupIds.contains(chainId))
        } finally {
            db.close()
        }
    }
}
