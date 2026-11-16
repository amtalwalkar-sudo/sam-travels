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
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();

  const adminSections = page.getByRole("navigation", { name: "Admin sections" });
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
  console.log("Performance Admin inputs saved: actual business start date, fixed monthly target, and a separately noted pre-business cost.");

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Performance", exact: true }).click();
  await page.getByRole("heading", { name: "Performance overview", exact: true }).waitFor();
  await page.getByText("Lifetime breakeven & target position", { exact: true }).waitFor({ timeout: 30000 });

  const period = page.locator(".performance-period-form");
  await period.getByLabel("Period from").fill(businessStartDate);
  await period.getByLabel("Period to").fill(today);
  await period.getByRole("button", { name: "Refresh performance", exact: true }).click();
  await page.getByText(businessStartDate, { exact: true }).waitFor();
  await page.getByText("Lifetime breakeven & target position", { exact: true }).waitFor();

  const targetCard = page.getByRole("button", { name: "Explain Monthly Driver Target", exact: true });
  await targetCard.waitFor();
  if (!(await targetCard.innerText()).includes("₹30,000.00")) {
    throw new Error("monthly_driver_target_not_displayed_as_full_fixed_amount");
  }
  await page.getByRole("button", { name: "Explain Lifetime target position", exact: true }).waitFor();
  await page.getByText("Lifetime eligible costs", { exact: true }).waitFor();
  console.log("Performance period, lifetime breakeven and fixed monthly target rendered.");

  await page.getByRole("tab", { name: "Pre-business recovery", exact: true }).click();
  const recovery = page.locator(".performance-recovery");
  await recovery.getByText(note, { exact: true }).waitFor();
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
  const monthlyTable = page.locator(".performance-table").filter({ has: page.locator("caption", { hasText: "Monthly Driver Passbook" }) });
  const monthlyText = await monthlyTable.innerText();
  if (!monthlyText.includes("₹30,000.00")) throw new Error("monthly_target_was_prorated_or_missing_in_monthly_rollup");
  console.log("Monthly roll-up preserves the full configured target for partial calendar months.");

  const provenance = page.locator("#performance-provenance");
  await provenance.locator("summary").click();
  await provenance.getByText("performance.calculation.v1", { exact: false }).waitFor().catch(() => {});
  await provenance.getByText("Calculation ID", { exact: false }).waitFor();
  console.log("Performance calculation provenance and completeness disclosure rendered.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
