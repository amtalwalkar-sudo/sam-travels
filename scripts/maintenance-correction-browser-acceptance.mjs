import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = "http://127.0.0.1:4173";
const vehicleId = "feature:vehicle:MH01AB1234";
const expenseId = "feature:maintenance:expense:browser-acceptance";
const visitId = "feature:maintenance:visit:browser-acceptance";
const timestamp = "2026-10-10T09:00:00.000Z";

const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
  detached: true,
  stdio: "ignore",
});

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("vite_server_not_ready");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });
  await page.evaluate(async ({ vehicleId, expenseId, visitId, timestamp }) => {
    const request = indexedDB.open("sam-travels-browser");
    request.onupgradeneeded = () => {
      const db = request.result;
      const make = (name, keyPath, indexes = []) => {
        if (db.objectStoreNames.contains(name)) return;
        const store = db.createObjectStore(name, { keyPath });
        for (const [index, path, options] of indexes) store.createIndex(index, path, options);
      };
      make("records", "id", [["updatedAt","updatedAt",{}],["schemaVersion","schemaVersion",{}],["deletedAt","deletedAt",{}]]);
      make("driverState", "id");
      make("driverIntents", "command.eventId", [["status","status",{}],["createdAt","createdAt",{}]]);
      make("driverEvents", "eventId", [["committedAt","committedAt",{}],["revision","revision",{}]]);
      make("driverOutbox", "id", [["eventId","eventId",{}],["revision","revision",{}],["delivered","delivered",{}],["createdAt","createdAt",{}]]);
      make("backupCheckpoints", "id", [["createdAt","createdAt",{}],["status","status",{}]]);
      make("credentialVault", "name", [["updatedAt","updatedAt",{}]]);
      make("credentialVaultMeta", "id");
      make("diagnostics", "id", [["timestamp","timestamp",{}]]);
    };
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const vehicle = {
      id: vehicleId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: { schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata", model: "Ace",
        vehicleType: "LCV", fuelType: "Diesel", yearOfManufacture: 2022,
        ownership: "Owned", lifecycleState: "active" },
    };
    const expense = {
      id: expenseId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, businessDate: "2026-10-10",
      createdBy: { personId: "original-driver", role: "driver" },
      data: { schemaVersion: 1, kind: "expense", vehicleId,
        expenseDate: "2026-10-10", expenseName: "Browser acceptance repair",
        description: "Receipt captured for browser acceptance", amountPaise: 10000 },
    };
    const visit = {
      id: visitId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1, businessDate: "2026-10-10",
      createdBy: { personId: "original-driver", role: "driver" },
      data: { schemaVersion: 1, kind: "visit", vehicleId,
        maintenanceDate: "2026-10-10", maintenanceType: "Browser acceptance visit",
        description: "Service visit for rendered correction acceptance",
        items: [{ id: "browser-visit-item", description: "Oil service", amountPaise: 20000 }],
        totalPaise: 20000 },
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(vehicle);
      tx.objectStore("records").put(expense);
      tx.objectStore("records").put(visit);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { vehicleId, expenseId, visitId, timestamp });

  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();

  await page.getByLabel("Person name").fill("Browser Acceptance Admin");
  await page.getByLabel("Admin role").check();
  await page.getByLabel("Set initial Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Enroll person" }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled" }).waitFor();

  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: "Browser Acceptance Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Activate role" }).click();
  await page.getByRole("status").filter({ hasText: "Role activated" }).waitFor();

  const maintenanceSection = page.locator(".admin-replacement-section").filter({ hasText: "Maintenance" });
  await maintenanceSection.locator(".admin-replacement-section-trigger").click();
  await maintenanceSection.locator(".admin-replacement-section-content").waitFor();
  const maintenancePanel = maintenanceSection.locator(".admin-capability-panel").filter({ hasText: "Record actual service visits" });
  await maintenancePanel.waitFor();
  const vehicleSelect = maintenancePanel.locator("select").first();
  await vehicleSelect.selectOption({ label: "MH01AB1234" });
  await maintenancePanel.locator("details.loan-schedule > summary").click();
  await page.getByText("Browser acceptance repair", { exact: false }).waitFor();
  const expenseCard = page.locator(".admin-capability-record").filter({ hasText: "Browser acceptance repair" });
  await expenseCard.getByRole("button", { name: "Correct amount / view history" }).click();
  await expenseCard.getByLabel(/Corrected amount/).fill("150.00");
  await expenseCard.getByLabel("Reason for correction").fill("Verified through browser-driven PWA acceptance");
  await expenseCard.getByRole("button", { name: "Append correction" }).click();
  await expenseCard.getByRole("status").filter({ hasText: "Correction appended" }).waitFor();

  const persisted = await page.evaluate(async ({ expenseId }) => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readonly");
      const get = tx.objectStore("records").getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    const original = rows.find(row => row.id === expenseId);
    const corrections = rows.filter(row => row.id.startsWith("historical-correction:") &&
      row.data?.targetRecordId === expenseId);
    const head = rows.find(row => row.id === "historical-correction-chain:" + encodeURIComponent(expenseId));
    return {
      originalAmount: original?.data?.amountPaise,
      corrections: corrections.map(row => row.data),
      head: head?.data,
    };
  }, { expenseId });

  if (persisted.originalAmount !== 10000) throw new Error("pwa_original_record_was_mutated");
  if (persisted.corrections.length !== 1) throw new Error("pwa_correction_append_count_invalid:" + persisted.corrections.length);
  const correction = persisted.corrections[0];
  if (correction.beforeValue !== 10000 || correction.afterValue !== 15000 ||
      correction.actor.role !== "admin" || correction.reason !== "Verified through browser-driven PWA acceptance") {
    throw new Error("pwa_correction_provenance_invalid:" + JSON.stringify(correction));
  }
  if (persisted.head?.chainRevision !== 1 ||
      persisted.head?.headCorrectionId !== correction.correctionId) {
    throw new Error("pwa_chain_head_invalid:" + JSON.stringify(persisted.head));
  }
  const visitCard = page.locator(".admin-capability-record").filter({ hasText: "Browser acceptance visit" });
  await visitCard.getByRole("button", { name: "Correct visit total / view history" }).click();
  await visitCard.getByLabel("Corrected visit total (₹)").fill("225.00");
  await visitCard.getByLabel("Reason for correction").fill("Final visit invoice verified through rendered PWA");
  await visitCard.getByRole("button", { name: "Append correction" }).click();
  await visitCard.getByRole("status").filter({ hasText: "Visit correction appended" }).waitFor();

  const visitPersisted = await page.evaluate(async ({ visitId }) => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readonly");
      const get = tx.objectStore("records").getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    const original = rows.find(row => row.id === visitId);
    const corrections = rows.filter(row => row.id.startsWith("historical-correction:") &&
      row.data?.targetRecordId === visitId);
    const head = rows.find(row => row.id === "historical-correction-chain:" + encodeURIComponent(visitId));
    return { originalTotal: original?.data?.totalPaise, items: original?.data?.items,
      corrections: corrections.map(row => row.data), head: head?.data };
  }, { visitId });
  if (visitPersisted.originalTotal !== 20000 ||
      visitPersisted.items?.[0]?.amountPaise !== 20000) {
    throw new Error("pwa_visit_source_evidence_was_mutated");
  }
  if (visitPersisted.corrections.length !== 1 ||
      visitPersisted.corrections[0].fieldPath !== "totalPaise" ||
      visitPersisted.corrections[0].beforeValue !== 20000 ||
      visitPersisted.corrections[0].afterValue !== 22500 ||
      visitPersisted.corrections[0].actor.role !== "admin") {
    throw new Error("pwa_visit_correction_provenance_invalid:" + JSON.stringify(visitPersisted.corrections));
  }
  if (visitPersisted.head?.chainRevision !== 1 ||
      visitPersisted.head?.headCorrectionId !== visitPersisted.corrections[0].correctionId) {
    throw new Error("pwa_visit_chain_head_invalid:" + JSON.stringify(visitPersisted.head));
  }
  await page.locator(".loan-metrics").getByText("₹375.00", { exact: true }).waitFor();
  console.log("PASS: browser-driven PWA Maintenance expense and visit corrections propagate to the actual-cost summary; source evidence, actor provenance and chain heads remain intact.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
