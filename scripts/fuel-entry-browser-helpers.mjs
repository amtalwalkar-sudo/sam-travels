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
