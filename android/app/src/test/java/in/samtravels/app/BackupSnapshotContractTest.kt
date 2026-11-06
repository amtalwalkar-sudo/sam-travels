package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BackupSnapshotContractTest {
    private fun validManifest() = JSONObject(
        """{
          "applicationVersion":"0.1.0",
          "schemaVersion":1,
          "createdAt":"2026-11-06T08:00:00Z",
          "businessTimezone":"Asia/Kolkata",
          "snapshotRevision":4,
          "recordCounts":{"records":2}
        }""",
    )

    @Test
    fun acceptsCurrentManifestAndSnapshot() {
        BackupSnapshotContract.validateManifest(validManifest())
        BackupSnapshotContract.validateSnapshot(
            JSONObject("""{"schemaVersion":1,"snapshotRevision":4,"records":[]}"""),
        )
    }

    @Test
    fun rejectsFutureAndMalformedManifestVersions() {
        assertEquals("backup_unsupported_schema", assertThrows(IllegalArgumentException::class.java) {
            BackupSnapshotContract.validateManifest(validManifest().put("schemaVersion", 2))
        }.message)
        assertEquals("backup_invalid_record_counts", assertThrows(IllegalArgumentException::class.java) {
            BackupSnapshotContract.validateManifest(validManifest().put("recordCounts", JSONObject()))
        }.message)
        assertEquals("backup_invalid_snapshot_revision", assertThrows(IllegalArgumentException::class.java) {
            BackupSnapshotContract.validateManifest(validManifest().put("snapshotRevision", -1))
        }.message)
    }

    @Test
    fun rejectsMalformedSnapshotAndFutureVersion() {
        assertThrows(IllegalArgumentException::class.java) {
            BackupSnapshotContract.validateSnapshot(JSONObject("""{"schemaVersion":2,"records":[]}"""))
        }
        assertThrows(IllegalArgumentException::class.java) {
            BackupSnapshotContract.validateSnapshot(JSONObject("""{"schemaVersion":1,"snapshotRevision":0}"""))
        }
    }
}
