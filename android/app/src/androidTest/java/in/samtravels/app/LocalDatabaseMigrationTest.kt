package `in`.samtravels.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class LocalDatabaseMigrationTest {
    private fun createVersionOneDatabase(context: Context, name: String) {
        context.deleteDatabase(name)
        val file = context.getDatabasePath(name)
        file.parentFile?.mkdirs()
        val legacy = SQLiteDatabase.openOrCreateDatabase(file, null)
        legacy.execSQL(
            "CREATE TABLE IF NOT EXISTS `records` (" +
                "`id` TEXT NOT NULL, `json` TEXT NOT NULL, " +
                "`schemaVersion` INTEGER NOT NULL, `updatedAt` TEXT NOT NULL, " +
                "PRIMARY KEY(`id`))",
        )
        legacy.execSQL(
            "INSERT INTO `records` (`id`, `json`, `schemaVersion`, `updatedAt`) " +
                "VALUES ('legacy-driver-state', '{\"state\":\"shift_active\"}', 1, '2026-11-04T10:00:00Z')",
        )
        legacy.execSQL(
            "INSERT INTO `records` (`id`, `json`, `schemaVersion`, `updatedAt`) " +
                "VALUES ('driver-event:event-legacy', '{\"eventId\":\"event-legacy\",\"kind\":\"trip_completed\"}', 1, '2026-11-04T10:01:00Z')",
        )
        legacy.execSQL("CREATE TABLE IF NOT EXISTS `room_master_table` (id INTEGER PRIMARY KEY, identity_hash TEXT)")
        legacy.execSQL("INSERT OR REPLACE INTO `room_master_table` (id, identity_hash) VALUES(42, 'legacy-v1-hash')")
        legacy.version = 1
        legacy.close()
    }

    @Test
    fun versionOneDataSurvivesBothRoomMigrations() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "room-migration-v1-to-v2.db"
        createVersionOneDatabase(context, name)

        val migrated = Room.databaseBuilder(context, LocalDatabase::class.java, name)
            .addMigrations(LocalDatabase.MIGRATION_1_2, LocalDatabase.MIGRATION_2_3)
            .allowMainThreadQueries()
            .build()
        try {
            val row = migrated.records().get("legacy-driver-state")
            assertNotNull(row)
            assertEquals("{\"state\":\"shift_active\"}", row!!.json)
            assertNull(migrated.records().get("driver-event:event-legacy"))
            assertEquals("event-legacy", migrated.logBookEvents().list().single().eventId)
            assertEquals("{\"eventId\":\"event-legacy\",\"kind\":\"trip_completed\"}", migrated.logBookEvents().list().single().json)
            assertEquals(3, migrated.openHelper.readableDatabase.version)
            migrated.openHelper.readableDatabase.query("SELECT name FROM sqlite_master WHERE type='table' AND name='logbook_events'").use { cursor -> assertEquals(true, cursor.moveToFirst()) }
            migrated.openHelper.readableDatabase.query(
                "SELECT name FROM sqlite_master WHERE type='index' AND name='index_records_updatedAt'",
            ).use { cursor -> assertEquals(true, cursor.moveToFirst()) }
        } finally {
            migrated.close()
            context.deleteDatabase(name)
        }
    }

    @Test
    fun failedMigrationRollsBackWithoutDeletingVersionOneRecords() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "room-migration-failure.db"
        createVersionOneDatabase(context, name)
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
            var failed = false
            try {
                broken.openHelper.writableDatabase
            } catch (_: Exception) {
                failed = true
            }
            assertEquals(true, failed)
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
}
