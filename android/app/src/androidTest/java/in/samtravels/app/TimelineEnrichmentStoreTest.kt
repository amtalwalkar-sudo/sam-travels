package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
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
            assertFalse(JSONObject(store.getRecord("network-policy")!!.json)
                .getJSONObject("data").getBoolean("enabled")) // Queue status never changes the user's network policy.

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
    @Test fun reusesOnlyFreshResolvedCoordinateCacheEntries() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val store = TimelineEnrichmentStore(database)
            val lookedUpAt = Instant.parse(timestamp).toEpochMilli()
            store.putRecord(envelope("timeline-enrichment:cached", JSONObject()
                .put("eventId", "cached").put("latitude", 19.07601).put("longitude", 72.87771)
                .put("status", "resolved").put("label", "Andheri, Mumbai")
                .put("provider", "geoapify").put("lookedUpAt", timestamp)))
            val cached = store.findCachedCoordinate(19.07602, 72.87772, lookedUpAt + 60_000)
            assertEquals("Andheri, Mumbai", cached?.getString("label"))
            assertTrue(store.findCachedCoordinate(19.08, 72.88, lookedUpAt + 60_000) == null)
            assertTrue(store.findCachedCoordinate(19.07602, 72.87772,
                lookedUpAt + 31L * 24 * 60 * 60 * 1000) == null)
        } finally {
            database.close()
        }
    }

    @Test fun nextWorkDelayHonoursPersistedBackoffAndIdleQueueSleeps() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            val store = TimelineEnrichmentStore(database)
            val now = Instant.parse(timestamp).toEpochMilli()
            store.putRecord(envelope("timeline-enrichment:retry", JSONObject()
                .put("eventId", "retry").put("latitude", 19.076).put("longitude", 72.8777)
                .put("status", "retry_wait").put("provider", "geoapify").put("attempts", 1)
                .put("nextAttemptAt", Instant.ofEpochMilli(now + 45_000).toString())))
            assertEquals(45_000L, store.nextWorkDelayMillis(now))

            store.putRecord(envelope("timeline-enrichment:pending", JSONObject()
                .put("eventId", "pending").put("latitude", 19.076).put("longitude", 72.8777)
                .put("status", "pending").put("provider", "geoapify").put("attempts", 0)))
            assertEquals(0L, store.nextWorkDelayMillis(now))

            store.putRecord(envelope("timeline-enrichment:pending", JSONObject()
                .put("eventId", "pending").put("latitude", 19.076).put("longitude", 72.8777)
                .put("status", "resolved").put("provider", "geoapify").put("attempts", 1)
                .put("lookedUpAt", timestamp)))
            assertEquals(45_000L, store.nextWorkDelayMillis(now))
        } finally {
            database.close()
        }
    }

}
