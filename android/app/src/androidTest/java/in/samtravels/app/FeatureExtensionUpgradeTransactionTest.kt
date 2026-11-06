package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.runBlocking

class FeatureExtensionUpgradeTransactionTest {
    private fun commit(
        database: LocalDatabase,
        records: JSONArray,
        deletes: JSONArray,
        expectedRevisions: JSONObject,
    ): Boolean = runBlocking {
        commitFeatureUpgradeBatch(database, records, deletes, expectedRevisions)
    }

    private fun envelope(id: String, revision: Int, value: String) = JSONObject()
        .put("id", id)
        .put("schemaVersion", 1)
        .put("createdAt", "2026-11-06T00:00:00.000Z")
        .put("updatedAt", "2026-11-06T00:01:00.000Z")
        .put("source", "android")
        .put("revision", revision)
        .put("data", JSONObject().put("value", value))

    @Test fun commitsMigrationWritesAndDeletesAtomicallyWithRevisionGuards() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val database = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            database.records().put(StoredRecord(
                "feature:upgrade-addon:existing",
                envelope("feature:upgrade-addon:existing", 1, "before").toString(),
                1, "2026-11-06T00:00:00.000Z",
            ))
            val writes = JSONArray()
                .put(envelope("feature:upgrade-addon:existing", 2, "migrated"))
                .put(envelope("feature:upgrade-addon:new", 1, "created"))
            val expected = JSONObject()
                .put("feature:upgrade-addon:existing", 1)
                .put("feature:upgrade-addon:new", -1)
            assertTrue(commit(database, writes, JSONArray(), expected))
            assertEquals("migrated", JSONObject(database.records().get("feature:upgrade-addon:existing")!!.json)
                .getJSONObject("data").getString("value"))
            assertEquals("created", JSONObject(database.records().get("feature:upgrade-addon:new")!!.json)
                .getJSONObject("data").getString("value"))

            val conflictingWrites = JSONArray()
                .put(envelope("feature:upgrade-addon:existing", 3, "must-not-commit"))
                .put(envelope("feature:upgrade-addon:new", 2, "must-not-commit"))
            val conflictExpected = JSONObject()
                .put("feature:upgrade-addon:existing", 0)
                .put("feature:upgrade-addon:new", 1)
            assertFalse(commit(database, conflictingWrites, JSONArray(), conflictExpected))
            assertEquals("migrated", JSONObject(database.records().get("feature:upgrade-addon:existing")!!.json)
                .getJSONObject("data").getString("value"))
            assertEquals("created", JSONObject(database.records().get("feature:upgrade-addon:new")!!.json)
                .getJSONObject("data").getString("value"))

            val deleteExpected = JSONObject().put("feature:upgrade-addon:new", 1)
            assertTrue(commit(
                database, JSONArray(), JSONArray().put("feature:upgrade-addon:new"), deleteExpected,
            ))
            assertTrue(database.records().get("feature:upgrade-addon:new") == null)
        } finally {
            database.close()
        }
    }
}
