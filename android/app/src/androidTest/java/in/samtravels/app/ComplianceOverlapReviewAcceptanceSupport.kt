package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

/** Focused rendered WebView assertions for Room-backed Compliance overlap decisions. */
internal object ComplianceOverlapReviewAcceptanceSupport {
  fun assertRoomBackedOverlapReview(
    page: MainActivity,
    database: LocalDatabase,
    complianceId: String,
    validFrom: String,
    validTo: String,
    renewalFrom: String,
    evaluate: (MainActivity, String) -> Boolean,
    await: (MainActivity, String, Long) -> Boolean,
  ) {
    assertTrue("Linked renewal overlap is rendered", await(
      page,
      "Array.from(document.querySelectorAll('.compliance-overlap-card')).some(node => node.textContent.includes('Acceptance insurance'))",
      15_000,
    ))
    assertTrue("Overlap date selector is available", evaluate(page, """
      (() => {
        const input = [...document.querySelectorAll('.compliance-daily-heading label input[type=date]')][0];
        if (!input) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '$renewalFrom');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    """))
    assertTrue("Unreviewed overlap withholds combined cost", await(
      page,
      "Array.from(document.querySelectorAll('.compliance-daily-cost .compliance-daily-withheld')).some(node => node.textContent.includes('withheld'))",
      15_000,
    ))
    val rationale = "Renewal overlap checked against the linked policy documents."
    assertTrue("Overlap review reason and confirmation submitted", evaluate(page, """
      (() => {
        const card = [...document.querySelectorAll('.compliance-overlap-card')]
          .find(node => node.textContent.includes('Acceptance insurance'));
        const reason = card?.querySelector('textarea');
        const confirm = [...(card?.querySelectorAll('button') ?? [])]
          .find(node => node.textContent.trim() === 'Confirm overlap');
        if (!reason || !confirm) return false;
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(reason, '$rationale');
        reason.dispatchEvent(new Event('input', { bubbles: true }));
        confirm.click();
        return true;
      })()
    """))
    assertTrue("Confirmed overlap readback refreshes", await(
      page,
      "Array.from(document.querySelectorAll('.compliance-overlap-card')).some(node => node.textContent.includes('Confirmed for these exact source revisions. Dates and overlap are retained.'))",
      20_000,
    ))
    assertTrue("Confirmed overlap releases daily allocation", await(
      page,
      "Array.from(document.querySelectorAll('.compliance-daily-cost .compliance-daily-total')).some(node => node.textContent.includes('Combined daily allocation'))",
      20_000,
    ))
    val reviewEvents = database.records().list().filter { it.id.startsWith("compliance-overlap-review:") }
      .filter { runCatching { JSONObject(it.json).getJSONObject("data").optString("rationale") == rationale }.getOrDefault(false) }
    assertEquals("One append-only Room overlap review", 1, reviewEvents.size)
    val reviewData = JSONObject(reviewEvents.single().json).getJSONObject("data")
    assertEquals("confirmed", reviewData.getString("decision"))
    assertEquals("admin", reviewData.getJSONObject("actor").getString("role"))
    assertEquals(rationale, reviewData.getString("rationale"))
    assertEquals(2, reviewData.getJSONArray("sourceRecords").length())
    assertTrue("Review binds original source revision", (0 until reviewData.getJSONArray("sourceRecords").length()).any {
      reviewData.getJSONArray("sourceRecords").getJSONObject(it).getString("recordId") == complianceId &&
        reviewData.getJSONArray("sourceRecords").getJSONObject(it).getInt("recordRevision") == 1
    })
    assertEquals("Original Compliance dates remain unchanged", validFrom,
      JSONObject(database.records().get(complianceId)!!.json).getJSONObject("data").getString("validFrom"))
    assertEquals("Original Compliance end date remains unchanged", validTo,
      JSONObject(database.records().get(complianceId)!!.json).getJSONObject("data").getString("validTo"))
  }
}
