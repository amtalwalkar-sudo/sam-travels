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

@Entity(tableName = "records", indices = [Index(value = ["updatedAt"])])
data class StoredRecord(
    @PrimaryKey val id: String,
    val json: String,
    val schemaVersion: Int,
    val updatedAt: String,
)

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

@Database(entities = [StoredRecord::class], version = 2, exportSchema = true)
abstract class LocalDatabase : RoomDatabase() {
    abstract fun records(): RecordDao

    companion object {
        /**
         * Version 2 adds the index used by chronological record scans.
         * The JSON record envelope and all existing rows remain unchanged.
         */
        val MIGRATION_1_2: Migration = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_records_updatedAt` ON `records` (`updatedAt`)",
                )
            }
        }
    }
}
