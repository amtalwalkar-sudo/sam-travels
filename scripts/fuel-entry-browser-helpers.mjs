export async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("fuel_entry_browser_server_did_not_start");
}

export async function readBrowserRecords(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readonly");
      const read = tx.objectStore("records").getAll();
      let result;
      read.onsuccess = () => { result = read.result; };
      read.onerror = () => reject(read.error);
      tx.oncomplete = () => resolve(result ?? []);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("browser_records_read_aborted"));
    });
    db.close();
    return rows;
  });
}

export async function installFuelGeolocationStub(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          const calls = Number(localStorage.getItem("__fuel_geo_calls") || "0") + 1;
          localStorage.setItem("__fuel_geo_calls", String(calls));
          if (window.__fuel_allow_work_gps) success({
            coords: { latitude: 19.076, longitude: 72.8777, accuracy: 8 }, timestamp: Date.now(),
          });
        },
        watchPosition(success) {
          const calls = Number(localStorage.getItem("__fuel_geo_calls") || "0") + 1;
          localStorage.setItem("__fuel_geo_calls", String(calls));
          if (window.__fuel_allow_work_gps) success({
            coords: { latitude: 19.076, longitude: 72.8777, accuracy: 8 }, timestamp: Date.now(),
          });
          return 1;
        },
        clearWatch() {},
      },
    });
  });
}

export async function correctFuelPurchaseThroughUi(page, purchaseId) {
  const card = page.locator(".fuel-entry-panel article").filter({ hasText: "12,346 km" });
  const correctionButton = card.getByRole("button", { name: "Correct amount / price", exact: true });
  await correctionButton.click();
  await card.getByLabel("Corrected value (₹)").fill("900.00");
  await card.getByLabel("Reason for correction").fill("Pump receipt amount verified");
  await card.getByRole("button", { name: "Append correction", exact: true }).click();
  await card.getByRole("status").filter({ hasText: "Correction appended" }).waitFor({ timeout: 15000 });
  await correctionButton.click();
  await card.getByLabel("Field to correct").selectOption("pricePaisePerKg");
  await card.getByLabel("Corrected value (₹)").fill("90.00");
  await card.getByLabel("Reason for correction").fill("Pump unit price verified");
  await card.getByRole("button", { name: "Append correction", exact: true }).click();
  await card.getByRole("status").filter({ hasText: "Correction appended" }).waitFor({ timeout: 15000 });
  const readback = page.locator('[aria-label="Fuel calculation readback"]');
  await readback.getByText(/255000 paise/, { exact: false }).waitFor({ timeout: 15000 });
  await readback.getByText(/172500\\/42 paise per km/, { exact: false }).waitFor({ timeout: 15000 });
  const rows = await readBrowserRecords(page);
  const original = rows.find(row => row.id === purchaseId);
  assert.equal(original?.data?.amountPaise, 82500, "original amount must remain immutable");
  assert.equal(original?.data?.pricePaisePerKg, 8250, "original price must remain immutable");
  const corrections = rows.filter(row =>
    row.id.startsWith("historical-correction:") && row.data?.targetRecordId === purchaseId
  );
  assert.equal(corrections.length, 2, "amount and price corrections must each append one immutable record");
  assert.deepEqual(corrections.map(row => [row.data.fieldPath, row.data.afterValue]).sort(),
    [["amountPaise", 90000], ["pricePaisePerKg", 9000]]);
  return rows;
}
