package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

internal data class NativeSnapshotBundle(
    val snapshot: JSONObject,
    val manifest: JSONObject,
)

/**
 * One transaction-scoped snapshot builder shared by interactive export and the
 * headless WorkManager backup. It always exports every registered participant.
 * The caller must hold the surrounding Room read/write transaction.
 */
internal object NativeSnapshotBuilder {
    fun build(
        database: LocalDatabase,
        isInternal: (String) -> Boolean,
        applicationVersion: String,
        createdAt: String = Instant.now().toString(),
    ): NativeSnapshotBundle {
        val records = NativeBackupCoverage.exportBusinessRecords(database, isInternal)
        val snapshotRevision = (0 until records.length()).map { records.getJSONObject(it) }
            .firstOrNull { it.optString("participantId") == "work-driver-state" && it.optString("id") == "driver-state" }
            ?.let { row ->
                JSONObject(row.getString("json")).optJSONObject("value")?.optInt("revision", -1) ?: -1
            } ?: 0
        require(snapshotRevision >= 0) { "backup_snapshot_revision_invalid" }
        NativeBackupCoverage.validateSnapshotRevision(records, snapshotRevision)
        val participants: JSONArray = NativeBackupCoverage.participantManifest()
        val snapshot = JSONObject()
            .put("records", records)
            .put("snapshotRevision", snapshotRevision)
            .put("schemaVersion", BackupSnapshotContract.CURRENT_SCHEMA_VERSION)
            .put("participants", JSONArray(participants.toString()))
        val manifest = JSONObject()
            .put("applicationVersion", applicationVersion)
            .put("schemaVersion", BackupSnapshotContract.CURRENT_SCHEMA_VERSION)
            .put("createdAt", createdAt)
            .put("businessTimezone", "Asia/Kolkata")
            .put("snapshotRevision", snapshotRevision)
            .put("recordCounts", JSONObject().put("records", records.length()))
            .put("participants", JSONArray(participants.toString()))
        return NativeSnapshotBundle(snapshot, manifest)
    }
}
