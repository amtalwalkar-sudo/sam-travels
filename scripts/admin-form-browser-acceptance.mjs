import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = "http://127.0.0.1:4173";
let vehicleId = "";
const registration = "MH00AA0090";
function indiaDateOffsetDays(offset) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const base = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  return new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
}
const today = indiaDateOffsetDays(0);
function futureDateOffsetDays(offset) {
  return indiaDateOffsetDays(offset);
}
function monthDateOffset(offset) {
  const parts = today.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}
const loanStartDate = monthDateOffset(-10);
const firstEmiDate = monthDateOffset(-9);
const complianceValidTo = monthDateOffset(12);
const nextServiceDate = monthDateOffset(6);
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
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
  await page.getByLabel("Person name").fill("Admin Form Browser Admin");
  await page.getByLabel("Admin role").check();
  await page.getByLabel("Set initial Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Enroll person", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled." }).waitFor({ state: "visible" });
  await page.locator("label").filter({ hasText: "Select person" }).locator("select").selectOption({ label: "Admin Form Browser Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill("4831");
  await page.getByRole("button", { name: "Activate role", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor({ state: "visible" });
  console.log("Admin identity enrolled and PIN-verified actor activated.");

  await page.getByRole("button", { name: "Business setup", exact: true }).click();
  await page.getByLabel("Business start date").fill("2024-01-01");
  await page.getByRole("button", { name: /Set business start date|Save changes/, exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Business start date saved." }).waitFor({ state: "visible" });
  console.log("Business Setup form saved and authoritative setting rendered.");

  await page.getByRole("button", { name: "Vehicle", exact: true }).click();
  await page.getByRole("button", { name: "Add vehicle", exact: true }).click();
  await page.getByLabel("Registration number").fill(registration);
  await page.getByLabel("Make").fill("Acceptance");
  await page.getByLabel("Model").fill("Vehicle");
  await page.getByLabel("Vehicle type").fill("Car");
  await page.getByLabel("Fuel type").selectOption("CNG");
  await page.getByLabel("Year of manufacture").fill("2024");
  await page.getByRole("button", { name: "Create vehicle", exact: true }).click();
  const vehiclePanel = page.locator("#admin-section-panel-vehicle");
  try {
    await page.getByText(registration, { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    console.log("Vehicle panel after create attempt:", await vehiclePanel.innerHTML());
    throw new Error("vehicle_record_not_rendered_after_create:" + (error instanceof Error ? error.message : String(error)));
  }
  vehicleId = await page.evaluate(async registrationNumber => {
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
    const matches = rows.filter(row => row.data?.registrationNumber === registrationNumber && row.id.startsWith("feature:vehicle:"));
    if (matches.length !== 1) throw new Error("canonical_vehicle_id_lookup_failed:" + matches.length);
    return matches[0].id;
  }, registration);
  console.log("Resolved saved vehicle's authoritative record ID:", vehicleId);


  const driverName = "Admin Form Acceptance Driver";
  await page.getByRole("button", { name: "Driver", exact: true }).click();
  await page.getByRole("button", { name: "Add driver", exact: true }).click();
  await page.getByLabel("Driver name").fill(driverName);
  await page.getByLabel("Driving licence number").fill("ACCEPTANCE-LIC-1");
  await page.getByLabel("Mobile number").fill("9990001111");
  await page.getByRole("button", { name: "Save driver", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Driver created." }).waitFor({ state: "visible" });
  const driverCard = page.locator(".admin-capability-record").filter({ hasText: driverName });
  await driverCard.getByRole("button", { name: "Select for Work", exact: true }).click();
  await page.getByRole("status").filter({ hasText: driverName + " selected for Work." }).waitFor({ state: "visible" });
  await page.getByLabel("Vehicle for " + driverName).selectOption(vehicleId);
  await driverCard.getByRole("button", { name: "Assign / reassign", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Vehicle assignment saved." }).waitFor({ state: "visible" });
  await driverCard.getByRole("button", { name: "Unassign", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Driver unassigned." }).waitFor({ state: "visible" });
  await driverCard.getByRole("button", { name: "Clear Work selection", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Driver selection cleared." }).waitFor({ state: "visible" });
  console.log("Driver create, Work selection, vehicle assignment and unassignment commands passed.");

  await page.getByRole("button", { name: "Compliance", exact: true }).click();
  const complianceVehicle = page.locator("#admin-section-panel-compliance select").first();
  await complianceVehicle.selectOption(vehicleId);
  await page.getByRole("button", { name: "Add compliance / renewal", exact: true }).click();
  await page.getByLabel("Compliance type / name").fill("Acceptance Insurance");
  await page.getByLabel("Valid from").fill(today);
  await page.getByLabel("Valid until").fill(complianceValidTo);
  await page.getByLabel("Total cost (₹)").fill("12000");
  await page.getByLabel("Document reference (optional)").fill("INS-ACCEPTANCE-1");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Compliance record saved." }).waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Traffic Challans", exact: true }).waitFor({ state: "visible" });
  await page.getByLabel("Issue date").fill(today);
  await page.getByLabel("Vehicle", { exact: true }).fill(vehicleId);
  await page.getByLabel("Challan amount (₹)").fill("500");
  await page.getByLabel("Reason").fill("Signal violation");
  await page.getByLabel("Challan / transaction reference").fill("CHALLAN-ACCEPTANCE-1");
  await page.getByLabel("Payment status").selectOption("unpaid");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).last().waitFor({ state: "visible" });
  console.log("Compliance coverage and Traffic Challan records submitted.");

  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page.locator("#admin-vehicle").selectOption(vehicleId);
  await page.getByRole("button", { name: "Add loan", exact: true }).click();
  await page.getByLabel("Loan name").fill("Admin Browser Loan");
  await page.getByLabel("Lender name").fill("Acceptance Bank");
  await page.getByLabel("Original principal (₹)").fill("100000");
  await page.getByLabel("Annual interest rate (%)").fill("12");
  await page.getByLabel("Tenure (months)").fill("12");
  await page.getByLabel("Loan start date").fill(loanStartDate);
  await page.getByLabel("First EMI date (first day of month)").fill(firstEmiDate);
  await page.getByRole("button", { name: "Save loan details", exact: true }).click();
  const loanCard = page.locator(".loan-record").filter({ hasText: "Admin Browser Loan" });
  await loanCard.waitFor({ state: "visible", timeout: 15000 });
  console.log("Loan details saved as an immutable historical record and rendered in Finance.");
  const paymentPanel = loanCard.locator(".loan-payment-panel");

  await paymentPanel.getByRole("button", { name: "Record payment", exact: true }).click();
  await paymentPanel.getByLabel("Payment date").fill(today);
  await paymentPanel.getByLabel("Amount paid (₹)").fill("100000");
  await paymentPanel.getByLabel("Transaction reference (optional)").fill("EMI-ACCEPTANCE-1");
  await paymentPanel.getByRole("button", { name: "Suggest oldest-due-first allocation", exact: true }).click();
  await paymentPanel.getByText("Review allocation", { exact: false }).waitFor({ state: "visible" });
  await paymentPanel.getByRole("button", { name: "Save payment", exact: true }).click();
  await paymentPanel.getByRole("status").filter({ hasText: "Payment recorded atomically." }).waitFor({ state: "visible" });
  console.log("Payment allocated oldest-due-first to all currently due EMIs.");

  await paymentPanel.getByRole("button", { name: "Record payment", exact: true }).click();
  await paymentPanel.getByLabel("Payment date").fill(today);
  await paymentPanel.getByLabel("Amount paid (₹)").fill("50");
  await paymentPanel.getByLabel("Transaction reference (optional)").fill("CREDIT-ACCEPTANCE-1");
  await paymentPanel.getByRole("button", { name: "Save payment", exact: true }).click();
  await paymentPanel.getByRole("status").filter({ hasText: "Payment recorded atomically." }).waitFor({ state: "visible" });
  console.log("Separate unallocated credit payment saved for reversal coverage.");

  page.on("dialog", async dialog => {
    if (dialog.type() === "prompt") await dialog.accept("Acceptance full reversal reason");
    else await dialog.accept();
  });
  const creditPaymentRow = paymentPanel.locator(".loan-payment-row").filter({ hasText: "CREDIT-ACCEPTANCE-1" });
  await creditPaymentRow.getByRole("button", { name: "Reverse", exact: true }).click();
  await paymentPanel.getByRole("status").filter({ hasText: "Full payment reversal recorded." }).waitFor({ state: "visible" });
  await paymentPanel.getByText("Reversal · " + today, { exact: false }).waitFor({ state: "visible" });
  console.log("Full reversal retained history without releasing due-EMI allocations.");

  await paymentPanel.getByRole("button", { name: "Prepay principal", exact: true }).click();
  await paymentPanel.getByLabel("Prepayment date").fill(today);
  await paymentPanel.getByLabel("Principal amount (₹)").fill("5000");
  await paymentPanel.getByRole("button", { name: "Preview prepayment", exact: true }).click();
  try {
    await paymentPanel.getByText("Review before confirmation", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    console.log("Prepayment preview status:", await paymentPanel.locator("[role=status]").allTextContents());
    console.log("Prepayment form markup:", await paymentPanel.locator("form.loan-form").allInnerTexts());
    throw new Error("admin_prepayment_preview_failed:" + (error instanceof Error ? error.message : String(error)));
  }
  await paymentPanel.getByRole("button", { name: "Confirm prepayment", exact: true }).click();
  try {
    await paymentPanel.getByRole("status").filter({ hasText: "Principal prepayment and revised schedule committed atomically." }).waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    console.log("Prepayment commit status:", await paymentPanel.locator("[role=status]").allTextContents());
    console.log("Prepayment history rows:", await paymentPanel.locator(".loan-payment-list").allInnerTexts());
    throw new Error("admin_prepayment_commit_failed:" + (error instanceof Error ? error.message : String(error)));
  }

  await paymentPanel.getByRole("button", { name: "Record payment", exact: true }).click();
  await paymentPanel.getByLabel("Payment date").fill(futureDateOffsetDays(1));
  // The prior prepayment creates schedule v2 effective today. Select that effective
  // schedule explicitly; the restored payment draft may still carry v1.
  await paymentPanel.getByLabel("Schedule version").selectOption("2");
  await paymentPanel.getByLabel("Amount paid (₹)").fill("10000");
  await paymentPanel.getByLabel("Transaction reference (optional)").fill("EMI-FUTURE-ACCEPTANCE-1");
  await paymentPanel.getByRole("button", { name: "Suggest oldest-due-first allocation", exact: true }).click();
  const allocationStatus = paymentPanel.getByRole("status");
  await allocationStatus.waitFor({ state: "visible" });
  const allocationMessage = (await allocationStatus.allTextContents()).join(" ");
  if (!allocationMessage.includes("No eligible due EMI was suggested; amount will remain unallocated unless you add an allocation.")) {
    throw new Error("Unexpected future-dated payment allocation result: " + allocationMessage);
  }
  console.log("Future-dated payment allocation respects EMI due-date eligibility: " + allocationMessage);
  await paymentPanel.getByRole("button", { name: "Save payment", exact: true }).click();
  await paymentPanel.getByRole("status").filter({ hasText: "Payment recorded atomically." }).waitFor({ state: "visible" });
  await paymentPanel.getByText("EMI-FUTURE-ACCEPTANCE-1", { exact: false }).waitFor({ state: "visible" });
  console.log("Future-dated payment correctly remains unallocated before the next EMI due-date cutoff.");
  await paymentPanel.getByRole("button", { name: "Record payment", exact: true }).click();
  await paymentPanel.getByLabel("Payment date").fill(monthDateOffset(1));
  await paymentPanel.getByLabel("Schedule version").selectOption("2");
  await paymentPanel.getByLabel("Amount paid (₹)").fill("10000");
  await paymentPanel.getByLabel("Transaction reference (optional)").fill("EMI-NEXT-DUE-ACCEPTANCE-1");
  await paymentPanel.getByRole("button", { name: "Suggest oldest-due-first allocation", exact: true }).click();
  await paymentPanel.getByText("Review allocation", { exact: false }).waitFor({ state: "visible" });
  await paymentPanel.getByRole("button", { name: "Save payment", exact: true }).click();
  await paymentPanel.getByRole("status").filter({ hasText: "Payment recorded atomically." }).waitFor({ state: "visible" });

    await paymentPanel.getByRole("button", { name: "Settle & close", exact: true }).click();
  await paymentPanel.getByLabel("Settlement date").fill(monthDateOffset(1));
  await paymentPanel.getByRole("button", { name: "Check settlement amount", exact: true }).click();
  await paymentPanel.getByRole("button", { name: "Checking…", exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await paymentPanel.getByRole("button", { name: "Check settlement amount", exact: true }).waitFor({ state: "visible", timeout: 10000 });
  console.log("Settlement preview status:", await paymentPanel.locator("[role=status]").allTextContents());
  await paymentPanel.getByText("Settlement amount:", { exact: false }).waitFor({ state: "visible", timeout: 15000 });
  await paymentPanel.getByRole("button", { name: "Confirm settlement and close Loan", exact: true }).click();
  await paymentPanel.getByRole("status").filter({ hasText: "Final settlement recorded and Loan closed." }).waitFor({ state: "visible" });

  await page.getByRole("heading", { name: "Platform Fees", exact: true }).waitFor({ state: "visible" });
  await page.getByLabel("Fee date").fill(today);
  await page.getByLabel("Vehicle", { exact: true }).first().fill(vehicleId);
  await page.getByLabel("Fee amount (₹)").fill("120");
  await page.getByLabel("Trip / settlement reference").fill("SETTLEMENT-ACCEPTANCE-1");
  await page.getByLabel("Note").fill("Acceptance platform fee");
  await page.getByRole("button", { name: "Save expense", exact: true }).first().click();
  await page.getByRole("status").filter({ hasText: "Saved." }).last().waitFor({ state: "visible" });

  await page.getByRole("heading", { name: "Miscellaneous Business Expenses", exact: true }).waitFor({ state: "visible" });
  await page.getByLabel("Expense date").fill(today);
  await page.getByRole("textbox", { name: "Category", exact: true }).fill("Parking");
  await page.getByLabel("Toll / parking treatment (required for Toll or Parking category)").selectOption("standalone");
  await page.getByLabel("Amount (₹)").last().fill("50");
  await page.getByLabel("Vehicle", { exact: true }).last().fill(vehicleId);
  await page.getByLabel("Description").fill("Acceptance parking");
  await page.getByLabel("Receipt / source reference").fill("PARKING-ACCEPTANCE-1");
  await page.getByRole("button", { name: "Save expense", exact: true }).last().click();
  await page.getByRole("status").filter({ hasText: "Saved." }).last().waitFor({ state: "visible" });
  console.log("Loan, payment, reversal, prepayment, settlement, Platform Fee and Miscellaneous Expense workflows submitted.");

  await page.getByRole("button", { name: "Maintenance", exact: true }).click();
  const maintenanceVehicle = page.locator("#admin-section-panel-maintenance .admin-vehicle-context select").first();
  await maintenanceVehicle.selectOption(vehicleId);
  await page.getByRole("button", { name: "Start service visit", exact: true }).click();
  await page.getByLabel("Maintenance type").fill("Scheduled service");
  await page.getByLabel("Date", { exact: true }).fill(today);
  await page.getByLabel("Provider / garage (optional)").fill("Acceptance Garage");
  await page.getByLabel("Odometer km (optional)").fill("55000");
  await page.getByLabel("Next service date (optional)").fill(nextServiceDate);
  await page.getByLabel("Next service at km (optional)").fill("60000");
  await page.getByLabel("Description").fill("Scheduled maintenance check");
  await page.getByLabel("Item 1").fill("Oil and filter");
  await page.getByLabel("Amount (₹)").fill("1200");
  await page.getByRole("button", { name: "Save maintenance record", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Service visit saved." }).waitFor({ state: "visible" });

  await page.locator("#admin-section-panel-maintenance .admin-vehicle-context select").nth(1).selectOption("expense");
  await page.getByRole("button", { name: "Start general expense", exact: true }).click();
  await page.getByLabel("Expense name").fill("Acceptance tyre repair");
  await page.getByLabel("Date", { exact: true }).fill(today);
  await page.getByLabel("Provider / garage (optional)").fill("Acceptance Garage");
  await page.getByLabel("Odometer km (optional)").fill("55100");
  await page.getByLabel("Amount (₹)").fill("4000");
  await page.getByLabel("Description").fill("Tyre repair receipt");
  await page.getByRole("button", { name: "Save maintenance record", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Maintenance expense saved." }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Change per-kilometre rate", exact: true }).click();
  await page.getByLabel("New rate (₹ per km)").fill("2.50");
  await page.getByRole("button", { name: "Save rate", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Per-kilometre rate saved with effective-date history." }).waitFor({ state: "visible" });
  console.log("Maintenance visit, general expense and effective-date rate workflows submitted.");

  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: "Performance", exact: true }).click();
  await page.getByLabel("Monthly Driver Target (₹)").fill("45000");
  await page.getByRole("button", { name: "Save monthly target", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Monthly Driver Target saved." }).waitFor({ state: "visible" });
  await page.getByLabel("Amount (₹)").fill("12500");
  await page.getByLabel("What was this cost for?").fill("Pre-launch vehicle registration");
  await page.getByRole("button", { name: "Add pre-business cost", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Pre-business cost entry saved." }).waitFor({ state: "visible" });
  await page.getByText("Pre-launch vehicle registration", { exact: true }).waitFor({ state: "visible" });
  console.log("Performance monthly Driver Target and multiple-entry pre-business cost Admin forms passed.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
