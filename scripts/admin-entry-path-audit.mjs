import assert from "node:assert/strict";

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




export async function enrollAndLinkDriverPerson(page, driverName) {
  await page.getByLabel("Person name").fill(driverName);
  await page.getByLabel("Driver role").check();
  await page.getByRole("button", { name: "Enroll person", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Person enrolled." }).last().waitFor({ state: "visible" });
  await page.getByLabel("Link " + driverName + " to person").selectOption({ label: driverName });
  await page.getByRole("status").filter({ hasText: "Driver profile link saved." }).waitFor({ state: "visible" });
}

async function readDriverPersonLink(page, driverId) {
  return page.evaluate(async id => {
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
    return rows.find(row => row.id === "identity:driver-person-link:" + id && !row.deletedAt)?.data?.personId ?? null;
  }, driverId);
}

async function readBrowserRecords(page) {
  return page.evaluate(async () => {
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
    return rows;
  });
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
  for (let attempt = 0; attempt < 30; attempt++) {
    const row = await readTripObligation(page, kind, status);
    if (row) return row;
    await page.waitForTimeout(250);
  }
  const message = await page.locator(".driver-message").textContent().catch(() => "");
  const rows = await page.evaluate(async () => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readonly");
      const get = tx.objectStore("records").getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return all.filter(row => row.id?.startsWith("work:trip-financial-obligation:"))
      .map(row => ({ id: row.id, kind: row.data?.kind, status: row.data?.status }));
  });
  throw new Error(kind + "_" + status + "_not_committed: " +
    JSON.stringify({ message, rows }));
}

async function completeWorkSwipe(page, label) {
  const slider = page.getByRole("slider", { name: "Swipe to " + label });
  await slider.waitFor({ state: "visible", timeout: 15000 });
  await slider.focus();
  await slider.press("End");
}

export async function exerciseWorkTripEntryPaths(page, { adminName, adminPin } = {}) {
  await page.getByLabel("Shift-start odometer (km)").fill("1000");
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
      completedSaved.data.parkingPayer !== "customer" || !completedSaved.createdBy?.personId ||
      completedSaved.createdBy.personId === completedPending.data.tripContext.driverId ||
      completedSaved.updatedBy?.personId !== await readDriverPersonLink(page, completedPending.data.tripContext.driverId)) {
    throw new Error("completed_trip_financial_entry_readback_or_actor_provenance_mismatch: " +
      JSON.stringify({id:completedSaved?.id,data:completedSaved?.data,createdBy:completedSaved?.createdBy}));
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
      cancellationSaved.data.feePaise !== 1250 || !cancellationSaved.createdBy?.personId ||
      cancellationSaved.createdBy.personId === cancellationPending.data.tripContext.driverId ||
      cancellationSaved.updatedBy?.personId !== await readDriverPersonLink(page, cancellationPending.data.tripContext.driverId)) {
    throw new Error("cancellation_fee_entry_readback_or_actor_provenance_mismatch");
  }

  await page.getByLabel("Shift-end odometer (km)").fill("1060");
  await page.getByRole("button", { name: "End shift", exact: true }).click();
  await page.getByRole("button", { name: "Start shift", exact: true }).waitFor({ state: "visible" });

  if (adminName && adminPin) {
    const eventsBeforeCorrection = (await readBrowserRecords(page))
      .filter(row => row.id.startsWith("logbook:"))
      .map(row => ({ id: row.id, revision: row.revision, data: row.data }));
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.getByLabel("Select person").selectOption({ label: adminName });
    await page.getByLabel("Active role").selectOption("admin");
    await page.getByLabel("Admin PIN").fill(adminPin);
    await page.getByRole("button", { name: "Activate role", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Driver", exact: true }).click();
    const correctionPanel = page.getByRole("region", { name: "Trip financial corrections" });
    await correctionPanel.getByLabel("Submitted trip").selectOption(completedSaved.id);
    await correctionPanel.getByLabel("Field to correct").selectOption("farePaise");
    await correctionPanel.getByLabel("Correct value").fill("175");
    await correctionPanel.getByLabel("Reason for correction").fill("Verified against the original trip receipt");
    await correctionPanel.getByRole("button", { name: "Record correction", exact: true }).click();
    await correctionPanel.getByRole("status").filter({
      hasText: "Trip financial correction recorded.",
    }).waitFor({ state: "visible" });
    await correctionPanel.getByText(/Fare ₹175.00/).waitFor({ state: "visible" });

    const afterCorrection = await readBrowserRecords(page);
    const immutableOriginal = afterCorrection.find(row => row.id === completedSaved.id);
    const correction = afterCorrection.find(row =>
      row.id.startsWith("historical-correction:") && row.data?.targetRecordId === completedSaved.id
    );
    assert.equal(immutableOriginal?.revision, completedSaved.revision);
    assert.equal(immutableOriginal?.data?.farePaise, 15000);
    assert.equal(correction?.data?.fieldPath, "farePaise");
    assert.equal(correction?.data?.beforeValue, 15000);
    assert.equal(correction?.data?.afterValue, 17500);
    assert.equal(correction?.data?.reason, "Verified against the original trip receipt");
    assert.equal(correction?.data?.actor?.role, "admin");
    assert.deepEqual(afterCorrection.filter(row => row.id.startsWith("logbook:"))
      .map(row => ({ id: row.id, revision: row.revision, data: row.data })), eventsBeforeCorrection,
    "trip financial correction must not mutate committed Work/GPS events");
  }
}

export async function assertFinanceAdminActorProvenance(page) {
  const audit = await page.evaluate(async () => {
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
    const loan = rows.find(row => row.id?.startsWith("feature:finance:loan:") &&
      row.data?.details?.loanName === "Admin Browser Loan");
    if (!loan) return null;
    const suffix = loan.id.slice("feature:finance:loan:".length);
    const ledger = rows.find(row => row.id === "feature:finance:payments:" + suffix)?.data;
    const prepayments = rows.find(row => row.id === "feature:finance:prepayments:" + suffix)?.data;
    return { entries: ledger?.entries ?? [], revisions: prepayments?.revisions ?? [] };
  });
  const entries = audit?.entries ?? [];
  const kinds = new Set(entries.map(entry => entry.kind));
  const eventsValid = entries.length > 0 &&
    ["payment", "reversal", "settlement"].every(kind => kinds.has(kind)) &&
    entries.every(entry => entry.createdBy?.role === "admin" && !!entry.createdBy?.personId);
  const prepaymentsValid = (audit?.revisions?.length ?? 0) > 0 &&
    audit.revisions.every(revision => revision.createdBy?.role === "admin" && !!revision.createdBy?.personId);
  if (!eventsValid || !prepaymentsValid) {
    throw new Error("finance_admin_actor_provenance_missing_or_invalid: " +
      JSON.stringify({ entries: entries.map(entry => ({kind:entry.kind,createdBy:entry.createdBy})),
        revisions: audit?.revisions?.map(revision => revision.createdBy) }));
  }
  console.log("Browser/Dexie readback verified Admin attribution on Finance payments, reversal, prepayment and settlement.");
}
