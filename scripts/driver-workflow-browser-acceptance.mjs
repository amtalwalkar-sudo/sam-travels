import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:4175";
const adminPin = String(Math.floor(1000 + Math.random() * 9000));
const registration = "MH00AA0092";
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
      value: { getCurrentPosition(success) {
        const calls = Number(localStorage.getItem("__workflow_geo_calls") || "0") + 1;
        localStorage.setItem("__workflow_geo_calls", String(calls));
        success({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 8 }, timestamp: Date.now() });
      } },
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
  const driverName = "Workflow Browser Driver";
  await page.getByRole("button", { name: "Driver", exact: true }).click();
  await page.getByRole("button", { name: "Add driver", exact: true }).click();
  await page.getByLabel("Driver name").fill(driverName);
  await page.getByLabel("Driving licence number").fill("ACCEPTANCE-FUEL-LIC-1");
  await page.getByLabel("Mobile number").fill("9990001122");
  await page.getByRole("button", { name: "Save driver", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Driver created." }).waitFor({ state: "visible" });
  const driverCard = page.locator(".admin-capability-record").filter({ hasText: driverName });
  await driverCard.getByRole("button", { name: "Configure for Work", exact: true }).click();
  await page.getByRole("status").filter({ hasText: driverName + " is configured with " + registration + " for Work." }).waitFor({ state: "visible" });
  const configuredPair = await readBrowserRecords(page);
  const selectedWorkDriver = configuredPair.find(row => row.id === "work:selected-driver");
  assert.equal(selectedWorkDriver?.data?.driverId, configuredPair.find(row => row.id.startsWith("feature:driver-records:driver:") && row.data?.name === driverName)?.data?.driverId,
    "Admin must persist the canonical Work Driver selection");
  const assignmentHistory = configuredPair.find(row => row.id.startsWith("feature:driver-records:assignment:") && row.id.endsWith(selectedWorkDriver?.data?.driverId ?? ""));
  assert.ok(assignmentHistory, "Admin must persist the Driver assignment history");
  const currentAssignments = assignmentHistory.data?.assignments?.filter(item => !item.unassignedAt) ?? [];
  assert.equal(currentAssignments.length, 1, "the configured Driver must have one current assignment");
  assert.equal(currentAssignments[0].vehicleId, vehicleId, "the configured Driver must be paired with the sole active Vehicle");
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
  await page.getByLabel("Shift-start odometer (km)").fill("12345");
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  await page.getByRole("heading", { name: "Shift Active", exact: true }).waitFor({ state: "visible", timeout: 30000 });

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
  assert.equal(persistedState?.state, "shift_active", "rendered PWA Start shift must commit the authoritative state");
  assert.equal(persistedState?.revision, 1, "first committed UI transition must advance the workflow revision once");
  const committedRows = await readBrowserRecords(page);
  const committedEvents = committedRows.filter(row => row.id.startsWith("logbook:"));
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__workflow_geo_calls") || "0")), 1,
    "the UI transition must request its own event-scoped GPS evidence exactly once");

  console.log("Rendered Work acceptance passed: Admin-created Driver/Vehicle, real Drive-screen Start shift action, GPS evidence, and revision-1 authoritative Dexie state verified.");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
