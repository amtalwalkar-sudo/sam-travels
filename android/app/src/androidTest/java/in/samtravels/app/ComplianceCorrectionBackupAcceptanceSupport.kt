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
    val clickDispatched = await(page, clickOnce, 10_000)
    if (!clickDispatched) {
      val diagnostic = read(page, """
        (() => {
          const button = Array.from(document.querySelectorAll('.compliance-correction > button'))
            .find(node => node.textContent.includes('Correct details / history'));
          return JSON.stringify({
            buttonPresent: !!button,
            buttonEnabled: !!button && !button.disabled,
            clickMarkerPresent: button?.dataset.acceptanceClickDispatched === 'true',
            editorPresent: !!document.querySelector('.compliance-correction-editor'),
          });
        })()
      """)
      throw AssertionError("Compliance correction trigger could not be dispatched: " + diagnostic)
    }
    val editorOpened = await(page, "document.querySelector('.compliance-correction-editor') !== null", 10_000)
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
            buttonTextRecognized: !!button && /Correct details \/ history|Close correction/.test(button.textContent),
            clickMarkerPresent: button?.dataset.acceptanceClickDispatched === 'true',
            editorPresent: !!correction?.querySelector('.compliance-correction-editor'),
            correctionContainerPresent: !!correction,
            statusPresent: !!correction?.querySelector('[role=status]'),
          });
        })()
      """)
      throw AssertionError("Compliance correction editor did not open after trigger: " + diagnostic)
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
    val fieldsEnteredResult = read(page, """
      (() => {
        const editor = document.querySelector('.compliance-correction-editor');
        const labels = Array.from(editor?.querySelectorAll('label') ?? []);
        const amountLabel = labels.find(node => node.textContent.includes('Corrected total cost'));
        const amount = amountLabel?.querySelector('input[type="number"]');
        const reasonLabel = labels.find(node => node.textContent.includes('Reason for correction'));
        const reason = reasonLabel?.querySelector('textarea');
        const amountSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const reasonSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!amount || !reason || !amountSetter || !reasonSetter) {
          return JSON.stringify({
            editorPresent: !!editor,
            amountLabelPresent: !!amountLabel,
            amountControlPresent: !!amount,
            reasonLabelPresent: !!reasonLabel,
            reasonControlPresent: !!reason,
            amountSetterPresent: !!amountSetter,
            reasonSetterPresent: !!reasonSetter,
          });
        }
        amountSetter.call(amount, '730.00');
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        amount.dispatchEvent(new Event('change', { bubbles: true }));
        reasonSetter.call(reason, 'Final premium verified against insurer receipt');
        reason.dispatchEvent(new Event('input', { bubbles: true }));
        reason.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({
          editorPresent: true,
          amountControlPresent: true,
          reasonControlPresent: true,
          amountSetterPresent: true,
          reasonSetterPresent: true,
        });
      })()
    """)
    if (!fieldsEnteredResult.contains("\\"amountControlPresent\\":true") ||
        !fieldsEnteredResult.contains("\\"reasonControlPresent\\":true")) {
      throw AssertionError("Compliance correction input stage: controls unavailable: " + fieldsEnteredResult)
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
