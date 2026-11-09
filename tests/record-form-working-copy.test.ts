import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { RecordFormWorkingCopyRepository } from "../packages/application/src/record-form-working-copy-repository";
import type { FormWorkingCopy } from "../packages/application/src/shared-form-runtime";

describe("authoritative record-backed form working copies", () => {
  beforeEach(async () => {
    await browserDatabase.close();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("persists and restores a form working copy from the same record repository", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web", () => "2026-11-10T00:00:00.000Z");
    const copy: FormWorkingCopy = {
      formId: "work.trip-fare", formVersion: 1, instanceId: "trip-1", revision: 0,
      status: "in_progress", values: { farePaise: 12500 }, operationId: "op-1",
      updatedAt: "2026-11-10T00:00:00.000Z",
    };
    await copies.put(copy);
    const restored = await new RecordFormWorkingCopyRepository(records, "web").get("work.trip-fare", "trip-1");
    expect(restored).toEqual(copy);
    expect(await browserDatabase.records.count()).toBe(1);
  });

  it("uses atomic revisions to reject stale writes", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web");
    const copy: FormWorkingCopy = {
      formId: "admin.vehicle", formVersion: 1, instanceId: "vehicle-1", revision: 0,
      status: "in_progress", values: {}, operationId: "op-2", updatedAt: new Date().toISOString(),
    };
    await copies.put(copy);
    await copies.put({ ...copy, revision: 1, values: { make: "Tata" } }, 0);
    await expect(copies.put({ ...copy, revision: 1, values: { make: "Other" } }, 0))
      .rejects.toThrow("form_copy_revision_conflict");
    expect(await copies.get(copy.formId, copy.instanceId)).toMatchObject({ revision: 1, values: { make: "Tata" } });
  });

  it("removes a working copy without touching unrelated records", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web");
    const copy: FormWorkingCopy = {
      formId: "admin.driver", formVersion: 1, instanceId: "driver-1", revision: 0,
      status: "in_progress", values: {}, operationId: "op-3", updatedAt: new Date().toISOString(),
    };
    await copies.put(copy);
    await records.put({ id: "unrelated", schemaVersion: 1, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), source: "web", revision: 1, data: { retained: true } });
    await copies.remove(copy.formId, copy.instanceId);
    expect(await copies.get(copy.formId, copy.instanceId)).toBeUndefined();
    expect(await records.get("unrelated")).toBeDefined();
  });
});
