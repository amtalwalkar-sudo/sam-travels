import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { createDriverCommand } from "../packages/features/work-shift";
import type { GpsFix } from "../packages/core/src/types";

const gpsAt = (fixAt: string): GpsFix => ({
  latitude: 19.076,
  longitude: 72.8777,
  horizontalAccuracyM: 8,
  fixAt,
  provider: "browser-geolocation",
});

describe("authoritative completion transaction", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  const boundaries = [
    { table: "driverEvents", method: "add", name: "event" },
    { table: "driverState", method: "put", name: "state" },
    { table: "driverIntents", method: "put", name: "intent" },
    { table: "driverOutbox", method: "put", name: "outbox" },
  ] as const;

  for (const boundary of boundaries) {
    it("rolls back event/state/intent/outbox when the " + boundary.name + " write fails", async () => {
      const repository = new DexieDriverWorkflowRepository();
      const at = "2026-11-06T10:00:00.000Z";
      const command = createDriverCommand(
        await repository.getSnapshot(), "shift_start", "pwa", "fault-" + boundary.name, at,
      );
      await repository.queueIntent({
        command, status: "pending_location", createdAt: at, updatedAt: at,
      });

      const table = browserDatabase.table(boundary.table) as unknown as Record<
        string, (...args: unknown[]) => Promise<unknown>
      >;
      const original = table[boundary.method];
      table[boundary.method] = async () => {
        throw new Error("injected_" + boundary.name + "_write_failure");
      };
      try {
        await expect(repository.completeIntent(command.eventId, gpsAt(at), at))
          .rejects.toThrow("injected_" + boundary.name + "_write_failure");
      } finally {
        table[boundary.method] = original;
      }

      expect(await repository.getSnapshot()).toMatchObject({ state: "idle", revision: 0 });
      expect(await repository.listEvents()).toHaveLength(0);
      expect((await repository.getIntent(command.eventId))?.status).toBe("pending_location");
      expect(await browserDatabase.table("driverOutbox").count()).toBe(0);
      browserDatabase.close();
      await browserDatabase.open();
      const reopened = new DexieDriverWorkflowRepository();
      expect(await reopened.getSnapshot()).toMatchObject({ state: "idle", revision: 0 });
      expect(await reopened.listEvents()).toHaveLength(0);
      expect((await reopened.getIntent(command.eventId))?.status).toBe("pending_location");
      expect(await browserDatabase.table("driverOutbox").count()).toBe(0);
    });
  }

  it("rejects command-id and idempotency-key reuse across different event IDs", async () => {
    const repository = new DexieDriverWorkflowRepository();
    const at = "2026-11-06T10:00:00.000Z";
    const original = createDriverCommand(await repository.getSnapshot(), "shift_start", "pwa", "identity-a", at);
    await repository.queueIntent({
      command: original, status: "pending_location", createdAt: at, updatedAt: at,
    });
    const reusedKey = {
      ...createDriverCommand(await repository.getSnapshot(), "shift_start", "pwa", "identity-b", at),
      idempotencyKey: original.idempotencyKey,
    };
    await expect(repository.queueIntent({
      command: reusedKey, status: "pending_location", createdAt: at, updatedAt: at,
    })).rejects.toThrow("duplicate_command_identity_conflict");
    const reusedCommand = {
      ...createDriverCommand(await repository.getSnapshot(), "shift_start", "pwa", "identity-c", at),
      commandId: original.commandId,
    };
    await expect(repository.queueIntent({
      command: reusedCommand, status: "pending_location", createdAt: at, updatedAt: at,
    })).rejects.toThrow("duplicate_command_identity_conflict");
    expect(await repository.listPending()).toHaveLength(1);
  });

  it("returns the recorded outcome on duplicate completion without another event or outbox", async () => {
    const repository = new DexieDriverWorkflowRepository();
    const at = "2026-11-06T10:00:00.000Z";
    const command = createDriverCommand(await repository.getSnapshot(), "shift_start", "pwa", "replay-a", at);
    await repository.queueIntent({
      command, status: "pending_location", createdAt: at, updatedAt: at,
    });
    const first = await repository.completeIntent(command.eventId, gpsAt(at), at);
    const replayed = await repository.completeIntent(command.eventId, gpsAt(at), at);
    expect(replayed).toEqual(first);
    expect(await repository.listEvents()).toHaveLength(1);
    expect(await browserDatabase.table("driverOutbox").count()).toBe(1);
    expect(await repository.getSnapshot()).toMatchObject({ revision: 1, lastEventId: command.eventId });
  });
});
