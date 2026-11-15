import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = "http://127.0.0.1:4173";
const vehicleId = "feature:vehicle:MH00AA0090";
const registration = "MH00AA0090";
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
  await page.evaluate(async ({ vehicleId, registration }) => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = new Date().toISOString();
    const vehicle = {
      id: vehicleId, schemaVersion: 1, createdAt: now, updatedAt: now, source: "web", revision: 1,
      data: { schemaVersion: 1, registrationNumber: registration, make: "Acceptance", model: "Vehicle",
        vehicleType: "Car", fuelType: "CNG", yearOfManufacture: 2024, ownership: "Owned", lifecycleState: "active" },
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(vehicle);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { vehicleId, registration });

  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();

  await page.getByRole("button", { name: "Vehicle", exact: true }).click();
  await page.getByRole("button", { name: "Add vehicle", exact: true }).click();
  await page.getByLabel("Registration number").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  console.log("Vehicle create/edit form opened and safely dismissed.");

  await page.getByRole("button", { name: "Driver", exact: true }).click();
  await page.getByRole("button", { name: "Add driver", exact: true }).click();
  await page.getByLabel("Driver name").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  console.log("Driver profile form opened and safely dismissed.");

  await page.getByRole("button", { name: "Compliance", exact: true }).click();
  const complianceVehicle = page.locator("#admin-section-panel-compliance select").first();
  await complianceVehicle.selectOption(vehicleId);
  await page.getByRole("button", { name: "Add compliance / renewal", exact: true }).click();
  await page.getByLabel("Compliance type / name").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("heading", { name: "Traffic Challans", exact: true }).waitFor({ state: "visible" });
  await page.getByLabel("Payment status").waitFor({ state: "visible" });
  console.log("Compliance renewal and Traffic Challan forms rendered.");

  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page.locator("#admin-vehicle").selectOption(vehicleId);
  await page.getByRole("button", { name: "Add loan", exact: true }).click();
  await page.getByLabel("Loan name").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close and keep draft", exact: true }).click();
  await page.getByRole("heading", { name: "Platform Fees", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Miscellaneous Business Expenses", exact: true }).waitFor({ state: "visible" });
  await page.getByLabel("Already deducted from gross income").waitFor({ state: "visible" });
  console.log("Loan details, Platform Fee and Miscellaneous Expense forms rendered.");

  await page.getByRole("button", { name: "Maintenance", exact: true }).click();
  const maintenanceVehicle = page.locator("#admin-section-panel-maintenance select").first();
  await maintenanceVehicle.selectOption(vehicleId);
  await page.getByRole("button", { name: "Start service visit", exact: true }).click();
  await page.getByLabel("Maintenance type").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close and keep draft", exact: true }).click();
  await page.getByLabel("Record type").selectOption("expense");
  await page.getByRole("button", { name: "Start general expense", exact: true }).click();
  await page.getByLabel("Expense name").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close and keep draft", exact: true }).click();
  await page.getByRole("button", { name: "Change per-kilometre rate", exact: true }).click();
  await page.getByLabel("New rate (₹ per km)").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close and keep draft", exact: true }).click();
  console.log("Maintenance visit, expense and rate forms rendered.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
