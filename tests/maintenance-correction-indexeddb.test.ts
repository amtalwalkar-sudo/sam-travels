import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { HistoricalCorrectionService } from "../packages/application/src/historical-correction-service";
import { projectHistoricalCorrectionsV1 } from "../packages/domain/src/historical-correction";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { validateMaintenanceCorrectionSnapshot } from "../apps/web/src/maintenance-backup";
import { createMaintenanceExpenseCorrectionAdapter, projectMaintenanceExpenseRecords } from "../apps/web/src/maintenance-expense-correction-runtime";

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
    const workDailyId = "work:daily-business-km:" + encodeURIComponent("feature:vehicle:MH01AB1234") + ":2026-10-10";
    const accrualId = "feature:maintenance:daily-accrual:" + encodeURIComponent("feature:vehicle:MH01AB1234") + ":2026-10-10";
    touched.push(targetRecordId, "historical-correction:" + correctionId, chainId, workDailyId, accrualId);
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
    const workDaily = {
      id: workDailyId, schemaVersion: 1, createdAt: recordedAt, updatedAt: recordedAt,
      source: "integration" as const, revision: 4,
      data: { schemaVersion: 1, kind: "daily_business_kilometres", vehicleId: "feature:vehicle:MH01AB1234",
        operationalDate: "2026-10-10", totalBusinessKm: 10, unallocatedBusinessKm: 0,
        entries: [{ shiftId: "shift-maintenance", businessKm: 10, personalKm: 2, allocationStatus: "allocated" }] },
    };
    const accrual = {
      id: accrualId, schemaVersion: 1, createdAt: recordedAt, updatedAt: recordedAt,
      source: "integration" as const, revision: 1,
      data: { schemaVersion: 1, kind: "daily_accrual", vehicleId: "feature:vehicle:MH01AB1234",
        operationalDate: "2026-10-10", dailyBusinessKmRecordId: workDailyId, dailyBusinessKmRevision: 4,
        businessKm: 10, personalKm: 2, personalAmountPaise: 500,
        rateEffectiveFrom: "2026-10-10", ratePaisePerKm: 250, amountPaise: 2500 },
    };
    await records.put(workDaily);
    await records.put(accrual);

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
    const adapter = createMaintenanceExpenseCorrectionAdapter(records, "web", {
      currentActor: async () => ({ role: "driver", actorId: "driver-indexeddb" }),
    } as never);
    const beforeRestoreProjection = await projectMaintenanceExpenseRecords([original as never], adapter);
    expect(beforeRestoreProjection[0]).toMatchObject({
      data: { amountPaise: 12500 }, correctionChainRevision: 1,
      correctionRefs: [{ sourceId: "historical-correction:" + correctionId, revision: 1, chainRevision: 1 }],
    });
    const immutableWorkBefore = await records.get(workDailyId);
    const immutableAccrualBefore = await records.get(accrualId);
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

    // Simulate a records-table backup round trip: preserve originals, correction
    // rows and the serialized chain head, then validate and reproject after restore.
    const backupRows = await records.list<unknown>();
    for (const id of touched) await records.remove(id);
    for (const row of backupRows.filter(row => touched.includes(row.id))) await records.put(row);
    const restoredRows = await records.list<unknown>();
    expect(() => validateMaintenanceCorrectionSnapshot(restoredRows)).not.toThrow();
    const restoredHistory = await service.listForTarget(targetRecordId);
    const restoredOriginal = await records.get<typeof original.data>(targetRecordId);
    expect(restoredOriginal?.data.amountPaise).toBe(10000);
    expect(projectHistoricalCorrectionsV1(restoredOriginal!.data, restoredHistory)).toMatchObject({
      status: "valid", data: { amountPaise: 12500 }, chainRevision: 1,
    });
    const afterRestoreProjection = await projectMaintenanceExpenseRecords([restoredOriginal as never], adapter);
    expect(afterRestoreProjection[0].data.amountPaise).toBe(12500);
    expect(afterRestoreProjection[0].correctionChainRevision).toBe(beforeRestoreProjection[0].correctionChainRevision);
    expect(afterRestoreProjection[0].correctionRefs).toEqual(beforeRestoreProjection[0].correctionRefs);
    expect(await records.get(workDailyId)).toEqual(immutableWorkBefore);
    expect(await records.get(accrualId)).toEqual(immutableAccrualBefore);
    await expect(service.submit({
      correctionId: "maintenance-odometer-boundary", targetRecordId, expectedTargetRevision: 1,
      expectedChainRevision: 1, fieldPath: "odometerKm", afterValue: 123,
      reason: "Must not rewrite odometer facts", businessEffectiveDate: "2026-10-10",
    })).rejects.toThrow("historical_correction_field_not_allowed");
    expect((await browserDatabase.records.get(targetRecordId))?.revision).toBe(1);
  });
});
