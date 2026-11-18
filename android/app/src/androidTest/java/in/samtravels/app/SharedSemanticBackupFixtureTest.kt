package `in`.samtravels.app

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class SharedSemanticBackupFixtureTest {
    @Test fun sharedSemanticLifecycleFixtureDeclaresAllParityDomains() {
        // Instrumentation assets are packaged in the test APK, not the target app APK.
        val context = InstrumentationRegistry.getInstrumentation().context
        val fixture = context.assets.open("semantic-backup-lifecycle-v1.json")
            .bufferedReader().use { JSONObject(it.readText()) }
        assertEquals(1, fixture.getInt("schemaVersion"))
        assertEquals("sam-travels-cross-platform-semantic-restore-v1", fixture.getString("fixtureId"))
        assertEquals(listOf("export", "restore", "database_reopen", "startup_recovery", "re_export"),
            (0 until fixture.getJSONArray("lifecycle").length()).map { fixture.getJSONArray("lifecycle").getString(it) })
        assertEquals(listOf("record_ids", "revisions", "references", "event_ordering", "correction_chain_heads"),
            (0 until fixture.getJSONArray("comparison").length()).map { fixture.getJSONArray("comparison").getString(it) })
        val domains = fixture.getJSONObject("domains")
        assertEquals(setOf("finance", "compliance", "maintenance", "businessExpenses", "performance", "work", "logBook"),
            domains.keys().asSequence().toSet())
        assertEquals("contract_seed_only", fixture.getString("status"))
    }
}
