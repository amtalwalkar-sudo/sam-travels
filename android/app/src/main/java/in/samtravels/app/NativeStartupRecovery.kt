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

/**
 * Production Room restore transaction, separated from Capacitor dispatch so
 * instrumentation tests exercise the exact same validation, checkpoint,
 * replacement, read-back and rollback implementation as the app.
 *
 * Transaction boundaries and recovery journal states intentionally match the
 * original BackupPlugin.restoreSnapshot implementation.
 */
internal object NativeBackupRestoreCoordinator {
    data class RestoreResult(val checkpointId: String, val restoredCount: Int)

    fun restore(
        database: LocalDatabase,
        snapshot: JSONObject,
        manifest: JSONObject,
        makeSnapshot: () -> NativeSnapshotBundle,
    ): RestoreResult {
        BackupSnapshotContract.validateSnapshot(snapshot)
        BackupSnapshotContract.validateManifest(manifest)
        val rawRecords = snapshot.optJSONArray("records") ?: error("backup_records_missing")
        NativeBackupCoverage.validateParticipantManifest(snapshot.optJSONArray("participants"), rawRecords)
        NativeBackupCoverage.validateParticipantManifest(manifest.optJSONArray("participants"), rawRecords)
        val records = if (snapshot.optJSONArray("participants") == null)
            NativeBackupCoverage.normalizeLegacyRecords(rawRecords) else rawRecords
        NativeBackupCoverage.validateBusinessRecords(records, requireExplicitOwnerTags = true)
        NativeBackupCoverage.validateSnapshotRevision(records, snapshot.optInt("snapshotRevision", -1))
        require(manifest.optInt("schemaVersion", -1) == BackupSnapshotContract.CURRENT_SCHEMA_VERSION &&
            snapshot.optInt("schemaVersion", -1) == BackupSnapshotContract.CURRENT_SCHEMA_VERSION) {
            "backup_unsupported_schema"
        }
        require(manifest.optInt("snapshotRevision", -1) == snapshot.optInt("snapshotRevision", -2)) {
            "backup_snapshot_revision_mismatch"
        }
        require(manifest.optJSONObject("recordCounts")?.optInt("records", -1) == records.length()) {
            "backup_record_count_mismatch"
        }
        require(records.length() <= 1_000_000) { "backup_record_count_limit" }

        val ids = HashSet<String>()
        for (index in 0 until records.length()) {
            val record = records.optJSONObject(index) ?: error("backup_invalid_record")
            val id = record.optString("id")
            require(id.isNotBlank() && !NativeBackupRecovery.isInternalRecord(id) &&
                ids.add(record.optString("participantId") + ":" + id)) {
                "backup_duplicate_or_reserved_record_id"
            }
            require(record.optInt("schemaVersion", 0) >= 1 &&
                record.optString("updatedAt").isNotBlank() && record.optString("json").isNotBlank()) {
                "backup_invalid_record_envelope"
            }
            val payload = JSONObject(record.getString("json"))
            if (payload.has("id")) require(payload.optString("id") == id) {
                "backup_record_identity_mismatch"
            }
        }

        val now = Instant.now().toString()
        val id = UUID.randomUUID().toString()
        database.runInTransaction {
            val checkpoint = makeSnapshot()
            database.records().put(StoredRecord(
                NativeBackupRecovery.CHECKPOINT_PREFIX + id,
                checkpoint.snapshot.toString(), 1, now,
            ))
            database.records().put(StoredRecord(
                NativeBackupRecovery.JOURNAL_PREFIX + id,
                JSONObject().put("id", id).put("createdAt", now).put("status", "checkpoint").toString(),
                1, now,
            ))
        }

        try {
            database.runInTransaction {
                NativeBackupCoverage.replaceBusinessRecords(database, records)
                database.records().put(StoredRecord(
                    NativeBackupRecovery.JOURNAL_PREFIX + id,
                    JSONObject().put("id", id).put("createdAt", now)
                        .put("status", "restored_unverified").toString(),
                    1, now,
                ))
            }

            val restored = makeSnapshot().snapshot.getJSONArray("records")
            require(restored.length() == records.length()) { "backup_post_restore_count_mismatch" }
            val restoredById = (0 until restored.length()).associate {
                val record = restored.getJSONObject(it)
                record.getString("participantId") + ":" + record.getString("id") to
                    Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
            }
            val expectedById = (0 until records.length()).associate {
                val record = records.getJSONObject(it)
                record.getString("participantId") + ":" + record.getString("id") to
                    Triple(record.getString("json"), record.getInt("schemaVersion"), record.getString("updatedAt"))
            }
            require(restoredById == expectedById && restoredById.keys == ids) {
                "backup_post_restore_integrity_mismatch"
            }
        } catch (restoreError: Exception) {
            try {
                NativeBackupRecovery.rollback(database, id)
            } catch (rollbackError: Exception) {
                NativeStartupRecovery.invalidate(database)
                rollbackError.addSuppressed(restoreError)
                throw rollbackError
            }
            throw restoreError
        }

        return RestoreResult(id, records.length())
    }
}
