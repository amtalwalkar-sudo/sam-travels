import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = "http://127.0.0.1:4173";
function indiaDateOffsetDays(offset) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const base = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  return new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
}
function proratedTargetPaise(monthlyTargetPaise, from, to) {
  let total = 0;
  let cursor = from;
  while (cursor <= to) {
    const [year, month] = cursor.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    const days = Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(cursor + "T00:00:00Z")) / 86_400_000) + 1;
    total += Math.floor((monthlyTargetPaise * days * 2 + daysInMonth) / (2 * daysInMonth));
    cursor = new Date(Date.parse(end + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  }
  return total;
}
function moneyFromPaise(paise) {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function monthTargetPaise(month, from, to, monthlyTargetPaise) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = month + "-01";
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const start = from > monthStart ? from : monthStart;
  const end = to < monthEnd ? to : monthEnd;
  return start > end ? 0 : proratedTargetPaise(monthlyTargetPaise, start, end);
}
function previousMonthDate(day) {
  const today = indiaDateOffsetDays(0);
  const [year, month] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return previous.toISOString().slice(0, 7) + "-" + String(day).padStart(2, "0");
}
const today = indiaDateOffsetDays(0);
const businessStartDate = previousMonthDate(15);
const recoveryToExclusive = (() => {
  const [year, month, day] = businessStartDate.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + 18;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
})();
const targetRupees = "30000";
const preBusinessAmount = "1800";
const note = "Performance screen acceptance pre-business cost";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
  detached: true, stdio: "ignore",
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(baseUrl); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("vite_server_not_ready");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777, accuracy: 12 },
  });
  const page = await context.newPage();
  page.on("pageerror", error => console.log("Browser page error:", error.message));
  page.on("console", message => { if (message.type() === "error") console.log("Browser console error:", message.text()); });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
  const testPin = String(1000 + (Date.now() % 9000));
  await page.getByLabel("Person name").fill("Performance Screen Acceptance Admin");
  await page.getByLabel("Admin role").check();
  await page.getByLabel("Set initial Admin PIN").fill(testPin);
  await page.getByRole("button", { name: "Enroll person", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled." }).waitFor();
  await page.locator("label").filter({ hasText: "Select person" }).locator("select")
    .selectOption({ label: "Performance Screen Acceptance Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill(testPin);
  await page.getByRole("button", { name: "Activate role", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor();

  const adminSections = page.getByRole("navigation", { name: "Admin sections" });
  await adminSections.getByRole("button", { name: "Vehicle", exact: true }).click();
  await page.getByRole("button", { name: "Add vehicle", exact: true }).click();
  await page.getByLabel("Registration number").fill("MH00PS0093");
  await page.getByLabel("Make").fill("Acceptance");
  await page.getByLabel("Model").fill("Performance");
  await page.getByLabel("Vehicle type").fill("Car");
  await page.getByLabel("Fuel type").selectOption("CNG");
  await page.getByLabel("Year of manufacture").fill("2024");
  await page.getByRole("button", { name: "Create vehicle", exact: true }).click();
  await page.getByText("MH00PS0093", { exact: true }).waitFor();
  console.log("Single active vehicle configured for the Performance distance projection.");

  // Build a real Driver identity/profile/assignment and use the rendered Work
  // controls to commit trip events and Fare. No trip or submitted financial
  // record is injected into IndexedDB by this acceptance path.
  const driverName = "Performance Acceptance Driver";
  await adminSections.getByRole("button", { name: "Driver", exact: true }).click();
  await page.getByRole("button", { name: "Add driver", exact: true }).click();
  await page.getByLabel("Driver name").fill(driverName);
  await page.getByRole("button", { name: "Save driver", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Driver created." }).waitFor();
  await page.getByLabel("Vehicle for " + driverName).selectOption({ label: "MH00PS0093 · Acceptance Performance" });
  await page.getByRole("button", { name: "Assign / reassign", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Vehicle assignment saved." }).waitFor();
  await page.getByRole("button", { name: "Select for Work", exact: true }).click();
  await page.getByRole("status").filter({ hasText: driverName + " selected for Work." }).waitFor();

  // Refresh the identity panel so it discovers the newly-created Driver profile.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
  await page.getByLabel("Person name").fill("Performance Acceptance Driver Person");
  await page.getByRole("button", { name: "Enroll person", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled." }).waitFor();
  const driverPersonLink = page.getByLabel("Link " + driverName + " to person");
  await driverPersonLink.locator("option").filter({ hasText: "Performance Acceptance Driver Person" }).waitFor();
  await driverPersonLink.selectOption({ label: "Performance Acceptance Driver Person" });

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Drive", exact: true }).click();
  const workDriver = page.getByLabel("Work Driver");
  await workDriver.locator("option").filter({ hasText: driverName }).waitFor();
  await workDriver.selectOption({ label: driverName });
  await page.locator(".driver-message").filter({ hasText: "Work Driver selected" }).waitFor();
  await page.getByLabel("Shift-start odometer (km)").fill("1000");
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  await page.getByRole("heading", { name: "Shift Active", exact: true }).waitFor({ timeout: 30000 });

  async function completeSwipe(label, nextState) {
    await page.locator('input[type="range"][aria-label="Swipe to ' + label + '"]').press("End");
    await page.getByRole("heading", { name: nextState, exact: true }).waitFor({ timeout: 30000 });
  }
  await completeSwipe("Going to pickup", "Going To Pickup");
  await completeSwipe("Start trip", "Trip Active");
  await completeSwipe("End trip", "Shift Active");
  await page.getByText("Fare and trip financials required", { exact: true }).waitFor();

  await page.getByLabel("Fare in rupees").fill("2520.00");
  await page.getByText("Add Toll (optional)", { exact: true }).click();
  await page.getByLabel("Toll in rupees").fill("320.00");
  await page.getByLabel("Toll paid by").selectOption("driver");
  await page.getByText("Add Parking (optional)", { exact: true }).click();
  await page.getByLabel("Parking in rupees").fill("250.00");
  await page.getByLabel("Parking paid by").selectOption("driver");
  await page.getByRole("button", { name: "Submit trip financials", exact: true }).click();
  await page.locator(".driver-message").filter({ hasText: "Fare and trip financials submitted" }).waitFor({ timeout: 30000 });

  const committedTripFinancials = await page.evaluate(async () => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readonly");
      const read = transaction.objectStore("records").getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    db.close();
    const row = rows.find(item => item.data?.kind === "completed_ride_financials" &&
      item.data.status === "submitted" && item.data.farePaise === 252000);
    return row ? { id: row.id, revision: row.revision, data: row.data } : null;
  });
  if (!committedTripFinancials || committedTripFinancials.revision !== 2 ||
      committedTripFinancials.data.tollPaise !== 32000 ||
      committedTripFinancials.data.tollPayer !== "driver" ||
      committedTripFinancials.data.parkingPaise !== 25000 ||
      committedTripFinancials.data.parkingPayer !== "driver" ||
      committedTripFinancials.data.tripContext?.vehicleId !== "feature:vehicle:MH00PS0093" ||
      committedTripFinancials.data.tripContext?.operationalDate !== today) {
    throw new Error("rendered_work_trip_fare_action_did_not_commit_expected_authoritative_record:" +
      JSON.stringify(committedTripFinancials));
  }
  console.log("Rendered Work swipe actions committed End Ride, required Fare, driver-paid Toll/Parking, and immutable trip context to IndexedDB revision 2.");

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Admin", exact: true }).click();
  await adminSections.getByRole("button", { name: "Business setup", exact: true }).click();
  await page.getByLabel("Business start date").fill(businessStartDate);
  await page.getByRole("button", { name: /Set business start date|Save changes/, exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Business start date saved." }).waitFor();

  await adminSections.getByRole("button", { name: "Performance", exact: true }).click();
  await page.getByLabel("Monthly Driver Target (₹)").fill(targetRupees);
  await page.getByRole("button", { name: "Save monthly target", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Monthly Driver Target saved." }).waitFor();
  await page.getByLabel("Amount (₹)").fill(preBusinessAmount);
  await page.getByLabel("What was this cost for?").fill(note);
  await page.getByRole("button", { name: "Add pre-business cost", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Pre-business cost entry saved." }).waitFor();
  await page.getByText(note, { exact: true }).waitFor();
  await page.evaluate(async ({ operationalDate }) => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const createdAt = operationalDate + "T10:00:00.000Z";
    const tripContext = {
      schemaVersion: 1, shiftId: "performance-acceptance-shift",
      driverId: "performance-acceptance-driver",
      assignmentId: "performance-acceptance-assignment",
      vehicleId: "feature:vehicle:MH00PS0093",
      operationalDate,
    };
    const records = [
      {
        id: "work:daily-business-km:" + encodeURIComponent("feature:vehicle:MH00PS0093") + ":" + operationalDate,
        schemaVersion: 1, createdAt, updatedAt: createdAt, businessDate: operationalDate,
        source: "web", revision: 1,
        data: {
          schemaVersion: 1, kind: "daily_business_kilometres",
          vehicleId: "feature:vehicle:MH00PS0093", operationalDate,
          totalBusinessKm: 42, unallocatedBusinessKm: 0,
          entries: [{ shiftId: "performance-acceptance-shift", allocationStatus: "allocated",
            businessKm: 42, personalKm: 7 }],
        },
      },
      {
        id: "work:trip-financial-obligation:performance-screen-cancellation",
        schemaVersion: 1, createdAt, updatedAt: createdAt, businessDate: operationalDate,
        source: "web", revision: 1,
        data: {
          schemaVersion: 1, tripId: "performance-screen-cancellation",
          kind: "cancellation_fee", status: "submitted",
          cancellationEventId: "performance-screen-cancellation-event", createdAt,
          tripContext, feePaise: 5000,
        },
      },
    ];
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readwrite");
      for (const record of records) transaction.objectStore("records").put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, { operationalDate: today });
  console.log("Verified fare and cancellation-fee source records seeded for the selected operational date.");
  console.log("Performance Admin inputs saved: actual business start date, fixed monthly target, and a separately noted pre-business cost.");

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Performance", exact: true }).click();
  await page.getByRole("heading", { name: "Performance overview", exact: true }).waitFor();

  const period = page.locator(".performance-period-form");
  await period.getByLabel("Period from").fill(businessStartDate);
  await period.getByLabel("Period to").fill(today);
  await period.getByRole("button", { name: /Refresh performance|Calculating/, exact: false }).click();
  try {
    await page.getByText("Lifetime breakeven & target position", { exact: true }).waitFor({ timeout: 30000 });
  } catch (error) {
    console.log("Performance screen after calculation:", await page.locator(".performance-dashboard").innerText());
    console.log("Performance inputs:", await period.locator("input").evaluateAll(inputs => inputs.map(input => ({ value: input.value, disabled: input.disabled }))));
    console.log("Performance refresh button:", await period.getByRole("button").evaluate(button => ({ text: button.innerText, disabled: button.disabled, html: button.outerHTML })));
    console.log("Performance errors:", await page.locator(".performance-error, .performance-loading, .performance-empty").allTextContents());
    throw error;
  }
  await page.locator(".performance-meta").getByText(businessStartDate, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Explain Business distance", exact: true }).waitFor();
  await page.getByRole("button", { name: "Explain active driving days", exact: true }).waitFor();
  await page.getByRole("button", { name: "Explain average business kilometres per active driving day", exact: true }).waitFor();
  if (await page.locator(".performance-error").count()) {
    throw new Error("optional_distance_projection_failure_blocked_core_performance_calculation");
  }

  const periodRevenue = page.getByRole("button", { name: "Explain Period revenue", exact: true });
  if (!(await periodRevenue.innerText()).includes("₹2,570.00")) {
    throw new Error("rendered_work_fare_and_cancellation_fee_not_combined_in_period_revenue");
  }
  const lifetimeRevenue = page.locator(".performance-lifetime-grid button").filter({ hasText: "Lifetime revenue" });
  if (!(await lifetimeRevenue.innerText()).includes("₹2,570.00")) {
    throw new Error("rendered_work_fare_missing_from_lifetime_position");
  }
  const eligibleCostsCard = page.getByRole("button", { name: "Explain Eligible period costs", exact: true });
  const eligibleCostText = await eligibleCostsCard.innerText();
  const eligibleCostRupees = Number((eligibleCostText.match(/₹([\\d,]+\\.\\d{2})/)?.[1] ?? "0").replaceAll(",", ""));
  if (eligibleCostRupees < 570) {
    throw new Error("driver_paid_toll_and_parking_not_reflected_in_full_performance_calculation:" + eligibleCostText);
  }
  const targetCard = page.getByRole("button", { name: "Explain selected-period Driver Target", exact: true });
  await targetCard.waitFor();
  const configuredTargetPaise = Number(targetRupees) * 100;
  const selectedTarget = proratedTargetPaise(configuredTargetPaise, businessStartDate, today);
  if (!(await targetCard.innerText()).includes(moneyFromPaise(selectedTarget))) {
    throw new Error("selected_period_target_does_not_match_calendar_day_proration:" + selectedTarget);
  }
  await page.getByRole("button", { name: "Explain Lifetime target position", exact: true }).waitFor();
  await page.getByText("Lifetime eligible costs", { exact: true }).waitFor();
  console.log("Performance period, lifetime breakeven and calendar-day prorated target rendered.");

  await page.getByRole("tab", { name: "Distance history", exact: true }).click();
  const distanceHistory = page.locator(".performance-distance-history");
  await distanceHistory.getByText("Daily distance", { exact: true }).waitFor();
  const distanceSummaryText = await distanceHistory.locator(".performance-recovery-summary").innerText();
  if (!distanceSummaryText.includes("42 km") || !distanceSummaryText.includes("Qualifying active driving days") ||
      !distanceSummaryText.includes("1") || !distanceSummaryText.includes("Complete")) {
    throw new Error("confirmed_distance_summary_or_active_day_average_missing:" + distanceSummaryText);
  }
  const dailyDistance = distanceHistory.locator(".performance-table").filter({
    has: page.locator("caption", { hasText: "Daily distance from confirmed Work allocations" }),
  });
  const weeklyDistance = distanceHistory.locator(".performance-table").filter({
    has: page.locator("caption", { hasText: "Weekly confirmed business distance" }),
  });
  const monthlyDistance = distanceHistory.locator(".performance-table").filter({
    has: page.locator("caption", { hasText: "Monthly confirmed business distance" }),
  });
  for (const table of [dailyDistance, weeklyDistance, monthlyDistance]) {
    const tableText = await table.innerText();
    if (!tableText.includes("42 km")) {
      throw new Error("distance_period_rollup_missing_confirmed_business_km:" + tableText);
    }
  }
  if ((await dailyDistance.innerText()).includes("49 km")) {
    throw new Error("personal_kilometres_were_included_in_business_distance");
  }
  console.log("Daily, weekly and monthly confirmed business distance, active-day averages and personal-km exclusion rendered.");

  await page.getByRole("tab", { name: "Pre-business recovery", exact: true }).click();
  const recovery = page.locator(".performance-recovery");
  await recovery.locator(".performance-recovery-summary").waitFor();
  await recovery.locator("td").filter({ hasText: note }).first().waitFor();
  const summary = await recovery.locator(".performance-recovery-summary").innerText();
  if (!summary.includes(businessStartDate) || !summary.includes(recoveryToExclusive)) {
    throw new Error("recovery_window_does_not_match_exact_18_month_anniversary:" + summary);
  }
  const recoveryDates = await recovery.locator("small.performance-subtext").allTextContents();
  if (recoveryDates.some(date => date > today)) {
    throw new Error("recovery_table_includes_future_dates_outside_selected_period");
  }
  console.log("Pre-business recovery shows its source note, selected-period allocations, and exact 18-month end date.");

  await page.getByRole("tab", { name: "Monthly roll-up", exact: true }).click();
  await page.getByText("Monthly target", { exact: true }).waitFor();
  const monthlyTable = page.locator(".performance-table").filter({ has: page.locator("caption", { hasText: "Monthly revenue, full-cost expense, net and calendar-day-prorated target" }) });
  const monthlyText = await monthlyTable.innerText();
  const monthKeys = [...new Set([businessStartDate.slice(0, 7), today.slice(0, 7)])];
  for (const month of monthKeys) {
    const expected = moneyFromPaise(monthTargetPaise(month, businessStartDate, today, configuredTargetPaise));
    if (!monthlyText.includes(expected)) throw new Error("monthly_rollup_target_does_not_match_calendar_day_proration:" + month + ":" + expected);
  }
  console.log("Monthly roll-up target values reconcile to calendar-day proration for each partial month.");

  await page.getByRole("tab", { name: "Driver Passbook", exact: true }).click();
  const passbookTable = page.locator(".performance-table").filter({
    has: page.locator("thead", { hasText: "Expected cumulative" }),
  });
  await passbookTable.waitFor();
  const passbookText = await passbookTable.innerText();
  if (!passbookText.includes(moneyFromPaise(selectedTarget)) ||
      !passbookText.includes("Remaining") || !passbookText.includes("Source records") ||
      !/\b[1-9]\d* sources?\b/.test(passbookText)) {
    throw new Error("driver_passbook_cumulative_target_or_source_provenance_missing");
  }
  const sourceDetails = passbookTable.locator("tbody details summary").filter({ hasText: /[1-9]/ }).first();
  await sourceDetails.click();
  if (!(await passbookTable.locator("tbody").innerText()).includes("revision")) {
    throw new Error("driver_passbook_daily_source_references_not_exposed");
  }
  await page.getByText(/Expected cumulative surplus/).waitFor();
  await page.getByText(/Actual cumulative surplus/).waitFor();
  console.log("Driver Passbook cumulative target, actual surplus and remaining balance rendered.");

  const provenance = page.locator("#performance-provenance");
  await provenance.locator("summary").first().click();
  await provenance.getByText("performance.calculation.v1", { exact: false }).waitFor().catch(() => {});
  await provenance.getByText("Calculation ID", { exact: false }).waitFor();
  console.log("Performance calculation provenance and completeness disclosure rendered.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
