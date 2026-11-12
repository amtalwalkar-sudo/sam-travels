import { chromium } from "playwright";
import { spawn } from "node:child_process";

const url = "http://127.0.0.1:4173";
const vehicleId = "feature:vehicle:MH01AB1234";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { detached: true, stdio: "ignore" });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("vite_server_not_ready");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });
  const dates = await page.evaluate(async vehicleId => {
    const parts = new Intl.DateTimeFormat("en-CA", { timezone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = type => parts.find(x => x.type === type)?.value ?? "";
    const base = new Date(Date.UTC(+part("year"), +part("month") - 1, +part("day")));
    const date = offset => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const now = new Date().toISOString();
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open("sam-travels-browser"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const row = { id: vehicleId, schemaVersion: 1, createdAt: now, updatedAt: now, source: "web", revision: 1,
      data: { schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata", model: "Ace", vehicleType: "LCV", fuelType: "Diesel", yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active" } };
    await new Promise((resolve, reject) => { const tx = db.transaction("records", "readwrite"); tx.objectStore("records").put(row); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    return { today: date(0), visitDate: date(-3), nextDate: date(-1) };
  }, vehicleId);

  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByLabel("Person name").fill("Maintenance Acceptance Admin");
  await page.getByLabel("Admin role").check();
  await page.getByLabel("Set initial Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Enroll person" }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled" }).waitFor();
  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: "Maintenance Acceptance Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Activate role" }).click();
  await page.getByRole("status").filter({ hasText: "Role activated" }).waitFor();

  const section = page.locator(".admin-section").filter({ hasText: "Maintenance" });
  await section.locator(".admin-section-trigger").click();
  const panel = section.locator(".admin-capability-panel");
  await panel.locator(".admin-vehicle-context select").first().selectOption(vehicleId);
  await panel.getByRole("button", { name: "Start service visit" }).click();
  await panel.getByLabel("Maintenance type").fill("Scheduled service");
  await panel.getByLabel("Date").fill(dates.visitDate);
  await panel.getByLabel("Odometer km (optional)").fill("45000");
  await panel.getByLabel("Next service date (optional)").fill(dates.nextDate);
  await panel.getByLabel("Next service at km (optional)").fill("50000");
  await panel.getByLabel("Description").fill("Oil and filter replacement");
  await panel.getByLabel("Item 1").fill("Engine oil");
  await panel.getByLabel("Amount (₹)").fill("2000");
  await panel.getByRole("button", { name: "Add cost item" }).click();
  await panel.getByLabel("Item 2").fill("Oil filter");
  await panel.getByLabel("Amount (₹)").nth(1).fill("500");
  await panel.getByRole("button", { name: "Save maintenance record" }).click();
  await panel.getByRole("status").filter({ hasText: "Service visit saved." }).waitFor();

  await panel.locator(".admin-vehicle-context select").nth(1).selectOption("expense");
  await panel.getByRole("button", { name: "Start general expense" }).click();
  await panel.getByLabel("Expense name").fill("Roadside repair");
  await panel.getByLabel("Date").fill(dates.today);
  await panel.getByLabel("Odometer km (optional)").fill("50200");
  await panel.getByLabel("Amount (₹)").fill("1200");
  await panel.getByLabel("Description").fill("Emergency puncture repair");
  await panel.getByRole("button", { name: "Save maintenance record" }).click();
  await panel.getByRole("status").filter({ hasText: "Maintenance expense saved." }).waitFor();

  await panel.getByRole("button", { name: "Change per-kilometre rate" }).click();
  await panel.getByLabel("New rate (₹ per km)").fill("3.00");
  await panel.getByRole("button", { name: "Save rate" }).click();
  await panel.getByRole("status").filter({ hasText: "Per-kilometre rate saved with effective-date history." }).waitFor();
  await panel.getByText("₹3.00 / km from " + dates.today + " · Admin entered", { exact: true }).waitFor();
  await panel.getByText("Scheduled service · Date due " + dates.nextDate + " · Kilometre threshold reached (50200 km)", { exact: true }).waitFor();
  const total = await panel.locator(".loan-metrics > div").nth(0).locator("strong").textContent();
  if (!total?.includes("3,700")) throw new Error("maintenance_total_invalid:" + total);
  console.log("PASS: Maintenance PWA visit, item totals, general expense, effective-dated rate, odometer reminder and aggregate actual costs.");
} finally {
  if (browser) await browser.close();
}
