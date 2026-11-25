import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { assertBrowserFuelPerformanceAndBackupJourney, assertBrowserWorkDistanceThroughUi } from "./stage3-browser-golden-journey.mjs";
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
  await page.clock.install({ time: new Date(Date.now() - 86_400_000) });
  page.on("pageerror", error => console.error("BROWSER PAGE ERROR", error.stack ?? error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          const calls = Number(localStorage.getItem("__fuel_geo_calls") || "0") + 1;
          localStorage.setItem("__fuel_geo_calls", String(calls));
          if (window.__fuel_allow_work_gps) success({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 8 }, timestamp: Date.now() });
        },
        watchPosition(success) {
          const calls = Number(localStorage.getItem("__fuel_geo_calls") || "0") + 1;
          localStorage.setItem("__fuel_geo_calls", String(calls));
          if (window.__fuel_allow_work_gps) success({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 8 }, timestamp: Date.now() });
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
  const driverName = "Fuel Entry Browser Driver";
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
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  const toggle = page.locator(".fuel-entry-toggle");
  await toggle.waitFor({ state: "visible" });
  const fuelGeoCallsBefore = await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0"));
  await toggle.waitFor({ state: "visible" });
  await toggle.click();
  const panel = page.locator(".fuel-entry-panel");
  await panel.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  await panel.getByText(/^Draft · /).waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await panel.getByLabel("Partial refill").isChecked(), false, "full tank is the default");
  await panel.getByLabel("Odometer (km)").fill("12345");
  await panel.getByLabel("Price per kg (₹)").fill("82.50");
  await panel.getByLabel("Amount paid (₹)").fill("825");
   assert.match(await panel.locator(".fuel-derived-preview").textContent(), /10\.000 kg/);
  const firstFormState = await panel.locator("form").evaluate(form => ({
    valid: form.checkValidity(),
    invalid: [...form.querySelectorAll(":invalid")].map(control => ({
      label: control.closest("label")?.textContent?.trim(),
      value: control.value,
      validationMessage: control.validationMessage,
    })),
  }));
  assert.equal(firstFormState.valid, true, "Fuel form must be valid before submit: " + JSON.stringify(firstFormState));
  await page.waitForFunction(async expected => {
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
    return rows.some(row => row.id.startsWith("__sam_travels_form_working_copy__:work.fuel-entry:") &&
      row.data?.values?.vehicleId === expected.vehicleId &&
      row.data?.values?.odometerKm === 12345 &&
      row.data?.values?.priceRupeesPerKg === 82.5 &&
      row.data?.values?.amountRupees === 825);
  }, { vehicleId }, { timeout: 10000 });
  const fuelGeoCallsBeforeFirstSubmit = await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0"));
  let firstSubmitEvent = false;
  await panel.locator("form").evaluate(form => form.addEventListener("submit", () => {
    window.__fuelFirstSubmitObserved = true;
  }, { once: true }));
  await panel.getByRole("button", { name: "Submit fuel purchase", exact: true }).click();
  await page.waitForFunction(() => {
    const panel = document.querySelector(".fuel-entry-panel");
    const status = panel?.querySelector('[role="status"]');
    return Boolean(status?.textContent?.trim()) || window.__fuelFirstSubmitObserved === true;
  }, undefined, { timeout: 30000 });
  firstSubmitEvent = await page.evaluate(() => window.__fuelFirstSubmitObserved === true);
  assert.equal(firstSubmitEvent, true, "Fuel submit button must dispatch the form submit event");
  const firstSubmitStatus = (await panel.getByText("Fuel purchase saved.", { exact: true }).textContent())?.trim() ?? "";
  assert.equal(firstSubmitStatus, "Fuel purchase saved.", "production Fuel submit failed: " + firstSubmitStatus);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0")), fuelGeoCallsBeforeFirstSubmit,
    "Fuel submission must not request geolocation");
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
  await page.clock.fastForward("00:01");
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
  const firstFuelPurchaseId = purchases[0].id;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });
  const reloadedPurchase = await page.evaluate(async id => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise((resolve, reject) => {
      const read = db.transaction("records", "readonly").objectStore("records").get(id);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return row;
  }, firstFuelPurchaseId);
  assert(reloadedPurchase, "authoritative Fuel purchase must still exist in IndexedDB after a fresh page load");
  assert.equal(reloadedPurchase.data.vehicleId, vehicleId);
  assert.equal(reloadedPurchase.data.odometerKm, 12345);
  assert.equal(reloadedPurchase.data.pricePaisePerKg, 8250);
  assert.equal(reloadedPurchase.data.amountPaise, 82500);
  assert.equal(reloadedPurchase.data.partialRefill, false);
  assert.equal(typeof reloadedPurchase.data.occurredAt, "string");
  assert.equal(typeof reloadedPurchase.data.businessDate, "string");
  assert.equal(Object.hasOwn(reloadedPurchase.data, "locationEvidence"), false,
    "new Fuel purchases do not capture or persist GPS evidence");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: driverName });
  await page.getByLabel("Active role").selectOption("driver");
  await page.getByRole("button", { name: "Activate role", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  await page.locator(".fuel-entry-toggle").waitFor({ state: "visible" });
  await page.locator(".fuel-entry-toggle").click();
  const resumed = page.locator(".fuel-entry-panel");
  await resumed.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  try {
    await page.waitForFunction(expected => {
      const panel = document.querySelector(".fuel-entry-panel");
      const labels = [...(panel?.querySelectorAll("label") ?? [])];
      const control = name => labels.find(label => label.textContent?.trim().startsWith(name))?.querySelector("input, select");
      const odometer = control("Odometer (km)");
      const price = control("Price per kg");
      const amount = control("Amount paid");
      const partial = control("Partial refill");
      return odometer?.value === "12346" && price?.value === "82.5" &&
        amount?.value === "825" && partial?.checked === true;
    }, { vehicleId }, { timeout: 15000 });
  } catch (error) {
    const diagnostic = await page.evaluate(async () => {
      const panel = document.querySelector(".fuel-entry-panel");
      const labels = [...(panel?.querySelectorAll("label") ?? [])].map(label => ({
        text: label.textContent?.trim(),
        control: label.querySelector("input, select")?.outerHTML,
        value: label.querySelector("input, select")?.value,
        checked: label.querySelector("input")?.checked,
      }));
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
      return {
        labels,
        fuelDrafts: rows.filter(row => row.id.startsWith("__sam_travels_form_working_copy__:work.fuel-entry:")).map(row => ({
          id: row.id, status: row.data?.status, revision: row.data?.revision,
          updatedAt: row.data?.updatedAt, values: row.data?.values,
        })),
      };
    });
    throw new Error("Fuel draft did not visibly recover: " + JSON.stringify(diagnostic) + "; " + error.message);
  }
  const resumedWorkingCopy = (await readBrowserRecords(page)).find(row =>
    row.id.startsWith("__sam_travels_form_working_copy__:work.fuel-entry:") && row.data?.status === "in_progress");
  assert.equal(resumedWorkingCopy?.data?.values?.vehicleId, vehicleId,
    "recovered Fuel draft must retain its configured vehicle attribution");
  assert.equal(await resumed.getByLabel("Odometer (km)").inputValue(), "12346");
  assert.equal(await resumed.getByLabel("Price per kg (₹)").inputValue(), "82.5");
  assert.equal(await resumed.getByLabel("Amount paid (₹)").inputValue(), "825");
  assert.equal(await resumed.getByLabel("Partial refill").isChecked(), true);
  const fuelGeoCallsBeforeSecondSubmit = await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0"));
  await context.setOffline(true);
  await resumed.getByRole("button", { name: "Submit fuel purchase", exact: true }).click();
  await resumed.getByText("Fuel purchase saved.", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const secondSubmitStatus = (await resumed.getByText("Fuel purchase saved.", { exact: true }).textContent())?.trim() ?? "";
  assert.equal(secondSubmitStatus, "Fuel purchase saved.", "second production Fuel submit failed: " + secondSubmitStatus);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0")), fuelGeoCallsBeforeSecondSubmit,
    "offline Fuel submission must not request geolocation");
  await context.setOffline(false);
  await resumed.getByText(/^Draft · /).waitFor({ state: "visible" });
  const operatingVehicleContext = resumed.locator(".admin-vehicle-context");
  await operatingVehicleContext.filter({ hasText: registration }).waitFor({ state: "visible" });
  assert((await operatingVehicleContext.innerText()).includes(registration));
  assert.equal(await resumed.getByLabel("Vehicle").count(), 0);
  await resumed.getByLabel("Odometer (km)").fill("12387");
  await resumed.getByLabel("Price per kg (₹)").fill("82.50");
  await resumed.getByLabel("Amount paid (₹)").fill("825");
  await resumed.getByLabel("Partial refill").uncheck();
  await page.clock.fastForward("00:01");
  const fuelGeoCallsBeforeClosingCheckpoint = await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0"));
  await resumed.getByRole("button", { name: "Submit fuel purchase", exact: true }).click();
  await page.waitForTimeout(1000);
  const closingCheckpointStatus = (await resumed.getByText("Fuel purchase saved.", { exact: true }).textContent())?.trim() ?? "";
  const closingFormDiagnostic = await resumed.locator("form").evaluate(form => ({ valid: form.checkValidity(), invalid: [...form.querySelectorAll(":invalid")].map(control => control.validationMessage) }));
  assert.equal(closingCheckpointStatus, "Fuel purchase saved.",
    "closing full-tank checkpoint failed: " + closingCheckpointStatus + " " + JSON.stringify(closingFormDiagnostic));
  assert.equal(await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0")), fuelGeoCallsBeforeClosingCheckpoint,
    "closing full-tank checkpoint must not request geolocation");
  // A completed full-tank interval becomes effective on the following
  // operational date; advance the browser clock before confirming Work km.
  await page.clock.fastForward(100800000);
  const workDistance = await assertBrowserWorkDistanceThroughUi(page);
  assert.equal(workDistance.businessKilometres, 42,
    "Performance must consume a confirmed Work odometer allocation from the rendered UI");
  // Correct the intervening partial refill through the rendered form. This
  // source contributes to the completed interval, unlike the opening baseline.
  const partialPurchaseCard = page.locator(".fuel-entry-panel article").filter({ hasText: "12,346 km" });
  await partialPurchaseCard.getByRole("button", { name: "Correct amount / price", exact: true }).click();
  await partialPurchaseCard.getByLabel("Corrected value (₹)").fill("900.00");
  await partialPurchaseCard.getByLabel("Reason for correction").fill("Pump receipt amount verified");
  await partialPurchaseCard.getByRole("button", { name: "Append correction", exact: true }).click();
  await partialPurchaseCard.getByRole("status").filter({ hasText: "Correction appended" }).waitFor({ timeout: 15000 });
  const fuelReadback = page.locator('[aria-label="Fuel calculation readback"]');
  await fuelReadback.getByText(/255000 paise/, { exact: false }).waitFor({ timeout: 15000 });
  await fuelReadback.getByText(/172500\/42 paise per km/, { exact: false }).waitFor({ timeout: 15000 });
  const correctedRows = await readBrowserRecords(page);
  const correctedPartial = correctedRows.find(row => row.id === purchases[1].id);
  assert.equal(correctedPartial?.data?.amountPaise, 82500,
    "the original partial-refill source remains immutable after correction");
  const fuelCorrectionRows = correctedRows.filter(row =>
    row.id.startsWith("historical-correction:") &&
    row.data?.targetRecordId === purchases[1].id
  );
  assert.equal(fuelCorrectionRows.length, 1, "one append-only correction must be recorded for the partial refill");
  assert.equal(fuelCorrectionRows[0].data.afterValue, 90000);
  const committedBeforeEnrichment = await readBrowserRecords(page);
  purchases = committedBeforeEnrichment.filter(row =>
    row.id.startsWith("feature:business-expenses:fuel:") && row.data?.vehicleId === vehicleId
  );
  purchases = committedBeforeEnrichment.filter(row =>
    row.id.startsWith("feature:business-expenses:fuel:") && row.data?.vehicleId === vehicleId
  ).sort((a, b) => a.data.odometerKm - b.data.odometerKm);
  assert.equal(purchases.length, 3, "opening full, partial, and closing full purchases must commit");
  assert.equal(purchases[0].data.odometerKm, 12345);
  assert.equal(purchases[0].data.partialRefill, false);
  assert.equal(purchases[1].data.odometerKm, 12346);
  assert.equal(purchases[1].data.partialRefill, true);
  assert.equal(purchases[2].data.odometerKm, 12387);
  assert.equal(purchases[2].data.partialRefill, false);
  for (const purchase of purchases) {
    assert.equal(purchase.data.pricePaisePerKg, 8250);
    assert.equal(purchase.data.amountPaise, 82500);
    assert.equal(typeof purchase.data.occurredAt, "string");
    assert.equal(typeof purchase.data.businessDate, "string");
    assert.equal(Object.hasOwn(purchase.data, "locationEvidence"), false);
  }
  await context.setOffline(false);
  console.log("Fuel Entry acceptance passed: real Admin-created Vehicle, partial draft visibly resumed after reload, three purchases including a completed full-tank interval, offline submission committed once, derived quantity preview verified, Fuel submission requested no GPS, and next-day Work distance was confirmed through GPS-backed shift events.");
  await assertBrowserFuelPerformanceAndBackupJourney(page, adminPin, purchases);
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
