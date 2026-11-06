package `in`.samtravels.app

import org.json.JSONObject
import java.time.OffsetDateTime

/** Must match BACKUP_SNAPSHOT_SCHEMA_VERSION in packages/core/src/persistence-contract.ts. */
internal object BackupSnapshotContract {
    const val CURRENT_SCHEMA_VERSION = 1
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991.0

    fun validateManifest(manifest: JSONObject) {
        require(integer(manifest.opt("schemaVersion"), "backup_unsupported_schema") == CURRENT_SCHEMA_VERSION.toDouble()) {
            "backup_unsupported_schema"
        }
        val appVersion = manifest.opt("applicationVersion") as? String
        val timezone = manifest.opt("businessTimezone") as? String
        require(!appVersion.isNullOrBlank() && !timezone.isNullOrBlank()) { "backup_invalid_manifest" }
        runCatching { OffsetDateTime.parse(manifest.opt("createdAt") as? String ?: "") }
            .getOrElse { throw IllegalArgumentException("backup_invalid_manifest") }
        val revision = integer(manifest.opt("snapshotRevision"), "backup_invalid_snapshot_revision")
        require(revision >= 0.0) { "backup_invalid_snapshot_revision" }
        val counts = manifest.optJSONObject("recordCounts") ?: error("backup_invalid_record_counts")
        val records = integer(counts.opt("records"), "backup_invalid_record_counts")
        require(records >= 0.0) { "backup_invalid_record_counts" }
    }

    fun validateSnapshot(snapshot: JSONObject) {
        require(integer(snapshot.opt("schemaVersion"), "backup_unsupported_schema") == CURRENT_SCHEMA_VERSION.toDouble()) {
            "backup_unsupported_schema"
        }
        require(integer(snapshot.opt("snapshotRevision"), "backup_invalid_snapshot_revision") >= 0.0) {
            "backup_invalid_snapshot_revision"
        }
        require(snapshot.optJSONArray("records") != null) { "backup_records_missing" }
    }

    private fun integer(value: Any?, errorCode: String): Double {
        val number = value as? Number ?: throw IllegalArgumentException(errorCode)
        val result = number.toDouble()
        require(result.isFinite() && result % 1.0 == 0.0 && result <= MAX_SAFE_INTEGER) {
            errorCode
        }
        return result
    }
}
