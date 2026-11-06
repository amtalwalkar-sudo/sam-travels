import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { FeatureLifecycleCoordinator } from "../packages/application/src/feature-lifecycle-coordinator";
import { registerFeatures } from "../packages/core/src/features";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";

describe("browser IndexedDB repository", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("persists and retrieves versioned records", async () => {
    const repo = new DexieRecordRepository(), now = new Date().toISOString();
    const record = { id: "record-1", schemaVersion: 1, createdAt: now, updatedAt: now, source: "web" as const, revision: 1, data: { label: "test" } };
    await repo.put(record);
    expect(await repo.get("record-1")).toEqual(record);
    expect(await repo.list()).toHaveLength(1);
    await repo.remove("record-1");
    expect(await repo.get("record-1")).toBeUndefined();
  });

  it("defaults internet access to disabled and persists the choice", async () => {
    const repo = new DexieRecordRepository();
    expect(await repo.getNetworkEnabled()).toBe(false);
    await repo.setNetworkEnabled(true);
    expect(await repo.getNetworkEnabled()).toBe(true);
  });

  it("performs atomic revision compare-and-set in IndexedDB", async () => {
    const repo = new DexieRecordRepository(), now = new Date().toISOString();
    const initial = { id: "cas", schemaVersion: 1, createdAt: now, updatedAt: now, source: "web" as const, revision: 1, data: { value: 1 } };
    const next = { ...initial, revision: 2, data: { value: 2 } };
    expect(await repo.compareAndSet("cas", null, initial)).toBe(true);
    expect(await repo.compareAndSet("cas", null, next)).toBe(false);
    expect(await repo.compareAndSet("cas", 1, next)).toBe(true);
    expect((await repo.get("cas"))?.revision).toBe(2);
    expect(await repo.compareAndSet("cas", 1, { ...next, revision: 3 })).toBe(false);
  });

  it("persists lifecycle transitions through the authoritative IndexedDB repository", async () => {
    const repository = new DexieRecordRepository();
    const firstProcess = new FeatureLifecycleCoordinator(repository, registerFeatures());
    await firstProcess.transition("performance", "disable");
    await firstProcess.transition("logbook", "disable");

    const reloadedProcess = new FeatureLifecycleCoordinator(new DexieRecordRepository(), registerFeatures());
    const states = await reloadedProcess.list();
    expect(states.get("logbook")?.state).toBe("disabled");
    expect(states.get("performance")?.state).toBe("disabled");
    expect((await repository.get("platform:feature-lifecycle"))?.revision).toBe(2);
  });
});
