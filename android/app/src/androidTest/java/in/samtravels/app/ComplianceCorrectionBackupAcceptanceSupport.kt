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

  fun openCorrectionEditor(
    page: MainActivity,
    await: (MainActivity, String, Long) -> Boolean,
  ): Boolean {
    val clickOnce = """
      (() => {
        const button = Array.from(document.querySelectorAll('.compliance-correction > button'))
          .find(node => node.textContent.includes('Correct details / history'));
        if (!button || button.disabled) return false;
        if (button.dataset.acceptanceClickDispatched === 'true') return true;
        button.dataset.acceptanceClickDispatched = 'true';
        button.click();
        return true;
      })()
    """
    if (!await(page, clickOnce, 10_000)) return false
    return await(page, "document.querySelector('.compliance-correction-editor') !== null", 10_000)
  }

  fun fillTotalCostCorrection(
    page: MainActivity,
    await: (MainActivity, String, Long) -> Boolean,
    read: (MainActivity, String) -> String,
  ): Boolean {
    val selected = read(page, """
      (() => {
        const label = Array.from(document.querySelectorAll('.compliance-correction-editor label'))
          .find(node => node.textContent.includes('Field to correct'));
        const select = label?.querySelector('select');
        if (!select) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(select, 'totalCostPaise');
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    """)
    if (selected != "true") return false
    if (!await(page,
        "Array.from(document.querySelectorAll('.compliance-correction-editor label')).some(node => node.textContent.includes('Corrected total cost') && node.querySelector('input'))",
        10_000)) return false
    return read(page, """
      (() => {
        const amountLabel = Array.from(document.querySelectorAll('.compliance-correction-editor label'))
          .find(node => node.textContent.includes('Corrected total cost'));
        const amount = amountLabel?.querySelector('input');
        const reasonLabel = Array.from(document.querySelectorAll('.compliance-correction-editor label'))
          .find(node => node.textContent.includes('Reason for correction'));
        const reason = reasonLabel?.querySelector('textarea');
        if (!amount || !reason) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(amount, '730.00');
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(reason, 'Final premium verified against insurer receipt');
        reason.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    """) == "true"
  }
}
