import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = "http://127.0.0.1:4173";
const primaryVehicleId = "feature:vehicle:MH01AB1234";
const secondaryVehicleId = "feature:vehicle:MH02CD5678";
const uuids = {
  insuranceA: "11111111-1111-4111-8111-111111111111",
  insuranceB: "22222222-2222-4222-8222-222222222222",
  pucA: "33333333-3333-4333-8333-333333333333",
  pucB: "44444444-4444-4444-8444-444444444444",
  fitnessA: "55555555-5555-4555-8555-555555555555",
  fitnessB: "66666666-6666-4666-8666-666666666666",
};
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

  const seeded = await page.evaluate(async ({ primaryVehicleId, secondaryVehicleId, uuids }) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type)?.value ?? "";
    const base = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))));
    const date = offset => { const value = new Date(base); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); };
    const now = new Date().toISOString();
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
    const vehicle = (id, registrationNumber) => ({
      id, schemaVersion: 1, createdAt: now, updatedAt: now, source: "web", revision: 1,
      data: { schemaVersion: 1, registrationNumber, make: "Tata", model: "Ace",
        vehicleType: "LCV", fuelType: "Diesel", yearOfManufacture: 2022,
        ownership: "Owned", lifecycleState: "active" },
    });
    const compliance = (uuid, vehicleId, complianceName, from, to, totalCostPaise) => ({
      id: "feature:compliance:" + uuid, schemaVersion: 1, createdAt: now, updatedAt: now,
      source: "web", revision: 1, businessDate: from,
      createdBy: { personId: "browser-acceptance-admin", role: "admin" },
      data: { schemaVersion: 1, vehicleId, complianceName, validFrom: from, validTo: to, totalCostPaise },
    });
    const rows = [
      vehicle(primaryVehicleId, "MH01AB1234"),
      vehicle(secondaryVehicleId, "MH02CD5678"),
      compliance(uuids.insuranceA, primaryVehicleId, "Insurance", date(-20), date(10), 310000),
      compliance(uuids.insuranceB, primaryVehicleId, "Insurance", date(-10), date(20), 620000),
      compliance(uuids.pucA, secondaryVehicleId, "PUC", date(-30), date(-26), 50000),
      compliance(uuids.pucB, secondaryVehicleId, "PUC", date(-22), date(-18), 75000),
      compliance(uuids.fitnessA, secondaryVehicleId, "Fitness", date(-20), date(10), 155000),
      compliance(uuids.fitnessB, secondaryVehicleId, "Fitness", date(-10), date(20), 310000),
    ];
    await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      rows.forEach(row => tx.objectStore("records").put(row));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return { today: date(0), overlapFrom: date(-10), overlapTo: date(10),
      insuranceIds: [ "feature:compliance:" + uuids.insuranceA, "feature:compliance:" + uuids.insuranceB ],
      fitnessIds: [ "feature:compliance:" + uuids.fitnessA, "feature:compliance:" + uuids.fitnessB ] };
  }, { primaryVehicleId, secondaryVehicleId, uuids });

  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
  await page.getByLabel("Person name").fill("Compliance Browser Admin");
  await page.getByLabel("Admin role").check();
  await page.getByLabel("Set initial Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Enroll person" }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled" }).waitFor();
  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: "Compliance Browser Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Activate role" }).click();
  await page.getByRole("status").filter({ hasText: "Role activated" }).waitFor();

  const complianceSection = page.locator(".admin-section").filter({ hasText: "Compliance" });
  await complianceSection.locator(".admin-section-trigger").click();
  const overview = complianceSection.locator(".compliance-fleet-overview");
  await overview.waitFor();
  await overview.getByRole("heading", { name: "Coverage gaps", exact: true }).waitFor();
  await overview.getByRole("heading", { name: "Overlapping records", exact: true }).waitFor();
  const counts = async () => ({
    records: await overview.locator(".compliance-overview-counts > div").nth(0).locator("strong").textContent(),
    gaps: await overview.locator(".compliance-overview-counts > div").nth(1).locator("strong").textContent(),
    overlaps: await overview.locator(".compliance-overview-counts > div").nth(2).locator("strong").textContent(),
  });
  const allCounts = await counts();
  if (allCounts.records !== "6" || allCounts.gaps !== "1" || allCounts.overlaps !== "2") {
    throw new Error("fleet_overview_counts_invalid:" + JSON.stringify(allCounts));
  }
  await overview.getByText("Insurance · Expiring soon", { exact: true }).waitFor();
  await overview.getByText("PUC · Expired", { exact: true }).waitFor();
  await overview.getByText("Combined amount withheld until every affected overlap is currently confirmed.", { exact: true }).waitFor();

  const filter = overview.locator("#compliance-fleet-filter");
  await filter.selectOption(secondaryVehicleId);
  const secondaryCounts = await counts();
  if (secondaryCounts.records !== "4" || secondaryCounts.gaps !== "1" || secondaryCounts.overlaps !== "1") {
    throw new Error("vehicle_filter_counts_invalid:" + JSON.stringify(secondaryCounts));
  }
  const fitnessCard = overview.locator(".compliance-overlap-card").filter({ hasText: "Fitness" });
  await fitnessCard.waitFor();
  const fitnessRationale = "Fitness dates verified against the source documents; retain the overlap without combining costs.";
  await fitnessCard.getByLabel("Review reason").fill(fitnessRationale);
  await fitnessCard.getByRole("button", { name: "Reject overlap" }).click();
  await fitnessCard.getByText("rejected", { exact: true }).waitFor();
  await fitnessCard.getByText("Rejected; the overlap remains unconfirmed for cost aggregation.", { exact: true }).waitFor();
  await fitnessCard.getByText("Combined amount withheld until every affected overlap is currently confirmed.", { exact: true }).waitFor();

  await filter.selectOption("all");
  const insuranceCard = overview.locator(".compliance-overlap-card").filter({ hasText: "Insurance" });
  await insuranceCard.waitFor();
  await insuranceCard.getByLabel("Review reason").fill("Both original insurance documents were checked; confirm the exact source overlap.");
  await insuranceCard.getByRole("button", { name: "Confirm overlap" }).click();
  await insuranceCard.getByText("confirmed", { exact: true }).waitFor();
  await insuranceCard.getByText("Confirmed for these exact source revisions. Dates and overlap are retained.", { exact: true }).waitFor();

  const primaryCost = overview.locator(".compliance-daily-cost").filter({ hasText: "MH01AB1234" });
  await primaryCost.getByText("Combined daily allocation: 30000 ÷ 1 paise", { exact: true }).waitFor();
  const secondaryCost = overview.locator(".compliance-daily-cost").filter({ hasText: "MH02CD5678" });
  await secondaryCost.getByText("Combined amount withheld until every affected overlap is currently confirmed.", { exact: true }).waitFor();

  const persisted = await page.evaluate(async ({ insuranceIds, fitnessIds }) => {
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
    const events = rows.filter(row => row.id.startsWith("compliance-overlap-review:"));
    const heads = rows.filter(row => row.id.startsWith("compliance-overlap-review-head:"));
    const byDecision = decision => events.find(row => row.data.decision === decision);
    const confirmed = byDecision("confirmed");
    const rejected = events.find(row => row.data.decision === "rejected");
    const original = ids => ids.map(id => rows.find(row => row.id === id));
    return {
      events, heads,
      confirmed: confirmed?.data, rejected: rejected?.data,
      confirmedHead: heads.find(row => row.data.headEventId === confirmed?.id)?.data,
      rejectedHead: heads.find(row => row.data.headEventId === rejected?.id)?.data,
      insurance: original(insuranceIds).map(row => row?.data),
      fitness: original(fitnessIds).map(row => row?.data),
    };
  }, { insuranceIds: seeded.insuranceIds, fitnessIds: seeded.fitnessIds });
  if (persisted.events.length !== 2 || persisted.heads.length !== 2) {
    throw new Error("review_event_or_head_persistence_invalid:" + persisted.events.length + "/" + persisted.heads.length);
  }
  if (persisted.confirmed?.decision !== "confirmed" || persisted.confirmed?.actor?.role !== "admin" ||
      !persisted.confirmed?.rationale || persisted.confirmed?.sourceRecords?.some(source => source.recordRevision !== 1) ||
      persisted.confirmed?.from !== seeded.overlapFrom || persisted.confirmed?.to !== seeded.overlapTo ||
      persisted.confirmedHead?.decisionRevision !== 1) {
    throw new Error("confirmed_review_provenance_invalid:" + JSON.stringify(persisted.confirmed));
  }
  if (persisted.rejected?.decision !== "rejected" || persisted.rejected?.actor?.role !== "admin" ||
      !persisted.rejected?.rationale || persisted.rejectedHead?.decisionRevision !== 1) {
    throw new Error("rejected_review_provenance_invalid:" + JSON.stringify(persisted.rejected));
  }
  if (persisted.insurance[0]?.validFrom === undefined ||
      persisted.insurance[0]?.validFrom >= persisted.insurance[1]?.validFrom ||
      persisted.fitness.some(row => !row?.validFrom || !row?.validTo)) {
    throw new Error("compliance_source_dates_missing_after_review");
  }
  if (persisted.insurance[0].validFrom !== seededDateOffset(seeded.today, -20) ||
      persisted.insurance[0].validTo !== seededDateOffset(seeded.today, 10) ||
      persisted.insurance[1].validFrom !== seededDateOffset(seeded.today, -10) ||
      persisted.insurance[1].validTo !== seededDateOffset(seeded.today, 20)) {
    throw new Error("confirmed_overlap_mutated_original_source_dates");
  }
  console.log("PASS: rendered Admin Compliance PWA shows fleet counts, separate gaps/overlaps, vehicle filtering and expiry states; reject/confirm reviews persist exact source provenance; daily costs remain withheld or aggregate exactly as expected.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}

function seededDateOffset(isoDate, offset) {
  const date = new Date(isoDate + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
