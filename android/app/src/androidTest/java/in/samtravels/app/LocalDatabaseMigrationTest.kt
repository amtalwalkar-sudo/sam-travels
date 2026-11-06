package `in`.samtravels.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class LocalDatabaseMigrationTest {
    private fun createHistoricalDatabase(context: Context, name: String, fixture: String, version: Int) {
        context.deleteDatabase(name)
        val file = context.getDatabasePath(name)
        file.parentFile?.mkdirs()
        val legacy = SQLiteDatabase.openOrCreateDatabase(file, null)
        val sql = InstrumentationRegistry.getInstrumentation().context.assets.open(fixture).bufferedReader().use { it.readText() }
        sql.split(";").map(String::trim).filter(String::isNotEmpty).forEach(legacy::execSQL)
        legacy.version = version
        legacy.close()
    }

    private fun openMigrated(context: Context, name: String) =
        Room.databaseBuilder(context, LocalDatabase::class.java, name)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()
            .build()

    @Test
    fun versionOneFixtureMigratesInOrderAndReopeningIsIdempotent() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "room-migration-v1-to-current.db"
        createHistoricalDatabase(context, name, "persistence/room-v1.sql", 1)

        val migrated = openMigrated(context, name)
        try {
            val row = migrated.records().get("legacy-driver-state")
            assertNotNull(row)
            assertEquals("{\"state\":\"shift_active\"}", row!!.json)
            assertNull(migrated.records().get("driver-event:event-legacy"))
            assertEquals("event-legacy", migrated.logBookEvents().list().single().eventId)
            assertEquals("{\"eventId\":\"event-legacy\",\"kind\":\"trip_completed\"}", migrated.logBookEvents().list().single().json)
            assertEquals(3, migrated.openHelper.readableDatabase.version)
            migrated.openHelper.readableDatabase.query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='logbook_events'",
            ).use { cursor -> assertEquals(true, cursor.moveToFirst()) }
            migrated.openHelper.readableDatabase.query(
                "SELECT name FROM sqlite_master WHERE type='index' AND name='index_records_updatedAt'",
            ).use { cursor -> assertEquals(true, cursor.moveToFirst()) }
        } finally {
            migrated.close()
        }

        val reopened = openMigrated(context, name)
        try {
            assertEquals(3, reopened.openHelper.readableDatabase.version)
            assertEquals("event-legacy", reopened.logBookEvents().list().single().eventId)
            assertNotNull(reopened.records().get("legacy-driver-state"))
        } finally {
            reopened.close()
            context.deleteDatabase(name)
        }
    }

    @Test
    fun versionTwoFixtureMigratesToCurrentWithoutChangingRecordPayload() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "room-migration-v2-to-current.db"
        createHistoricalDatabase(context, name, "persistence/room-v2.sql", 2)
        val migrated = openMigrated(context, name)
        try {
            val row = migrated.records().get("historical-record-v2")
            assertNotNull(row)
            assertEquals(3, migrated.openHelper.readableDatabase.version)
            assertEquals("historical-record-v2", row!!.id)
            assertEquals(1, row.schemaVersion)
            assertEquals("2026-11-04T10:00:00Z", row.updatedAt)
            assertEquals("{\"id\":\"historical-record-v2\",\"schemaVersion\":1,\"createdAt\":\"2026-11-04T10:00:00Z\",\"updatedAt\":\"2026-11-04T10:00:00Z\",\"source\":\"import\",\"revision\":1,\"data\":{\"value\":\"kept\"}}", row.json)
        } finally {
            migrated.close()
            context.deleteDatabase(name)
        }
    }

    @Test
    fun failedMigrationRollsBackWithoutDeletingVersionOneRecords() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "room-migration-failure.db"
        createHistoricalDatabase(context, name, "persistence/room-v1.sql", 1)
        val injectedFailure = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("CREATE INDEX IF NOT EXISTS `index_records_updatedAt` ON `records` (`updatedAt`)")
                error("injected_migration_failure")
            }
        }

        val broken = Room.databaseBuilder(context, LocalDatabase::class.java, name)
            .addMigrations(injectedFailure, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()
            .build()
        try {
            assertThrows(Exception::class.java) { broken.openHelper.writableDatabase }
        } finally {
            broken.close()
        }

        val raw = SQLiteDatabase.openDatabase(
            context.getDatabasePath(name).absolutePath,
            null,
            SQLiteDatabase.OPEN_READONLY,
        )
        try {
            assertEquals(1, raw.version)
            raw.rawQuery("SELECT json FROM records WHERE id='legacy-driver-state'", null).use { cursor ->
                assertEquals(true, cursor.moveToFirst())
                assertEquals("{\"state\":\"shift_active\"}", cursor.getString(0))
            }
            raw.rawQuery("SELECT json FROM records WHERE id='driver-event:event-legacy'", null).use { cursor ->
                assertEquals(true, cursor.moveToFirst())
                assertEquals("{\"eventId\":\"event-legacy\",\"kind\":\"trip_completed\"}", cursor.getString(0))
            }
            raw.rawQuery("SELECT identity_hash FROM room_master_table WHERE id=42", null).use { cursor ->
                assertEquals(true, cursor.moveToFirst())
                assertEquals("legacy-v1-hash", cursor.getString(0))
            }
        } finally {
            raw.close()
            context.deleteDatabase(name)
        }
    }

    @Test
    fun unknownFutureRoomVersionFailsWithoutDeletingHistoricalRows() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "room-future-version.db"
        createHistoricalDatabase(context, name, "persistence/room-v2.sql", 99)
        val database = openMigrated(context, name)
        try {
            assertThrows(Exception::class.java) { database.openHelper.writableDatabase }
        } finally {
            database.close()
        }
        val raw = SQLiteDatabase.openDatabase(
            context.getDatabasePath(name).absolutePath,
            null,
            SQLiteDatabase.OPEN_READONLY,
        )
        try {
            assertEquals(99, raw.version)
            raw.rawQuery("SELECT id FROM records WHERE id='historical-record-v2'", null).use { cursor ->
                assertEquals(true, cursor.moveToFirst())
            }
        } finally {
            raw.close()
            context.deleteDatabase(name)
        }
    }

    @Test
    fun migratedLegacyRoomEventProducesTheSameCompleteProjectionAsDexieOracle() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val name = "room-migrated-timeline-parity.db"
        createHistoricalDatabase(context, name, "persistence/room-v2.sql", 2)
        val migrated = openMigrated(context, name)
        try {
            val persistedEvents = DriverWorkflowStore.listEvents(migrated)
            assertEquals(1, persistedEvents.size)
            assertEquals("event-legacy", persistedEvents.single().getString("eventId"))

            val assets = instrumentation.context.assets
            val oracle = JSONObject(assets.open("generated/timeline-projection-parity-oracle-v1.json")
                .bufferedReader().use { it.readText() })
            val bundle = assets.open("timeline-projection.js").bufferedReader().use { it.readText() }
            val eventsJson = org.json.JSONArray().apply { persistedEvents.forEach { put(it) } }
            val completed = CountDownLatch(1)
            val output = AtomicReference<String?>()
            lateinit var webView: WebView
            instrumentation.runOnMainSync {
                webView = WebView(context)
                webView.settings.javaScriptEnabled = true
                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String) {
                        view.evaluateJavascript(
                            "JSON.stringify(TimelineParity.buildTimelineProjection({events:$eventsJson}))",
                        ) { encoded ->
                            output.set(org.json.JSONTokener(encoded).nextValue() as String)
                            completed.countDown()
                        }
                    }
                }
                webView.loadDataWithBaseURL(
                    "https://localhost/",
                    "<html><head><script>$bundle</script></head><body></body></html>",
                    "text/html",
                    "UTF-8",
                    null,
                )
            }
            try {
                assertEquals(true, completed.await(20, TimeUnit.SECONDS))
                assertEquals("Migrated legacy projection differs from Dexie oracle",
                    oracle.getString("migratedLegacy"), output.get())
            } finally {
                instrumentation.runOnMainSync { webView.destroy() }
            }
        } finally {
            migrated.close()
            context.deleteDatabase(name)
        }
    }
}
