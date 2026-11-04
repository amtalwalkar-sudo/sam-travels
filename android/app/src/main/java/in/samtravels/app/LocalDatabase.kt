package `in`.samtravels.app

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Versioned metadata used by the native snapshot adapter registry. */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
annotation class NativeBackupParticipant(
    val id: String,
    val featureId: String,
    val roomTable: String,
    val snapshotVersion: Int,
    val adapterId: String,
)

@Entity(tableName = "records", indices = [Index(value = ["updatedAt"])])
@NativeBackupParticipant(
    id = "platform-records",
    featureId = "platform",
    roomTable = "records",
    snapshotVersion = 1,
    adapterId = "stored-records-json-v1",
)
data class StoredRecord(
    @PrimaryKey val id: String,
    val json: String,
    val schemaVersion: Int,
    val updatedAt: String,
)

@Entity(tableName = "logbook_events", indices = [Index(value = ["updatedAt"])])
@NativeBackupParticipant(
    id = "logbook-events",
    featureId = "logbook",
    roomTable = "logbook_events",
    snapshotVersion = 1,
    adapterId = "logbook-events-json-v1",
)
data class LogBookEventRecord(
    @PrimaryKey val eventId: String,
    val json: String,
    val schemaVersion: Int,
    val updatedAt: String,
)

@Dao
interface LogBookEventDao {
    @Query("SELECT * FROM logbook_events ORDER BY updatedAt, eventId")
    fun list(): List<LogBookEventRecord>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun put(record: LogBookEventRecord)

    @Query("DELETE FROM logbook_events")
    fun clear()
}

@Dao
interface RecordDao {
    @Query("SELECT * FROM records WHERE id = :id LIMIT 1")
    fun get(id: String): StoredRecord?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun put(record: StoredRecord)

    @Query("SELECT * FROM records ORDER BY updatedAt DESC")
    fun list(): List<StoredRecord>

    @Query("DELETE FROM records WHERE id = :id")
    fun remove(id: String)
}

@Database(entities = [StoredRecord::class, LogBookEventRecord::class], version = 3, exportSchema = true)
abstract class LocalDatabase : RoomDatabase() {
    abstract fun records(): RecordDao
    abstract fun logBookEvents(): LogBookEventDao

    companion object {
        /**
         * Keep the participant entity inventory beside the Room database contract.
         * Runtime sqlite_master coverage fails if a Room table is added but not
         * enrolled here, so new persisted tables cannot silently escape backups.
         */
        val backupEntityTypes: List<Class<*>> = listOf(StoredRecord::class.java, LogBookEventRecord::class.java)

        val MIGRATION_1_2: Migration = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_records_updatedAt` ON `records` (`updatedAt`)",
                )
            }
        }
        val MIGRATION_2_3: Migration = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "CREATE TABLE IF NOT EXISTS `logbook_events` (`eventId` TEXT NOT NULL, `json` TEXT NOT NULL, `schemaVersion` INTEGER NOT NULL, `updatedAt` TEXT NOT NULL, PRIMARY KEY(`eventId`))",
                )
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_logbook_events_updatedAt` ON `logbook_events` (`updatedAt`)",
                )
            }
        }
    }
}
