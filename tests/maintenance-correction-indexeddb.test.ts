import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { HistoricalCorrectionService } from "../packages/application/src/historical-correction-service";
import { projectHistoricalCorrectionsV1 } from "../packages/domain/src/historical-correction";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { browserDatabase } from "../packages/storage-browser/src/database";

describe("Maintenance correction on the browser IndexedDB repository", () => {
  const records = new DexieRecordRepository();
  const touched: string[] = [];

  afterEach(async () => {
    for (const id of touched.splice(0)) await records.remove(id);
  });

  it("appends and replays a correction without changing the original IndexedDB record", async () => {
    const targetRecordId = "feature:maintenance:expense:" + crypto.randomUUID();
    const correctionId = "indexeddb-maintenance-" + crypto.randomUUID();
    const chainId = "historical-correction-chain:" + encodeURIComponent(targetRecordId);
    touched.push(targetRecordId, "historical-correction:" + correctionId, chainId);
    const recordedAt = "2026-11-11T10:00:00.000Z";
    const original = {
      id: targetRecordId, schemaVersion: 1 as const, createdAt: recordedAt,
      updatedAt: recordedAt, source: "web" as const, revision: 1,
      createdBy: { personId: "driver-indexeddb", role: "driver" as const },
      data: {
        schemaVersion: 1, kind: "expense", vehicleId: "feature:vehicle:MH01AB1234",
        expenseDate: "2026-10-10", expenseName: "Tyre repair",
        description: "Original receipt", amountPaise: 10000,
      },
    };
    await records.put(original);

    const service = new HistoricalCorrectionService(
      records,
      { currentActor: async () => ({ role: "driver", actorId: "driver-indexeddb" }) },
      {
        resolve: async record => {
          const data = record.data as Record<string, unknown>;
          if (!record.id.startsWith("feature:maintenance:expense:") ||
              data.kind !== "expense" || data.schemaVersion !== 1 ||
              !Number.isSafeInteger(data.amountPaise) || (data.amountPaise as number) < 0) {
            throw new Error("maintenance_expense_correction_target_invalid");
          }
          return {
            featureId: "maintenance",
            allowedFieldPaths: ["amountPaise"],
            validateProjectedData: value => {
              const projected = value as Record<string, unknown>;
              if (!Number.isSafeInteger(projected.amountPaise) ||
                  (projected.amountPaise as number) < 0) {
                throw new Error("maintenance_expense_correction_value_invalid");
              }
            },
          };
        },
      },
      "web",
      () => recordedAt,
    );
    const command = {
      correctionId, targetRecordId, expectedTargetRevision: 1, expectedChainRevision: 0,
      fieldPath: "amountPaise", afterValue: 12500, reason: "Verified against original receipt",
      businessEffectiveDate: "2026-10-10",
    };

    const first = await service.submit(command);
    const replay = await service.submit(command);
    const unchanged = await records.get<typeof original.data>(targetRecordId);
    const history = await service.listForTarget(targetRecordId);
    const head = await records.get<{ chainRevision: number; headCorrectionId?: string }>(chainId);

    expect(first.correction.correctionId).toBe(correctionId);
    expect(replay.correction.correctionId).toBe(correctionId);
    expect(unchanged?.data.amountPaise).toBe(10000);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      beforeValue: 10000, afterValue: 12500, reason: "Verified against original receipt",
      actor: { role: "driver", actorId: "driver-indexeddb" }, chainRevision: 1,
    });
    expect(head?.data).toMatchObject({ chainRevision: 1, headCorrectionId: correctionId });
    expect(projectHistoricalCorrectionsV1(unchanged!.data, history)).toMatchObject({
      status: "valid", data: { amountPaise: 12500 }, chainRevision: 1,
    });
    expect((await browserDatabase.records.get(targetRecordId))?.revision).toBe(1);
  });
});
