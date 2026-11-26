package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals

/** Shared Room backup/restore assertions for Compliance correction and renewal. */
internal object ComplianceCorrectionBackupAcceptanceSupport {
  fun assertBackupRestore(
    database: LocalDatabase,
    complianceId: String,
    correctionId: String,
    renewalId: String,
  ) {
    val backup = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
    NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
    NativeBackupCoverage.replaceBusinessRecords(database, backup)
    assertEquals(36500L, JSONObject(database.records().get(complianceId)!!.json).getJSONObject("data").getLong("totalCostPaise"))
    assertEquals(73000L, JSONObject(database.records().get("historical-correction:" + correctionId)!!.json)
      .getJSONObject("data").getLong("afterValue"))
    assertEquals("Renewal lineage survives Room backup/restore", complianceId,
      JSONObject(database.records().get(renewalId)!!.json).getJSONObject("data").getString("renewedFromRecordId"))
  }
}
