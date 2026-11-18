import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:4175";
const adminPin = String(Math.floor(1000 + Math.random() * 9000));
const registration = "MH00AA0091";
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4175"], {
  stdio: "ignore",
});
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("fuel_entry_browser_server_did_not_start");
}

async function readBrowserRecords(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const read = db.transaction("records", "readonly").objectStore("records").getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return rows;
  });
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition(_success, error) { error?.({ code: 1, message: "Permission denied" }); } },
    });
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });

  // Create the active Admin identity and Vehicle through the real PWA entry
  // paths so the Fuel journey exercises its actual dependency mapping.
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
  await page.getByLabel("Person name").fill("Fuel Entry Browser Admin");
  await page.getByLabel("Admin role").check();
  await page.getByLabel("Set initial Admin PIN").fill(adminPin);
  await page.getByRole("button", { name: "Enroll person", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled." }).waitFor({ state: "visible" });
  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: "Fuel Entry Browser Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill(adminPin);
  await page.getByRole("button", { name: "Activate role", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Business setup", exact: true }).click();
  await page.getByLabel("Business start date").fill("2024-01-01");
  await page.getByRole("button", { name: /Set business start date|Save changes/, exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Business start date saved." }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Vehicle", exact: true }).click();
  await page.getByRole("button", { name: "Add vehicle", exact: true }).click();
  await page.getByLabel("Registration number").fill(registration);
  await page.getByLabel("Make").fill("Acceptance");
  await page.getByLabel("Model").fill("Fuel Test Vehicle");
  await page.getByLabel("Vehicle type").fill("Car");
  await page.getByLabel("Fuel type").selectOption("CNG");
  await page.getByLabel("Year of manufacture").fill("2024");
  await page.getByRole("button", { name: "Create vehicle", exact: true }).click();
  await page.getByText(registration, { exact: true }).waitFor({ state: "visible" });
  const vehicleRows = await readBrowserRecords(page);
  const vehicles = vehicleRows.filter(row =>
    row.id.startsWith("feature:vehicle:") && row.data?.registrationNumber === registration
  );
  assert.equal(vehicles.length, 1, "Vehicle must be committed through the Admin UI");
  const vehicleId = vehicles[0].id;

  // Fuel is available on Drive without starting a shift.
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  const toggle = page.locator(".fuel-entry-toggle");
  await toggle.waitFor({ state: "visible" });
  await toggle.click();
  const panel = page.locator(".fuel-entry-panel");
  await panel.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  assert.equal(await panel.getByLabel("Partial refill").isChecked(), false, "full tank is the default");
  await panel.getByLabel("Vehicle").selectOption(vehicleId);
  await panel.getByLabel("Odometer (km)").fill("12345");
  await panel.getByLabel("Price per kg (₹)").fill("82.50");
  await panel.getByLabel("Amount paid (₹)").fill("825");
  await panel.getByLabel("Partial refill").check();
  assert.match(await panel.locator(".fuel-derived-preview").textContent(), /10\\.000 kg/);

  await page.waitForFunction(async expectedVehicleId => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const read = db.transaction("records", "readonly").objectStore("records").getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return rows.some(row =>
      row.id.startsWith("__sam_travels_form_working_copy__:work.fuel-entry:") &&
      row.data?.values?.vehicleId === expectedVehicleId &&
      row.data?.values?.odometerKm === 12345 &&
      row.data?.values?.priceRupeesPerKg === 82.5 &&
      row.data?.values?.amountRupees === 825 &&
      row.data?.values?.partialRefill === true
    );
  }, vehicleId);

  await toggle.click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  await page.locator(".fuel-entry-toggle").click();
  const resumed = page.locator(".fuel-entry-panel");
  await resumed.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  assert.equal(await resumed.getByLabel("Vehicle").inputValue(), vehicleId);
  assert.equal(await resumed.getByLabel("Odometer (km)").inputValue(), "12345");
  assert.equal(await resumed.getByLabel("Price per kg (₹)").inputValue(), "82.5");
  assert.equal(await resumed.getByLabel("Amount paid (₹)").inputValue(), "825");
  assert.equal(await resumed.getByLabel("Partial refill").isChecked(), true);

  await context.setOffline(true);
  await resumed.getByRole("button", { name: "Submit fuel purchase", exact: true }).click();
  await resumed.getByRole("status").filter({ hasText: "Fuel purchase saved." }).waitFor({ state: "visible" });

  const readback = await readBrowserRecords(page);
  const purchases = readback.filter(row =>
    row.id.startsWith("feature:business-expenses:fuel:") &&
    row.data?.vehicleId === vehicleId &&
    row.data?.odometerKm === 12345
  );
  const evidence = readback.filter(row =>
    row.id.startsWith("timeline-enrichment:fuel:") &&
    row.data?.eventId?.startsWith("fuel:feature:business-expenses:fuel:") &&
    row.data?.captureStatus === "permission_denied"
  );
  assert.equal(purchases.length, 1, "exactly one Fuel purchase must be committed");
  assert.equal(purchases[0].data.pricePaisePerKg, 8250);
  assert.equal(purchases[0].data.amountPaise, 82500);
  assert.equal(purchases[0].data.partialRefill, true);
  assert.equal(typeof purchases[0].data.occurredAt, "string");
  assert.equal(typeof purchases[0].data.businessDate, "string");
  assert.equal(evidence.length, 1, "GPS denial must be retained as separate evidence");
  assert.equal(evidence[0].data.captureStatus, "permission_denied");
  assert.equal(evidence[0].data.captureReason, "permission_denied");
  await context.setOffline(false);

  console.log("Fuel Entry acceptance passed: real Admin-created Vehicle, partial draft visibly resumed after reload, offline purchase committed once, derived quantity preview and GPS denial evidence verified.");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
