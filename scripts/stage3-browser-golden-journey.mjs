export async function assertBrowserStage3GoldenJourney(page) {
  const captureCalculation = async () => {
    const dashboard = await page.locator(".performance-dashboard").innerText();
    const provenance = await page.locator("#performance-provenance").innerText();
    if (!dashboard.trim() || !provenance.includes("performance.calculation.v1")) {
      throw new Error("stage3_golden_journey_calculation_or_provenance_not_rendered");
    }
    return { dashboard, provenance };
  };
  const calculationBeforeRestore = await captureCalculation();
  // Stage 3 same-record golden journey: the records entered through the rendered
  // Admin/Work UI above feed the production Performance calculation, then the
  // production encrypted Browser backup/restore adapter. Compare the complete
  // record identity/revision/content set across the restore boundary.
  const goldenJourney = await page.evaluate(async () => {
    const readRecords = async () => {
      const request = indexedDB.open("sam-travels-browser");
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction("records", "readonly");
        const read = tx.objectStore("records").getAll();
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return rows;
    };
    const normalize = value => Array.isArray(value) ? value.map(normalize) :
      value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
    const canonicalRows = rows => rows
      .map(row => normalize({ id: row.id, revision: row.revision, schemaVersion: row.schemaVersion,
        updatedAt: row.updatedAt, data: row.data, createdBy: row.createdBy }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const isUiSource = row =>
      row.id.startsWith("feature:business-settings:") ||
      row.id.startsWith("feature:performance:") ||
      row.id.startsWith("feature:business-expenses:") ||
      row.id.startsWith("feature:vehicle:") ||
      row.id.startsWith("feature:driver-records:");
    const before = canonicalRows((await readRecords()).filter(isUiSource));
    const uiSourceIds = before.map(row => row.id);
    if (uiSourceIds.length < 5) throw new Error("stage3_golden_journey_missing_ui_source_records");
    const runtime = await import("/apps/web/src/backup-runtime.ts");
    const recoveryBytes = crypto.getRandomValues(new Uint8Array(32));
    let recoveryBinary = "";
    for (const byte of recoveryBytes) recoveryBinary += String.fromCharCode(byte);
    const recoveryKey = btoa(recoveryBinary);
    const created = await runtime.createBackupForCurrentRuntime({
      applicationVersion: "stage3-golden-journey",
      recoveryKey,
    });
    if (!created.backup || created.backup.manifest?.format !== "backup-encryption-v2") {
      throw new Error("stage3_golden_journey_did_not_create_production_encrypted_backup");
    }
    // Remove one UI-created source after export so a successful restore must
    // actually reinstate it from the authenticated encrypted package.
    const restoreProbeId = uiSourceIds[0];
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").delete(restoreProbeId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("stage3_probe_delete_aborted"));
    });
    db.close();
    const restore = await runtime.restoreBackupForCurrentRuntime({
      backup: created.backup,
      secret: { recoveryKey },
      confirmed: true,
    });
    if (!restore.checkpointId || restore.restoredCount < before.length) {
      throw new Error("stage3_golden_journey_restore_count_or_checkpoint_invalid");
    }
    const after = canonicalRows((await readRecords()).filter(isUiSource));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const afterById = new Map(after.map(row => [row.id, row]));
      const mismatches = before.filter(row => JSON.stringify(row) !== JSON.stringify(afterById.get(row.id)))
        .slice(0, 5).map(row => ({ before: row, after: afterById.get(row.id) ?? null }));
      const missing = after.filter(row => !before.some(source => source.id === row.id)).map(row => row.id).slice(0, 5);
      throw new Error("stage3_golden_journey_record_identity_revision_or_payload_changed_after_restore:" +
        JSON.stringify({ mismatches, missing }));
    }
    if (!uiSourceIds.every(id => after.some(row => row.id === id))) {
      throw new Error("stage3_golden_journey_ui_record_missing_after_restore");
    }
    await runtime.markRestoreVerified(restore.checkpointId);
    await runtime.discardVerifiedRecoveryCheckpoint(restore.checkpointId);
    return { sourceRecordCount: before.length, uiSourceCount: uiSourceIds.length, uiSourceIds,
      restoreProbeId, restoredCount: restore.restoredCount };
  });
  await page.locator(".performance-period-form").getByRole("button", {
    name: /Refresh performance|Calculating/, exact: false,
  }).click();
  await page.waitForFunction(() => {
    const dashboard = document.querySelector(".performance-dashboard");
    return Boolean(dashboard && !document.querySelector(".performance-loading"));
  }, undefined, { timeout: 30000 });
  const calculationAfterRestore = await captureCalculation();
  if (JSON.stringify(calculationBeforeRestore) !== JSON.stringify(calculationAfterRestore)) {
    throw new Error("stage3_golden_journey_calculation_output_or_provenance_changed_after_restore:" +
      JSON.stringify({ before: calculationBeforeRestore, after: calculationAfterRestore }));
  }
  const evidence = {
    ...goldenJourney, calculationOutputAndProvenanceStable: true,
    calculationSnapshot: calculationBeforeRestore,
    calculationSourceRecords: goldenJourney.uiSourceIds,
  };
  console.log("Stage 3 same-record golden journey passed:", JSON.stringify(evidence));
  return evidence;
}

export async function assertBrowserWorkDistanceThroughUi(page) {
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  await page.evaluate(() => { window.__fuel_allow_work_gps = true; });
  await page.getByLabel("Shift-start odometer (km)").fill("12387");
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  await page.getByRole("heading", { name: "Shift Active", exact: true }).waitFor({ timeout: 30000 });
  await page.getByLabel("Shift-end odometer (km)").fill("12429");
  await page.getByText("Business kilometres: 42 km", { exact: true }).waitFor();
  await page.getByRole("button", { name: "End shift", exact: true }).click();
  await page.getByRole("heading", { name: "Idle", exact: true }).waitFor({ timeout: 30000 });
  const state = await page.evaluate(async () => {
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
  if (state?.state !== "idle" || state?.revision !== 2) {
    throw new Error("stage3_work_distance_not_confirmed_through_rendered_ui:" + JSON.stringify(state));
  }
  const gpsCalls = await page.evaluate(() => Number(localStorage.getItem("__fuel_geo_calls") || "0"));
  if (gpsCalls < 2) throw new Error("stage3_work_shift_did_not_capture_event_scoped_gps:" + gpsCalls);
  return { state: state.state, revision: state.revision, gpsCalls, businessKilometres: 42 };
}

export async function assertBrowserFuelPerformanceAndBackupJourney(page, adminPin, purchases) {
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByLabel("Select person").selectOption({ label: "Fuel Entry Browser Admin" });
  await page.getByLabel("Active role").selectOption("admin");
  await page.getByLabel("Admin PIN").fill(adminPin);
  await page.getByRole("button", { name: "Activate role", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Role activated." }).waitFor({ state: "visible" });
  await page.locator("#admin-section-trigger-performance").click();
  await page.getByLabel("Monthly Driver Target (₹)").fill("1000");
  await page.getByRole("button", { name: "Save monthly target", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Monthly Driver Target saved." }).waitFor({ state: "visible" });
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Performance", exact: true }).click();
  await page.getByRole("heading", { name: "Performance overview", exact: true }).waitFor();
  const period = page.locator(".performance-period-form");
  await period.getByLabel("Period from").fill("2024-01-01");
  const confirmedOperationalDate = await page.evaluate(async () => {
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
    const daily = rows.find(row => row.id.startsWith("work:daily-business-km:") &&
      row.data?.kind === "daily_business_kilometres" && row.data?.operationalDate);
    if (!daily) throw new Error("stage3_performance_period_missing_confirmed_operational_date");
    return daily.data.operationalDate;
  });
  await period.getByLabel("Period to").fill(confirmedOperationalDate);
  await period.getByRole("button", { name: /Refresh performance|Calculating/, exact: false }).click();
  await page.getByText("Lifetime breakeven & target position", { exact: true }).waitFor({ timeout: 30000 });
  await page.locator("#performance-provenance > summary").first().click();
  await page.locator("#performance-provenance > details > summary").click();
  await page.locator("#performance-provenance").getByText("performance.calculation.v1", { exact: false }).waitFor();
  const golden = await assertBrowserStage3GoldenJourney(page);
  const eligibleCosts = await page.getByRole("button", { name: "Explain Eligible period costs", exact: true }).innerText();
  const match = eligibleCosts.match(/₹([\d,]+\.\d{2})/);
  const paise = Math.round(Number((match?.[1] ?? "0").replaceAll(",", "")) * 100);
  if (paise < 165000) {
    throw new Error("stage3_performance_excludes_ui_created_fuel_expenses:" + eligibleCosts);
  }
  for (const purchase of purchases) {
    if (!golden.uiSourceIds.includes(purchase.id)) {
      throw new Error("stage3_backup_restore_lost_ui_fuel_source:" + purchase.id);
    }
  }
  // The opening full-tank checkpoint is a baseline, not consumed interval
  // spend. The partial refill and closing full checkpoint fund the rate.
  if (golden.calculationSnapshot.provenance.includes(purchases[0].id)) {
    throw new Error("stage3_fuel_opening_baseline_must_not_be_interval_spend:" + purchases[0].id);
  }
  for (const purchase of purchases.slice(1)) {
    if (!golden.calculationSnapshot.provenance.includes(purchase.id)) {
      throw new Error("stage3_calculation_provenance_missing_fuel_interval_source:" + purchase.id);
    }
  }
  console.log("PWA Fuel → confirmed Work distance → Performance → encrypted restore passed:",
    JSON.stringify({ purchaseIds: purchases.map(p => p.id), businessKilometres: 42, eligibleCostsPaise: paise }));
  return golden;
}

