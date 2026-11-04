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

  it("rejects malformed feature rows before replacing current data", async () => {
    const timestamp = "2026-11-04T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "current-business-data",
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "web",
      revision: 9,
      data: { label: "must-survive" },
    });
    const source = await exportBrowserSnapshot("0.1.0");
    const malformed = {
      ...source.data,
      driverOutbox: [{ delivered: false, revision: 1, eventId: "missing-primary-key" }],
    };

    await expect(restoreBrowserSnapshot({
      data: malformed,
      manifest: source.manifest,
      confirmed: true,
    })).rejects.toThrow("backup_invalid_or_duplicate_row_id:driverOutbox");

    expect((await browserDatabase.records.get("current-business-data"))?.data).toEqual({
      label: "must-survive",
    });
    expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
  });

});
