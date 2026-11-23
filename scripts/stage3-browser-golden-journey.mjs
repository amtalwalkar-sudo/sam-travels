export async function assertBrowserStage3GoldenJourney(page) {
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
    const after = canonicalRows(await readRecords());
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("stage3_golden_journey_record_identity_revision_or_payload_changed_after_restore");
    }
    if (!uiSourceIds.every(id => after.some(row => row.id === id))) {
      throw new Error("stage3_golden_journey_ui_record_missing_after_restore");
    }
    await runtime.markRestoreVerified(restore.checkpointId);
    await runtime.discardVerifiedRecoveryCheckpoint(restore.checkpointId);
    return { sourceRecordCount: before.length, uiSourceCount: uiSourceIds.length,
      restoreProbeId, restoredCount: restore.restoredCount };
  });
  console.log("Stage 3 same-record golden journey passed:", JSON.stringify(goldenJourney));
 }
