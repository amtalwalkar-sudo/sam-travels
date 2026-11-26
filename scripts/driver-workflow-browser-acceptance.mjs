import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { exerciseWorkTripEntryPaths } from "./admin-entry-path-audit.mjs";

const baseUrl = "http://127.0.0.1:4175";
const adminPin = String(Math.floor(1000 + Math.random() * 9000));
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
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("driver_workflow_browser_server_did_not_start");
}

async function readBrowserRecords(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readonly");
      const read = transaction.objectStore("records").getAll();
      let result;
      read.onsuccess = () => { result = read.result; };
      read.onerror = () => reject(read.error);
      transaction.oncomplete = () => resolve(result ?? []);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("browser_records_read_aborted"));
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
  page.on("pageerror", error => console.error("BROWSER PAGE ERROR", error.stack ?? error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          const calls = Number(localStorage.getItem("__workflow_geo_calls") || "0") + 1;
          localStorage.setItem("__workflow_geo_calls", String(calls));
          success({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 8 }, timestamp: Date.now() });
        },
        watchPosition(success) {
          const calls = Number(localStorage.getItem("__workflow_geo_calls") || "0") + 1;
          localStorage.setItem("__workflow_geo_calls", String(calls));
          success({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 8 }, timestamp: Date.now() });
          return 1;
        },
        clearWatch() {},
      },
    });
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
  await page.getByLabel("Person name").fill("Workflow Browser Admin");
  await page.getByLabel("Admin role").check();
  await page.getByLabel("Set initial Admin PIN").fill(adminPin);
  await page.getByRole("button", { name: "Enroll person", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled." }).waitFor({ state: "visible" });
  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: "Workflow Browser Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill(adminPin);
  await page.getByRole("button", { name: "Activate role", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Business setup", exact: true }).click();
  await page.getByLabel("Business start date").fill("2024-01-01");
  await page.getByRole("button", { name: /Set business start date|Save changes/, exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Business start date saved." }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Vehicle", exact: true }).click();
  const vehicleRows = await readBrowserRecords(page);
  const vehicles = vehicleRows.filter(row =>
    row.id.startsWith("feature:vehicle:") && row.data?.lifecycleState === "active"
  );
  assert.equal(vehicles.length, 1, "Work acceptance must use the single imported active vehicle");
  const vehicle = vehicles[0];
  const vehicleId = vehicle.id;
  const registration = vehicle.data.registrationNumber;
  assert.equal(typeof registration, "string");
  assert.ok(registration.length > 0);
  await page.getByText(registration, { exact: true }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Driver", exact: true }).click();
  const driverRows = await readBrowserRecords(page);
  const drivers = driverRows.filter(row =>
    row.id.startsWith("feature:driver-records:driver:") && row.data?.lifecycleState === "active"
  );
  assert.equal(drivers.length, 1, "Work acceptance must use the single imported active driver");
  const driver = drivers[0];
  const driverName = driver.data.name;
  const driverCard = page.locator(".admin-capability-record").filter({ hasText: driverName });
  await driverCard.waitFor({ state: "visible" });
  const configure = driverCard.getByRole("button", { name: "Configure for Work", exact: true });
  if (await configure.count()) await configure.click();
  else await driverCard.getByRole("button", { name: "Verify operating configuration", exact: true }).click();
  await page.getByRole("status").filter({
    hasText: driverName + " is configured with " + registration + " for Work.",
  }).waitFor({ state: "visible" });
  const configuredPair = await readBrowserRecords(page);
  const selectedWorkDriver = configuredPair.find(row => row.id === "work:selected-driver");
  assert.equal(selectedWorkDriver?.data?.driverId, driver.data.driverId,
    "Admin must persist the canonical Work Driver selection");
  const assignmentHistory = configuredPair.find(row =>
    row.id.startsWith("feature:driver-records:assignment:") && row.id.endsWith(driver.data.driverId)
  );
  assert.ok(assignmentHistory, "Admin must persist the Driver assignment history");
  const currentAssignments = assignmentHistory.data?.assignments?.filter(item => !item.unassignedAt) ?? [];
  assert.equal(currentAssignments.length, 1, "the configured Driver must have one current assignment");
  assert.equal(currentAssignments[0].vehicleId, vehicleId, "the configured Driver must be paired with the sole active Vehicle");

  const configuredDriver = configuredPair.find(row =>
    row.id.startsWith("feature:driver-records:driver:") && row.data?.name === driverName
  );
  assert.ok(configuredDriver, "The historical trip must use the saved Driver identity");
  const backfillReference = "workflow-missing-trip-" + Date.now();
  const backfillPanel = page.getByRole("region", { name: "Historical trip backfill" });
  await backfillPanel.getByRole("button", { name: "Add missing historical trip", exact: true }).click();
  await backfillPanel.locator("select").first().selectOption(configuredDriver.data.driverId);
  await backfillPanel.getByLabel("Vehicle").selectOption(vehicleId);
  await backfillPanel.getByLabel("Trip started (India time)").fill("2026-11-10T08:00");
  await backfillPanel.getByLabel("Trip ended (India time)").fill("2026-11-10T08:30");
  await backfillPanel.getByLabel("Fare (₹)").fill("250");
  await backfillPanel.getByLabel("Toll (₹, optional)").fill("10");
  await backfillPanel.getByLabel("Toll paid by").selectOption("driver");
  await backfillPanel.getByLabel("Parking (₹, optional)").fill("5");
  await backfillPanel.getByLabel("Parking paid by").selectOption("customer");
  await backfillPanel.getByLabel("Backfill reference (optional)").fill(backfillReference);
  await backfillPanel.getByLabel("Reason / source of historical information").fill("Reconciled from the paper trip sheet");
  await backfillPanel.getByRole("button", { name: "Save historical trip", exact: true }).click();
  await backfillPanel.getByRole("status").filter({ hasText: "Historical trip recorded as an Admin-declared entry" }).waitFor({ state: "visible" });
  const afterBackfill = await readBrowserRecords(page);
  const backfillRecord = afterBackfill.find(row => row.id === "historical-trip-backfill:" + backfillReference);
  assert.ok(backfillRecord, "Missing trip must be persisted through the Admin PWA entry path");
  assert.equal(backfillRecord.data.farePaise, 25000);
  assert.equal(backfillRecord.data.tollPaise, 1000);
  assert.equal(backfillRecord.data.tollPayer, "driver");
  assert.equal(backfillRecord.data.parkingPaise, 500);
  assert.equal(backfillRecord.data.parkingPayer, "customer");
  for (const key of ["eventId", "startEventId", "endEventId", "gps", "startGps", "endGps", "odometerKm", "tripContext"]) {
    assert.equal(backfillRecord.data[key], undefined, "Admin backfill must not fabricate Work/GPS/odometer evidence: " + key);
  }

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


  await page.getByRole("button", { name: "Drive", exact: true }).click();
  await page.locator(".driver-card").waitFor({ state: "visible", timeout: 15000 });
  const tripHistory = page.getByRole("region", { name: "Trip history" });
  const insertedTrip = tripHistory.locator(".trip-history-item").filter({ hasText: backfillReference });
  await insertedTrip.getByText("TOLL · DRIVER", { exact: true }).waitFor({ state: "visible" });
  await insertedTrip.getByText("PARKING · CUSTOMER", { exact: true }).waitFor({ state: "visible" });
  await exerciseWorkTripEntryPaths(page, { adminName: "Workflow Browser Admin", adminPin });

  const persistedState = await page.evaluate(async () => {
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
    return row?.value ?? null;
  });
  assert.equal(persistedState?.state, "idle", "the complete rendered Work journey must finish with no active shift");
  assert.equal(persistedState?.revision, 7, "six event types plus the second trip creation must commit exactly seven transitions");
  const committedRows = await readBrowserRecords(page);
  const committedEvents = committedRows.filter(row => row.id.startsWith("logbook:"));
  assert.equal(committedEvents.length, 7, "the rendered journey must commit all seven Work events");
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__workflow_geo_calls") || "0")), 7,
    "each Work transition must acquire fresh event-scoped GPS evidence");

  console.log("Rendered Work acceptance passed: full shift/trip/fare/cancellation journey, Admin fare correction, immutable Work/GPS events, actor provenance and seven independent GPS acquisitions verified.");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
