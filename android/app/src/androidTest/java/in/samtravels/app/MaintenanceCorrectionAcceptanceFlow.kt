package `in`.samtravels.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

internal fun runMaintenanceDriverAndVisitCorrectionAcceptance(
  activity: MainActivity,
  database: LocalDatabase,
  visitId: String,
  visitChainId: String,
  correctionPrefix: String,
  expenseId: String,
  otherExpenseId: String,
  chainId: String,
) {
assertTrue("Driver", evaluateMaintenanceWebView(activity, """
    (() => {
      const personLabel = Array.from(document.querySelectorAll('label')).find(node => node.querySelector('select') && node.textContent.includes('Select person'));
      const person = personLabel?.querySelector('select');
      const roleLabel = Array.from(document.querySelectorAll('label')).find(node => node.textContent.includes('Active role'));
      const role = roleLabel?.querySelector('select');
      if (!person || !role) return false;
      const setSelect = (select, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setSelect(person, Array.from(person.options).find(option => option.textContent.trim() === 'Driver One')?.value ?? '');
      setSelect(role, 'driver');
      return Boolean(person.value);
    })()
"""))
evaluateMaintenanceWebView(activity, "Array.from(document.querySelectorAll('form button')).find(node => node.textContent.includes('Activate role'))?.click()")
assertTrue("Driver activates", awaitMaintenanceJavascript(activity,
    "document.querySelector('[role=status]')?.textContent.includes('Role activated')", 10_000))
assertTrue("Own record appears", awaitMaintenanceJavascript(activity,
    "Array.from(document.querySelectorAll('.admin-capability-record')).some(node => node.textContent.includes('Accept tyre repair'))", 10_000))
assertTrue("Driver correction ready", awaitMaintenanceJavascript(activity,
    "Array.from(document.querySelectorAll('.loan-schedule article.admin-capability-record')).find(node => node.textContent.includes('Accept tyre repair'))?.querySelector('button')?.disabled === false",
    15_000))
assertTrue("Driver button", evaluateMaintenanceWebView(activity, """
    (() => {
      document.querySelector('details.loan-schedule')?.setAttribute('open','');
      const card = Array.from(document.querySelectorAll('.loan-schedule article.admin-capability-record')).find(node => node.textContent.includes('Accept tyre repair'));
      const button = Array.from(card?.querySelectorAll('button') ?? []).find(node => node.textContent.includes('Correct amount / view history'));
      button?.click();
      return Boolean(button);
    })()
"""))
assertTrue("Driver form", awaitMaintenanceJavascript(activity,
    "Array.from(document.querySelectorAll('.loan-schedule article.admin-capability-record')).find(node => node.textContent.includes('Accept tyre repair'))?.querySelector('label input') !== null",
    15_000))
assertTrue("Driver submits", evaluateMaintenanceWebView(activity, """
    (() => {
      const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Accept tyre repair'));
      const set = (labelText, value) => {
        const label = Array.from(card?.querySelectorAll('label') ?? []).find(node => node.textContent.includes(labelText));
        const input = label?.querySelector('input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      if (!set('Corrected amount', '160.00') || !set('Reason for correction', 'Driver One verified own receipt')) return false;
      Array.from(card.querySelectorAll('button')).find(node => node.textContent.includes('Append correction'))?.click();
      return true;
    })()
"""))
assertTrue("Driver correction committed", awaitMaintenanceJavascript(activity,
    "Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Accept tyre repair'))?.textContent.includes('Correction appended')", 15_000))
assertTrue("Other record", awaitMaintenanceJavascript(activity,
    "Array.from(document.querySelectorAll('.admin-capability-record')).some(node => node.textContent.includes('Other Driver tyre'))", 10_000))
assertTrue("Other form button", evaluateMaintenanceWebView(activity, """
    (() => {
      const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Other Driver tyre'));
      const button = Array.from(card?.querySelectorAll('button') ?? []).find(node => node.textContent.includes('Correct amount / view history'));
      button?.click();
      return Boolean(button);
    })()
"""))
assertTrue("Other form opens", awaitMaintenanceJavascript(activity,
    "Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Other Driver tyre'))?.querySelector('label input') !== null",
    15_000))
assertTrue("Other input", evaluateMaintenanceWebView(activity, """
    (() => {
      const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Other Driver tyre'));
      const set = (labelText, value) => {
        const label = Array.from(card?.querySelectorAll('label') ?? []).find(node => node.textContent.includes(labelText));
        const input = label?.querySelector('input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      if (!set('Corrected amount', '210.00') || !set('Reason for correction', 'Attempt to alter another Driver record')) return false;
      Array.from(card.querySelectorAll('button')).find(node => node.textContent.includes('Append correction'))?.click();
      return true;
    })()
"""))
assertTrue("Other rejected", awaitMaintenanceJavascript(activity,
    "Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Other Driver tyre'))?.textContent.includes('historical_correction_forbidden')", 15_000))
val visitCardReady = awaitMaintenanceJavascript(activity, "Array.from(document.querySelectorAll('.admin-capability-record')).some(node => node.textContent.includes('Accept service visit'))", 10_000)
assertTrue("Visit history", visitCardReady)
assertTrue("Visit correction opens", evaluateMaintenanceWebView(activity, """(() => { const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Accept service visit')); const button = Array.from(card?.querySelectorAll('button') ?? []).find(node => node.textContent.includes('Correct visit total / view history')); button?.click(); return Boolean(button); })()"""))
assertTrue("Visit correction fields", evaluateMaintenanceWebView(activity, """(() => { const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Accept service visit')); const set = (labelText, value) => { const label = Array.from(card?.querySelectorAll('label') ?? []).find(node => node.textContent.includes(labelText)); const input = label?.querySelector('input'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); return true; }; return set('Corrected visit total', '225.00') && set('Reason for correction', 'Final visit invoice verified'); })()"""))
assertTrue("Visit correction submit is enabled", evaluateMaintenanceWebView(activity, """
    (() => {
      const card = Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Accept service visit'));
      const button = Array.from(card?.querySelectorAll('button') ?? []).find(node => node.textContent.includes('Append correction'));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
"""))
assertTrue("Visit correction committed", awaitMaintenanceJavascript(activity, "Array.from(document.querySelectorAll('.admin-capability-record')).find(node => node.textContent.includes('Accept service visit'))?.textContent.includes('Visit correction appended')", 15_000))
val originalVisit = JSONObject(database.records().get(visitId)!!.json).getJSONObject("data")
assertEquals("Original visit total", 20000L, originalVisit.getLong("totalPaise"))
assertEquals("Original visit item amount", 20000L,
    originalVisit.getJSONArray("items").getJSONObject(0).getLong("amountPaise"))
val visitCorrections = database.records().list().filter { it.id.startsWith(correctionPrefix) }
    .map { JSONObject(it.json).getJSONObject("data") }
    .filter { it.optString("targetRecordId") == visitId }
assertEquals("One visit correction", 1, visitCorrections.size)
assertEquals("totalPaise", visitCorrections.single().getString("fieldPath"))
assertEquals(20000L, visitCorrections.single().getLong("beforeValue"))
assertEquals(22500L, visitCorrections.single().getLong("afterValue"))
assertEquals("admin", visitCorrections.single().getJSONObject("actor").getString("role"))
val visitHead = JSONObject(database.records().get(visitChainId)!!.json).getJSONObject("data")
assertEquals(1, visitHead.getInt("chainRevision"))
assertEquals(visitCorrections.single().getString("correctionId"), visitHead.getString("headCorrectionId"))
val driverOneChain = database.records().list().filter { it.id.startsWith(correctionPrefix) }
    .map { JSONObject(it.json).getJSONObject("data") }
    .filter { it.optString("targetRecordId") == expenseId }
    .sortedBy { it.getInt("chainRevision") }
assertEquals("Two-entry correction chain", 2, driverOneChain.size)
assertEquals("person-driver-one", driverOneChain.last().getJSONObject("actor").getString("actorId"))
assertEquals("Driver One verified own receipt", driverOneChain.last().getString("reason"))
assertEquals("No other correction", 0, database.records().list()
    .filter { it.id.startsWith(correctionPrefix) }
    .count { runCatching { JSONObject(it.json).getJSONObject("data").optString("targetRecordId") == otherExpenseId }.getOrDefault(false) })
val backup = NativeBackupCoverage.exportBusinessRecords(database, NativeBackupRecovery::isInternalRecord)
NativeBackupCoverage.replaceBusinessRecords(database, JSONArray())
assertEquals("Restore must begin from an empty business-record set", 0, database.records().list()
    .count { it.id == expenseId || it.id == otherExpenseId || it.id == chainId })
NativeBackupCoverage.replaceBusinessRecords(database, backup)
val restoredOriginal = JSONObject(database.records().get(expenseId)!!.json)
assertEquals("Restore original", 10000L,
    restoredOriginal.getJSONObject("data").getLong("amountPaise"))
val restoredCorrections = database.records().list().filter { it.id.startsWith(correctionPrefix) }
    .map { JSONObject(it.json).getJSONObject("data") }
    .filter { it.optString("targetRecordId") == expenseId }
    .sortedBy { it.getInt("chainRevision") }
assertEquals(2, restoredCorrections.size)
assertEquals(driverOneChain.last().getString("correctionId"), restoredCorrections.last().getString("correctionId"))
val restoredHead = JSONObject(database.records().get(chainId)!!.json).getJSONObject("data")
assertEquals(2, restoredHead.getInt("chainRevision"))
assertEquals(restoredCorrections.last().getString("correctionId"), restoredHead.getString("headCorrectionId"))
}
