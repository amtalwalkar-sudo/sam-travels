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
      value: { getCurrentPosition(success, error) { const calls = Number(localStorage.getItem("__fuel_geo_calls") || "0") + 1; localStorage.setItem("__fuel_geo_calls", String(calls)); if (calls === 1) setTimeout(() => success?.({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 12.5 }, timestamp: Date.now() }), 1000); else setTimeout(() => error?.({ code: 1, message: "Permission denied" }), 5000); } },
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
  assert.equal(vehicles[0].createdBy?.role, "admin", "Admin actor attribution must be persisted on the Vehicle record");
  assert.equal(typeof vehicles[0].createdBy?.personId, "string");
  const vehicleId = vehicles[0].id;

  // Create a real Driver profile, then link its person identity before
  // activating Driver authority for the Fuel submission.
  const driverName = "Fuel Entry Browser Driver";
  await page.getByRole("button", { name: "Driver", exact: true }).click();
  await page.getByRole("button", { name: "Add driver", exact: true }).click();
  await page.getByLabel("Driver name").fill(driverName);
  await page.getByLabel("Driving licence number").fill("ACCEPTANCE-FUEL-LIC-1");
  await page.getByLabel("Mobile number").fill("9990001122");
  await page.getByRole("button", { name: "Save driver", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Driver created." }).waitFor({ state: "visible" });
  const driverCard = page.locator(".admin-capability-record").filter({ hasText: driverName });
  await driverCard.getByRole("button", { name: "Select for Work", exact: true }).click();
  await page.getByRole("status").filter({ hasText: driverName + " selected for Work." }).waitFor({ state: "visible" });
  await page.getByLabel("Vehicle for " + driverName).selectOption(vehicleId);
  await driverCard.getByRole("button", { name: "Assign / reassign", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Vehicle assignment saved." }).waitFor({ state: "visible" });

  // Switch from the Admin setup actor to a real Driver identity before Fuel
  // capture, so the purchase envelope records the driver who submits it.
  await page.getByLabel("Person name").fill(driverName);
  await page.getByLabel("Driver role").check();
  await page.getByRole("button", { name: "Enroll person", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled." }).waitFor({ state: "visible" });
  await page.getByLabel("Link " + driverName + " to person").selectOption({ label: driverName });
  await page.getByRole("status").filter({ hasText: "Driver profile link saved." }).waitFor({ state: "visible" });
  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: driverName });
  await page.getByLabel("Active role").selectOption("driver");
  await page.getByRole("button", { name: "Activate role", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor({ state: "visible" });

  const initialShiftState = await page.evaluate(async () => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise((resolve, reject) => {
      const read = db.transaction("driverState", "readonly").objectStore("driverState").get("driver-state");
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return row?.value?.state ?? "idle";
  });
  assert.equal(initialShiftState, "idle", "the Fuel entry test starts with no active shift");

  // Fuel is available on Drive without starting a shift.
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  const toggle = page.locator(".fuel-entry-toggle");
  await toggle.waitFor({ state: "visible" });
  await toggle.click();
  const panel = page.locator(".fuel-entry-panel");
  await panel.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0")), 0, "opening the form must not request GPS");
  assert.equal(await panel.getByLabel("Partial refill").isChecked(), false, "full tank is the default");
  await panel.getByLabel("Vehicle").selectOption(vehicleId);
  await panel.getByLabel("Odometer (km)").fill("12345");
  await panel.getByLabel("Price per kg (₹)").fill("82.50");
  await panel.getByLabel("Amount paid (₹)").fill("825");
  assert.match(await panel.locator(".fuel-derived-preview").textContent(), /10\.000 kg/);

  // First commit the default full-tank purchase through the rendered form.
  await panel.getByRole("button", { name: "Submit fuel purchase", exact: true }).click();
  await page.waitForFunction(() => {
    const panel = document.querySelector(".fuel-entry-panel");
    const status = panel?.querySelector('[role="status"]');
    return Boolean(status?.textContent?.trim());
  }, undefined, { timeout: 30000 });
  const firstSubmitStatus = (await panel.getByRole("status").textContent())?.trim() ?? "";
  assert.equal(firstSubmitStatus, "Fuel purchase saved.", "production Fuel submit failed: " + firstSubmitStatus);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0")), 1, "one GPS request is made for the first Submit");
  let committedRows = await readBrowserRecords(page);
  let purchases = committedRows.filter(row =>
    row.id.startsWith("feature:business-expenses:fuel:") && row.data?.vehicleId === vehicleId
  );
  assert.equal(purchases.length, 1, "the default full-tank purchase must commit once");
  assert.equal(purchases[0].data.odometerKm, 12345);
  assert.equal(purchases[0].data.partialRefill, false);
  assert.equal(purchases[0].createdBy?.role, "driver", "Fuel purchase must retain the active Driver actor");
  assert.notEqual(purchases[0].createdBy?.personId, vehicles[0].createdBy.personId);
  await context.setOffline(false);

  // The successful submit starts a new draft. Exercise partial refill,
  // durable draft recovery after reload, then submit that second purchase offline.
  await panel.getByLabel("Vehicle").selectOption(vehicleId);
  await panel.getByLabel("Odometer (km)").fill("12346");
  await panel.getByLabel("Price per kg (₹)").fill("82.50");
  await panel.getByLabel("Amount paid (₹)").fill("825");
  await panel.getByLabel("Partial refill").check();
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
      row.data?.values?.odometerKm === 12346 &&
      row.data?.values?.priceRupeesPerKg === 82.5 &&
      row.data?.values?.amountRupees === 825 &&
      row.data?.values?.partialRefill === true
    );
  }, vehicleId);

  await toggle.click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  await page.locator(".fuel-entry-toggle").waitFor({ state: "visible" });
  await page.locator(".fuel-entry-toggle").click();
  const resumed = page.locator(".fuel-entry-panel");
  await resumed.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  // The panel heading renders before its asynchronous IndexedDB draft
  // recovery finishes. Wait for the restored values rather than asserting
  // against the initial blank form during that legitimate loading interval.
  await page.waitForFunction(expected => {
    const panel = document.querySelector(".fuel-entry-panel");
    const fields = [...(panel?.querySelectorAll("select, input") ?? [])];
    const vehicle = fields.find(field => field.tagName === "SELECT" && field.closest("label")?.textContent?.includes("Vehicle"));
    const odometer = fields.find(field => field.type === "number" && field.closest("label")?.textContent?.includes("Odometer"));
    const price = fields.find(field => field.type === "number" && field.closest("label")?.textContent?.includes("Price per kg"));
    const amount = fields.find(field => field.type === "number" && field.closest("label")?.textContent?.includes("Amount paid"));
    const partial = fields.find(field => field.type === "checkbox");
    return vehicle?.value === expected.vehicleId &&
      odometer?.value === "12346" && price?.value === "82.5" &&
      amount?.value === "825" && partial?.checked === true;
  }, { vehicleId });
  assert.equal(await resumed.getByLabel("Vehicle").inputValue(), vehicleId);
  assert.equal(await resumed.getByLabel("Odometer (km)").inputValue(), "12346");
  assert.equal(await resumed.getByLabel("Price per kg (₹)").inputValue(), "82.5");
  assert.equal(await resumed.getByLabel("Amount paid (₹)").inputValue(), "825");
  assert.equal(await resumed.getByLabel("Partial refill").isChecked(), true);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0")), 1, "draft resume must not request GPS again");

  await context.setOffline(true);
  await resumed.getByRole("button", { name: "Submit fuel purchase", exact: true }).click();
  await page.waitForFunction(() => {
    const panel = document.querySelector(".fuel-entry-panel");
    const status = panel?.querySelector('[role="status"]');
    return Boolean(status?.textContent?.trim());
  }, undefined, { timeout: 30000 });
  const secondSubmitStatus = (await resumed.getByRole("status").textContent())?.trim() ?? "";
  assert.equal(secondSubmitStatus, "Fuel purchase saved.", "second production Fuel submit failed: " + secondSubmitStatus);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0")), 2, "one additional GPS request is made for the second Submit");
  const committedBeforeEnrichment = await readBrowserRecords(page);
  purchases = committedBeforeEnrichment.filter(row =>
    row.id.startsWith("feature:business-expenses:fuel:") && row.data?.vehicleId === vehicleId
  );
  assert.equal(purchases.length, 2, "both full and partial purchases must commit before optional GPS enrichment completes");
  const evidenceBeforeCompletion = committedBeforeEnrichment.filter(row =>
    row.id.startsWith("timeline-enrichment:fuel:") &&
    row.data?.eventId?.startsWith("fuel:feature:business-expenses:fuel:")
  );
  assert(evidenceBeforeCompletion.length < 2, "the latest GPS callback must still be pending when the purchase save completes");
  await page.waitForFunction(async () => {
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
    return rows.filter(row =>
      row.id.startsWith("timeline-enrichment:fuel:") &&
      row.data?.eventId?.startsWith("fuel:feature:business-expenses:fuel:")
    ).length === 2;
  }, undefined, { timeout: 10000 });
  const readback = await readBrowserRecords(page);
  purchases = readback.filter(row =>
    row.id.startsWith("feature:business-expenses:fuel:") && row.data?.vehicleId === vehicleId
  ).sort((a, b) => a.data.odometerKm - b.data.odometerKm);
  const evidence = readback.filter(row =>
    row.id.startsWith("timeline-enrichment:fuel:") &&
    row.data?.eventId?.startsWith("fuel:feature:business-expenses:fuel:")
  );
  assert.equal(purchases.length, 2);
  assert.equal(purchases[0].data.odometerKm, 12345);
  assert.equal(purchases[0].data.partialRefill, false);
  assert.equal(purchases[1].data.odometerKm, 12346);
  assert.equal(purchases[1].data.partialRefill, true);
  for (const purchase of purchases) {
    assert.equal(purchase.data.pricePaisePerKg, 8250);
    assert.equal(purchase.data.amountPaise, 82500);
    assert.equal(typeof purchase.data.occurredAt, "string");
    assert.equal(typeof purchase.data.businessDate, "string");
  }
  assert.equal(evidence.length, 2, "each Fuel purchase must retain its separate GPS outcome");
  const capturedEvidence = evidence.find(row => row.data.captureStatus === "captured");
  const deniedEvidence = evidence.find(row => row.data.captureStatus === "permission_denied");
  assert(capturedEvidence, "a successful GPS fix must be stored");
  assert.equal(capturedEvidence.data.latitude, 19.076);
  assert.equal(capturedEvidence.data.longitude, 72.8777);
  assert.equal(capturedEvidence.data.accuracyMeters, 12.5);
  assert.equal(typeof capturedEvidence.data.fixAt, "string");
  assert.equal(capturedEvidence.data.gpsProvider, "device");
  assert.equal(capturedEvidence.data.captureTiming, "late");
  assert.equal(capturedEvidence.data.eventId, "fuel:" + purchases[0].id);
  assert(deniedEvidence, "permission denial must be stored as separate evidence");
  assert.equal(deniedEvidence.data.eventId, "fuel:" + purchases[1].id);
  assert.equal(deniedEvidence.data.captureReason, "permission_denied");
  await context.setOffline(false);

  console.log("Fuel Entry acceptance passed: real Admin-created Vehicle, partial draft visibly resumed after reload, offline purchase committed once, derived quantity preview and GPS denial evidence verified.");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
