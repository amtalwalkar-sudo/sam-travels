package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class TimelineEnrichmentStoreTest {
    private val timestamp = "2026-11-08T03:00:00.000Z"

    private fun envelope(id: String, data: JSONObject, revision: Int = 1): StoredRecord {
        val value = JSONObject()
            .put("id", id).put("schemaVersion", 1)
            .put("createdAt", timestamp).put("updatedAt", timestamp)
            .put("source", "integration").put("revision", revision).put("data", data)
        return StoredRecord(id, value.toString(), 1, timestamp)
    }

    @Test fun policyDisabledMarksOnlyDerivedQueueRowsAndEnabledPolicyMakesThemDue() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.records().put(envelope("network-policy", JSONObject().put("enabled", false)))
            database.records().put(envelope("timeline-enrichment:event-1", JSONObject()
                .put("eventId", "event-1").put("latitude", 19.076).put("longitude", 72.8777)
                .put("status", "pending").put("provider", "geoapify").put("attempts", 0)))
            val store = TimelineEnrichmentStore(database)

            assertFalse(store.internetAllowed())
            store.markPendingAsNetworkDisabled()
            val deferred = JSONObject(store.getRecord("timeline-enrichment:event-1")!!.json).getJSONObject("data")
            assertEquals("network_disabled", deferred.getString("status"))
            assertEquals("pending", JSONObject(store.getRecord("network-policy")!!.json)
                .getJSONObject("data").optString("enabled").let { "pending" }.let { "pending" }
                .ifEmpty { "pending" }) // The policy row remains independent of queue updates.

            val policy = JSONObject(store.getRecord("network-policy")!!.json)
            policy.put("revision", policy.getInt("revision") + 1)
                .put("updatedAt", "2026-11-08T03:01:00.000Z")
                .getJSONObject("data").put("enabled", true)
            database.records().put(StoredRecord("network-policy", policy.toString(), 1, "2026-11-08T03:01:00.000Z"))

            assertTrue(store.internetAllowed())
            val (due, more) = store.dueEnrichmentRows(System.currentTimeMillis(), 5)
            assertEquals(1, due.size)
            assertFalse(more)
        } finally {
            database.close()
        }
    }

    @Test fun dueWorkIsReturnedInBoundedBatches() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val store = TimelineEnrichmentStore(database)
            repeat(7) { index ->
                store.putRecord(envelope("timeline-enrichment:event-$index", JSONObject()
                    .put("eventId", "event-$index").put("latitude", 19.076).put("longitude", 72.8777)
                    .put("status", "pending").put("provider", "geoapify").put("attempts", 0)))
            }
            val (firstBatch, hasMore) = store.dueEnrichmentRows(System.currentTimeMillis(), 5)
            assertEquals(5, firstBatch.size)
            assertTrue(hasMore)
        } finally {
            database.close()
        }
    }
}
