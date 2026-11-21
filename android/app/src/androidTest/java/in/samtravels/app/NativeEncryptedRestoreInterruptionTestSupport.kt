package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

/** Focused encrypted-package interruption assertion kept separate from the shared fixture runner. */
internal fun assertEncryptedRoomRestoreRollbackAfterInterruption(
    database: LocalDatabase,
    encrypted: JSONObject,
    recoveryKey: String,
    at: String,
) {
    database.records().put(StoredRecord(
        "encrypted-interruption-sentinel",
        JSONObject().put("id", "encrypted-interruption-sentinel")
            .put("schemaVersion", 1).put("createdAt", at).put("updatedAt", at)
            .put("source", "android").put("revision", 1)
            .put("data", JSONObject().put("value", "preserve-on-interruption")).toString(),
        1, at,
    ))
    val baseline = NativeSnapshotBuilder.build(
        database, NativeBackupRecovery::isInternalRecord, "encrypted-interruption-baseline",
    )
    val interruption = runCatching {
        NativeBackupRestoreCoordinator.restoreEncrypted(
            database, encrypted, recoveryKey,
            { NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "encrypted-interruption-readback") },
            afterReplacement = { throw IllegalStateException("injected_encrypted_post_replacement_failure") },
        )
    }.exceptionOrNull()
    assertEquals("injected_encrypted_post_replacement_failure", interruption?.message)
    val recovered = NativeSnapshotBuilder.build(
        database, NativeBackupRecovery::isInternalRecord, "encrypted-interruption-recovered",
    )
    assertEquals(canonicalRecords(baseline.snapshot.getJSONArray("records")),
        canonicalRecords(recovered.snapshot.getJSONArray("records")))
    assertTrue(database.records().list().any { row ->
        row.id.startsWith(NativeBackupRecovery.JOURNAL_PREFIX) &&
            JSONObject(row.json).optString("status") == "rollback_complete"
    })
    // Remove only the test sentinel after proving the rollback baseline; the
    // shared lifecycle runner then continues with its original source graph.
    database.records().remove("encrypted-interruption-sentinel")
}

private fun canonicalRecords(records: JSONArray): List<String> =
    (0 until records.length()).map { index ->
        val row = records.getJSONObject(index)
        listOf(row.getString("participantId"), row.getString("id"), row.getString("json"),
            row.getInt("schemaVersion").toString(), row.getString("updatedAt")).joinToString("|")
    }.sorted()
