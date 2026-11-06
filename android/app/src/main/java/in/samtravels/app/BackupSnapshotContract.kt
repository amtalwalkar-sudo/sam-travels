package `in`.samtravels.app

import org.json.JSONObject
import java.time.OffsetDateTime

/** Must match BACKUP_SNAPSHOT_SCHEMA_VERSION in packages/core/src/persistence-contract.ts. */
internal object BackupSnapshotContract {
    const val CURRENT_SCHEMA_VERSION = 1

    fun validateManifest(manifest: JSONObject) {
        require(manifest.optInt("schemaVersion", -1) == CURRENT_SCHEMA_VERSION) {
            "backup_unsupported_schema"
        }
        require(manifest.optString("applicationVersion").isNotBlank() &&
            manifest.optString("businessTimezone").isNotBlank()) {
            "backup_invalid_manifest"
        }
        runCatching { OffsetDateTime.parse(manifest.optString("createdAt")) }
            .getOrElse { throw IllegalArgumentException("backup_invalid_manifest") }
        require(manifest.optLong("snapshotRevision", -1L) >= 0L) {
            "backup_invalid_snapshot_revision"
        }
        val counts = manifest.optJSONObject("recordCounts") ?: error("backup_invalid_record_counts")
        require(counts.has("records") && counts.optLong("records", -1L) >= 0L) {
            "backup_invalid_record_counts"
        }
    }

    fun validateSnapshot(snapshot: JSONObject) {
        require(snapshot.optInt("schemaVersion", -1) == CURRENT_SCHEMA_VERSION) {
            "backup_unsupported_schema"
        }
        require(snapshot.optLong("snapshotRevision", -1L) >= 0L) {
            "backup_invalid_snapshot_revision"
        }
        require(snapshot.optJSONArray("records") != null) { "backup_records_missing" }
    }
}
