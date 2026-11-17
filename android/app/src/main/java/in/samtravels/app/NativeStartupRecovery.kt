package `in`.samtravels.app

/**
 * Process-wide startup gate shared by the driver plugin, overlay service, and
 * backup plugin. An unverified restore is rolled back only when a new process
 * first opens the authoritative database. A failed recovery never opens the gate.
 */
internal object NativeStartupRecovery {
    // Multiple Room handles can point at the same durable file. Cache startup
    // recovery per physical database path, not per handle or bare filename.
    // A restore failure for one test/tenant database must not invalidate the
    // startup gate for an unrelated database in the same process.
    private val readyDatabaseKeys = mutableSetOf<String>()

    private fun key(database: LocalDatabase): String {
        val path = runCatching { database.openHelper.writableDatabase.path }.getOrNull()
        return if (!path.isNullOrBlank() && path != ":memory:") {
            "file:" + path
        } else {
            "memory:" + System.identityHashCode(database)
        }
    }

    @Synchronized
    fun ensure(database: LocalDatabase): List<String> {
        val databaseKey = key(database)
        if (databaseKey in readyDatabaseKeys) return emptyList()
        val recovered = NativeBackupRecovery.recoverPending(database)
        readyDatabaseKeys.add(databaseKey)
        return recovered
    }

    @Synchronized
    fun invalidate(database: LocalDatabase) {
        readyDatabaseKeys.remove(key(database))
    }
}

package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
