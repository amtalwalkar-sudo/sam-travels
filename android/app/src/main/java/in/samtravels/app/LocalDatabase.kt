package `in`.samtravels.app
import androidx.room.*
@Entity(tableName="records") data class StoredRecord(@PrimaryKey val id:String,val json:String,val schemaVersion:Int,val updatedAt:String)
@Dao interface RecordDao{@Query("SELECT * FROM records WHERE id=:id LIMIT 1") fun get(id:String):StoredRecord?;@Insert(onConflict=OnConflictStrategy.REPLACE) fun put(record:StoredRecord);@Query("SELECT * FROM records ORDER BY updatedAt DESC") fun list():List<StoredRecord>;@Query("DELETE FROM records WHERE id=:id") fun remove(id:String)}
@Database(entities=[StoredRecord::class],version=1,exportSchema=false) abstract class LocalDatabase:RoomDatabase(){abstract fun records():RecordDao}