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
    read: (MainActivity, String) -> String,
  ): Boolean {
    val clickIfClosed = """
      (() => {
        if (document.querySelector('.compliance-correction-editor')) return true;
        const button = Array.from(document.querySelectorAll('.compliance-correction > button'))
          .find(node => node.textContent.includes('Correct details / history'));
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()
    """
    val editorCheck = "document.querySelector('.compliance-correction-editor') !== null"
    var editorOpened = false
    repeat(3) {
      if (editorOpened) return@repeat
      val clickDispatched = read(page, clickIfClosed)
      if (clickDispatched != "true") {
        val diagnostic = read(page, """
          (() => {
            const button = Array.from(document.querySelectorAll('.compliance-correction > button'))
              .find(node => node.textContent.includes('Correct details / history') ||
                node.textContent.includes('Close correction'));
            return JSON.stringify({
              buttonPresent: !!button,
              buttonEnabled: !!button && !button.disabled,
              editorPresent: !!document.querySelector('.compliance-correction-editor'),
            });
          })()
        """)
        throw AssertionError("Compliance correction trigger is unavailable: " + diagnostic)
      }
      editorOpened = await(page, editorCheck, 2_000)
    }
    if (!editorOpened) {
      val diagnostic = read(page, """
        (() => {
          const button = Array.from(document.querySelectorAll('.compliance-correction > button'))
            .find(node => node.textContent.includes('Correct details / history') ||
              node.textContent.includes('Close correction'));
          const correction = button?.closest('.compliance-correction');
          return JSON.stringify({
            buttonPresent: !!button,
            buttonEnabled: !!button && !button.disabled,
            editorPresent: !!correction?.querySelector('.compliance-correction-editor'),
            correctionContainerPresent: !!correction,
            statusPresent: !!correction?.querySelector('[role=status]'),
          });
        })()
      """)
      throw AssertionError("Compliance correction editor did not open after bounded retries: " + diagnostic)
    }
    return true
  }

  fun fillTotalCostCorrection(
    page: MainActivity,
    await: (MainActivity, String, Long) -> Boolean,
    read: (MainActivity, String) -> String,
  ): Boolean {
    val selected = read(page, """
      (() => {
        const editor = document.querySelector('.compliance-correction-editor');
        const labels = Array.from(editor?.querySelectorAll('label') ?? []);
        const label = labels.find(node => node.textContent.includes('Field to correct'));
        const select = label?.querySelector('select');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        const optionAvailable = !!select && Array.from(select.options).some(option => option.value === 'totalCostPaise');
        if (select && setter && optionAvailable) {
          setter.call(select, 'totalCostPaise');
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return !!select && select.value === 'totalCostPaise';
      })()
    """)
    if (selected != "true") {
      val diagnostic = read(page, """
        (() => {
          const editor = document.querySelector('.compliance-correction-editor');
          const labels = Array.from(editor?.querySelectorAll('label') ?? []);
          const label = labels.find(node => node.textContent.includes('Field to correct'));
          const select = label?.querySelector('select');
          return JSON.stringify({
            editorPresent: !!editor,
            labelPresent: !!label,
            selectPresent: !!select,
            setterPresent: typeof Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set === 'function',
            optionAvailable: !!select && Array.from(select.options).some(option => option.value === 'totalCostPaise'),
            selectionApplied: !!select && select.value === 'totalCostPaise',
          });
        })()
      """)
      throw AssertionError("Compliance correction input stage: field selection did not apply: " + diagnostic)
    }
    if (!await(page,
        "Array.from(document.querySelectorAll('.compliance-correction-editor label')).some(node => node.textContent.includes('Corrected total cost') && node.querySelector('input'))",
        10_000)) throw AssertionError("Compliance correction input stage: corrected input was not rendered")
    val fieldsEntered = read(page, """
      (() => {
        const labels = Array.from(document.querySelectorAll('.compliance-correction-editor label'));
        const amount = labels.find(node => node.textContent.includes('Corrected total cost'))?.querySelector('input[type="number"]');
        const reason = labels.find(node => node.textContent.includes('Reason for correction'))?.querySelector('textarea');
        const amountSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const reasonSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!amount || !reason || !amountSetter || !reasonSetter) return false;
        amountSetter.call(amount, '730.00');
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        amount.dispatchEvent(new Event('change', { bubbles: true }));
        reasonSetter.call(reason, 'Final premium verified against insurer receipt');
        reason.dispatchEvent(new Event('input', { bubbles: true }));
        reason.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    """)
    if (fieldsEntered != "true") {
      val diagnostic = read(page, """
        (() => {
          const labels = Array.from(document.querySelectorAll('.compliance-correction-editor label'));
          const amountLabel = labels.find(node => node.textContent.includes('Corrected total cost'));
          const reasonLabel = labels.find(node => node.textContent.includes('Reason for correction'));
          return JSON.stringify({
            amountLabelPresent: !!amountLabel,
            amountControlPresent: !!amountLabel?.querySelector('input[type="number"]'),
            reasonLabelPresent: !!reasonLabel,
            reasonControlPresent: !!reasonLabel?.querySelector('textarea'),
            amountSetterPresent: typeof Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set === 'function',
            reasonSetterPresent: typeof Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set === 'function',
          });
        })()
      """)
      throw AssertionError("Compliance correction input stage: controls unavailable: " + diagnostic)
    }
    val controlledStateCommitted = await(page, """
      (() => {
        const amountLabel = Array.from(document.querySelectorAll('.compliance-correction-editor label'))
          .find(node => node.textContent.includes('Corrected total cost'));
        const reasonLabel = Array.from(document.querySelectorAll('.compliance-correction-editor label'))
          .find(node => node.textContent.includes('Reason for correction'));
        const amount = amountLabel?.querySelector('input');
        const reason = reasonLabel?.querySelector('textarea');
        const submit = document.querySelector('.compliance-correction-editor button.admin-primary');
        return !!amount && !!reason && !!submit && !submit.disabled &&
          amount.value === '730.00' &&
          reason.value === 'Final premium verified against insurer receipt';
      })()
    """, 10_000)
    if (!controlledStateCommitted) {
      val diagnostic = read(page, """
        (() => {
          const labels = Array.from(document.querySelectorAll('.compliance-correction-editor label'));
          const amount = labels.find(node => node.textContent.includes('Corrected total cost'))?.querySelector('input');
          const reason = labels.find(node => node.textContent.includes('Reason for correction'))?.querySelector('textarea');
          const submit = document.querySelector('.compliance-correction-editor button.admin-primary');
          return JSON.stringify({
            amountPresent: !!amount,
            reasonPresent: !!reason,
            submitPresent: !!submit,
            submitEnabled: !!submit && !submit.disabled,
            amountMatches: !!amount && amount.valueAsNumber === 730,
            reasonMatches: !!reason && reason.value === 'Final premium verified against insurer receipt',
          });
        })()
      """)
      throw AssertionError("Compliance correction input stage did not settle: " + diagnostic)
    }
    return true
  }
}
