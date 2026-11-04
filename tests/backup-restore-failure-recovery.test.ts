import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import {
  exportBrowserSnapshot,
  listBrowserRecoveryCheckpoints,
  restoreBrowserSnapshot,
} from "../packages/storage-browser/src";

describe("backup restore failure recovery", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("rolls back current data and retains a recovery checkpoint when post-restore verification fails", async () => {
    const timestamp = "2026-11-04T00:00:00.000Z";
    await browserDatabase.records.bulkPut([
      {
        id: "alpha",
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: "web",
        revision: 1,
        data: { label: "backup-alpha" },
      },
      {
        id: "zeta",
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: "web",
        revision: 1,
        data: { label: "backup-zeta" },
      },
    ]);

    const source = await exportBrowserSnapshot("0.1.0");
    const deliberatelyReordered = {
      ...source.data,
      records: [...source.data.records].reverse(),
    };

    await browserDatabase.records.bulkPut([
      {
        id: "alpha",
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: "2026-11-04T00:01:00.000Z",
        source: "web",
        revision: 2,
        data: { label: "current-alpha" },
      },
      {
        id: "zeta",
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: "2026-11-04T00:01:00.000Z",
        source: "web",
        revision: 2,
        data: { label: "current-zeta" },
      },
    ]);

    await expect(restoreBrowserSnapshot({
      data: deliberatelyReordered,
      manifest: source.manifest,
      confirmed: true,
    })).rejects.toThrow("backup_post_restore_verification_failed");

    expect((await browserDatabase.records.get("alpha"))?.data).toEqual({ label: "current-alpha" });
    expect((await browserDatabase.records.get("zeta"))?.data).toEqual({ label: "current-zeta" });
    expect(await listBrowserRecoveryCheckpoints()).toEqual([
      expect.objectContaining({ status: "rollback_complete" }),
    ]);
  });
});
