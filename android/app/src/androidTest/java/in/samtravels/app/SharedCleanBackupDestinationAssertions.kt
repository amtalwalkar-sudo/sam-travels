package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals

/** Production encrypted restore lifecycle against an initially empty Room database. */
internal object SharedCleanBackupDestinationAssertions {
    fun assertEncryptedRoomRestore(
        context: Context,
        expectedRecords: JSONArray,
        encrypted: JSONObject,
        recoveryKey: String,
        databaseName: String,
    ) {
        context.deleteDatabase(databaseName)
        val builder = Room.databaseBuilder(context, LocalDatabase::class.java, databaseName)
            .allowMainThreadQueries()
        var database = builder.build()
        try {
            val restored = NativeBackupRestoreCoordinator.restoreEncrypted(
                database, encrypted, recoveryKey,
                { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "clean-room-readback") },
            )
            val readback = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "clean-room-restored",
            )
            SharedBackupFixtureAssertions.assertCanonicalRecordsEqual(
                "clean Room destination restore", expectedRecords, readback.snapshot.getJSONArray("records"),
            )
            NativeBackupRestoreCoordinator.markVerified(database, restored.checkpointId)
            NativeBackupRestoreCoordinator.discardVerified(database, restored.checkpointId)
            database.close()
            database = builder.build()
            NativeStartupRecovery.invalidate(database)
            assertEquals(emptyList<String>(), NativeStartupRecovery.ensure(database))
            val reexport = NativeSnapshotBuilder.build(
                database, NativeBackupRecovery::isInternalRecord, "clean-room-reexport",
            )
            SharedBackupFixtureAssertions.assertCanonicalRecordsEqual(
                "clean Room destination reopen/re-export", expectedRecords, reexport.snapshot.getJSONArray("records"),
            )
        } finally {
            database.close()
            context.deleteDatabase(databaseName)
        }
    }
}
