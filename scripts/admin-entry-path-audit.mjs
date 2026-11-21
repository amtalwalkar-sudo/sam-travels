export async function exerciseWorkShiftEntryPath(page) {
  await page.getByLabel("Shift-start odometer (km)").fill("1000");
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  await page.getByLabel("Shift-end odometer (km)").waitFor({ state: "visible" });
  await page.getByLabel("Shift-end odometer (km)").fill("1050");
  await page.getByRole("button", { name: "End shift", exact: true }).click();
  await page.getByRole("button", { name: "Start shift", exact: true }).waitFor({ state: "visible" });
  await page.getByText("1,050 km", { exact: true }).waitFor({ state: "visible" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start shift", exact: true }).waitFor({ state: "visible" });
  await page.getByText("1,050 km", { exact: true }).waitFor({ state: "visible" });
}

export async function exerciseComplianceRenewalEntryPath(page, monthDateOffset, complianceValidTo) {
  await page.getByRole("button", { name: "Add compliance / renewal", exact: true }).click();
  await page.getByLabel("Compliance type / name").fill("Acceptance Insurance");
  await page.getByLabel("Valid from").fill(monthDateOffset(13));
  await page.getByLabel("Valid until").fill(monthDateOffset(25));
  await page.getByLabel("Total cost (₹)").fill("13000");
  await page.getByLabel("Renewing previous record").selectOption({
    label: "Acceptance Insurance · valid to " + complianceValidTo,
  });
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Compliance record saved." }).last().waitFor({ state: "visible" });
  await page.getByText("Renewal linked to previous record", { exact: true }).waitFor({ state: "visible" });
}



async function readTripObligation(page, kind, status) {
  return page.evaluate(async ({ kind, status }) => {
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
    return rows.find(row => row.id.startsWith("work:trip-financial-obligation:") &&
      row.data?.kind === kind && row.data?.status === status) ?? null;
  }, { kind, status });
}

async function waitForTripObligation(page, kind, status) {
  try {
    await page.waitForFunction(async ({ kind, status }) => {
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
      return rows.some(row => row.id.startsWith("work:trip-financial-obligation:") &&
        row.data?.kind === kind && row.data?.status === status);
    }, { kind, status }, { timeout: 15000 });
  } catch {
    const message = await page.locator(".driver-message").textContent().catch(() => "");
    throw new Error(kind + "_" + status + "_not_committed: " + (message || "no Work status message"));
  }
  return readTripObligation(page, kind, status);
}

async function completeWorkSwipe(page, label) {
  const slider = page.getByRole("slider", { name: "Swipe to " + label });
  await slider.waitFor({ state: "visible", timeout: 15000 });
  await slider.focus();
  await slider.press("End");
}

export async function exerciseWorkTripEntryPaths(page) {
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  await page.getByRole("heading", { name: "Shift Active", exact: true }).waitFor({ state: "visible" });

  await completeWorkSwipe(page, "Going to pickup");
  await page.getByRole("heading", { name: "Going To Pickup", exact: true }).waitFor({ state: "visible" });
  await completeWorkSwipe(page, "Start trip");
  await page.getByRole("heading", { name: "Trip Active", exact: true }).waitFor({ state: "visible" });
  await completeWorkSwipe(page, "End trip");
  await page.getByText("Fare and trip financials required", { exact: true }).waitFor({ state: "visible" });

  const completedPending = await readTripObligation(page, "completed_ride_financials", "pending");
  if (!completedPending?.data?.tripId || !completedPending.data.tripContext?.driverId ||
      !completedPending.data.tripContext?.vehicleId) {
    throw new Error("completed_trip_entry_missing_trip_context_or_persisted_obligation");
  }
  await page.getByLabel("Fare in rupees").fill("150");
  await page.getByText("Add Toll (optional)", { exact: true }).click();
  await page.getByLabel("Toll in rupees").fill("20");
  await page.getByLabel("Toll paid by").selectOption("driver");
  await page.getByText("Add Parking (optional)", { exact: true }).click();
  await page.getByLabel("Parking in rupees").fill("10");
  await page.getByLabel("Parking paid by").selectOption("customer");
  await page.getByRole("button", { name: "Submit trip financials", exact: true }).click();
  const completedSaved = await waitForTripObligation(page, "completed_ride_financials", "submitted");
  if (!completedSaved || completedSaved.id !== completedPending.id ||
      completedSaved.data.farePaise !== 15000 || completedSaved.data.tollPaise !== 2000 ||
      completedSaved.data.tollPayer !== "driver" || completedSaved.data.parkingPaise !== 1000 ||
      completedSaved.data.parkingPayer !== "customer" || !completedSaved.createdBy?.personId) {
    throw new Error("completed_trip_financial_entry_readback_or_actor_provenance_mismatch");
  }

  await completeWorkSwipe(page, "Going to pickup");
  await page.getByRole("heading", { name: "Going To Pickup", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Cancel trip", exact: true }).click();
  await page.getByText("Cancellation fee required", { exact: true }).waitFor({ state: "visible" });
  const cancellationPending = await readTripObligation(page, "cancellation_fee", "pending");
  if (!cancellationPending?.data?.tripId || !cancellationPending.data.tripContext?.driverId ||
      !cancellationPending.data.tripContext?.vehicleId) {
    throw new Error("cancelled_trip_entry_missing_trip_context_or_persisted_obligation");
  }
  await page.getByLabel("Cancellation fee in rupees").fill("12.50");
  await page.getByRole("button", { name: "Save cancellation fee", exact: true }).click();
  const cancellationSaved = await waitForTripObligation(page, "cancellation_fee", "submitted");
  if (!cancellationSaved || cancellationSaved.id !== cancellationPending.id ||
      cancellationSaved.data.feePaise !== 1250 || !cancellationSaved.createdBy?.personId) {
    throw new Error("cancellation_fee_entry_readback_or_actor_provenance_mismatch");
  }

  await page.getByLabel("Shift-end odometer (km)").fill("1060");
  await page.getByRole("button", { name: "End shift", exact: true }).click();
  await page.getByRole("button", { name: "Start shift", exact: true }).waitFor({ state: "visible" });
}
