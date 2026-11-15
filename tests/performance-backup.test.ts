import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";
import { registerPerformanceBrowserBackupParticipant } from "../apps/web/src/performance-backup";

describe("Performance backup participant", () => {
  let unregister: (() => void) | undefined;
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregister = registerPerformanceBrowserBackupParticipant();
  });
  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  it("exports and restores the target plus multiple independent pre-business cost entries", async () => {
    const timestamp = "2026-11-16T00:00:00.000Z";
    await browserDatabase.records.bulkPut([
      {
        id: "feature:performance:settings", schemaVersion: 1, createdAt: timestamp,
        updatedAt: timestamp, source: "web", revision: 2,
        data: { schemaVersion: 1, kind: "settings", monthlyDriverTargetPaise: 4_500_000 },
      },
      {
        id: "feature:performance:pre-business-cost:11111111-1111-4111-8111-111111111111",
        schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
        data: { schemaVersion: 1, kind: "pre_business_cost", amountPaise: 12_000,
          note: "Vehicle setup", commandId: "11111111-1111-4111-8111-111111111111" },
      },
      {
        id: "feature:performance:pre-business-cost:22222222-2222-4222-8222-222222222222",
        schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "android", revision: 1,
        data: { schemaVersion: 1, kind: "pre_business_cost", amountPaise: 34_000,
          note: "Pre-launch permit", commandId: "22222222-2222-4222-8222-222222222222" },
      },
    ]);
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "performance-records", featureId: "performance", snapshotVersion: 1,
      restoreValidatorId: "performance-records-v1",
    });
    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({
      data: snapshot.data, manifest: snapshot.manifest as never, confirmed: true,
    });
    expect(await browserDatabase.records.count()).toBe(3);
    expect(await browserDatabase.records.get("feature:performance:settings"))
      .toMatchObject({ data: { monthlyDriverTargetPaise: 4_500_000 } });
  });

  it("rejects malformed or misidentified manual cost entries", async () => {
    const timestamp = "2026-11-16T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:performance:pre-business-cost:11111111-1111-4111-8111-111111111111",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: { schemaVersion: 1, kind: "pre_business_cost", amountPaise: 0,
        note: "", commandId: "11111111-1111-4111-8111-111111111111" },
    });
    await expect(exportBrowserSnapshot("0.1.0"))
      .rejects.toThrow("performance_pre_business_cost_invalid");
  });
});
