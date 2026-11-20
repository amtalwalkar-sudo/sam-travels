import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import {
  exportBrowserSnapshot, restoreBrowserSnapshot, markBrowserRestoreVerified,
  discardVerifiedBrowserCheckpoint, recoverBrowserRestoreTransactions,
  listBrowserRecoveryCheckpoints,
} from "../packages/storage-browser/src";
import {
  createEncryptedBackup, decryptBackupWithRecoveryKey, parseBackupPackage,
  serializeBackupPackage,
} from "../packages/features/backup";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerComplianceBrowserBackupParticipant } from "../apps/web/src/compliance-backup";
import { registerFinanceBrowserBackupParticipant } from "../apps/web/src/finance-backup";
import { registerPerformanceBrowserBackupParticipant } from "../apps/web/src/performance-backup";
import { calculatePerformanceV1 } from "../packages/domain/src/performance-calculation-v1";

const fixture = JSON.parse(readFileSync(
  "android/app/src/androidTest/assets/performance-calculation-v1-parity.json", "utf8",
)) as {
  records: Array<{ id: string; schemaVersion: number; updatedAt: string; [key: string]: unknown }>;
  input: Parameters<typeof calculatePerformanceV1>[0];
  expected: Record<string, number | string | Record<string, number>>;
};

describe("Performance browser and Room shared parity fixture", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(async () => {
    await browserDatabase.delete();
  });

  it("round-trips the exact shared source envelopes in browser storage and matches the calculation vector", async () => {
    await browserDatabase.records.bulkPut(fixture.records as never[]);
    const restored = await browserDatabase.records.bulkGet(fixture.records.map(row => row.id));
    expect(restored).toEqual(fixture.records);
    const presentRecords = restored.filter((row): row is NonNullable<typeof row> => row !== undefined);
    expect(presentRecords).toHaveLength(fixture.records.length);
    const recordsById = new Map(presentRecords.map(row => [row.id, row]));
    const recoveryByOrigin = { manual: 0, emi: 0, compliance: 0 };
    for (const source of fixture.input.preBusinessRecovery) {
      recoveryByOrigin[source.origin] = (recoveryByOrigin[source.origin] ?? 0) + source.amountPaise;
      if (source.origin === "manual" || source.origin === "compliance") {
        const record = recordsById.get(source.sourceId) as any;
        expect(record).toBeDefined();
        expect(record.revision).toBe(source.revision);
        expect(record.data.amountPaise ?? record.data.totalCostPaise).toBe(source.amountPaise);
      } else {
        const match = /^(.*):emi:(\d+):v(\d+)$/.exec(source.sourceId);
        expect(match).not.toBeNull();
        const loan = recordsById.get(match![1]) as any;
        expect(loan).toBeDefined();
        expect(loan.revision).toBe(source.revision);
        const schedule = loan.data.scheduleVersions.find((item: any) => item.version === Number(match![3]));
        const installment = schedule.output.rows.find((item: any) => item.installmentNumber === Number(match![2]));
        expect(schedule).toBeDefined();
        expect(installment.installmentAmountPaise).toBe(source.amountPaise);
        expect(installment.dueDate < fixture.input.businessStartDate).toBe(true);
        expect(source.scheduleVersion).toBe(schedule.version);
      }
    }
    expect(recoveryByOrigin).toEqual(fixture.expected.recoverySources);
    const result = calculatePerformanceV1(fixture.input);
    expect(result.recovery.totalPaise).toBe(fixture.expected.recoveryTotalPaise);
    expect(result.recovery.daily.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(fixture.expected.recoveryTotalPaise);
    expect(new Set(result.recovery.daily.map(row => row.origin))).toEqual(new Set(["manual", "emi", "compliance"]));
    expect(result.provenance.sourceRefs.map(ref => ref.sourceId)).toEqual(
      expect.arrayContaining(fixture.input.preBusinessRecovery.map(source => source.sourceId)),
    );
    expect(result.period).toMatchObject({
      revenuePaise: fixture.expected.periodRevenuePaise,
      costPaise: fixture.expected.periodCostPaise,
      profitPaise: fixture.expected.periodProfitPaise,
    });
    expect(result.lifetime).toMatchObject({
      revenuePaise: fixture.expected.lifetimeRevenuePaise,
      costPaise: fixture.expected.lifetimeCostPaise,
      profitPaise: fixture.expected.lifetimeProfitPaise,
      targetPaise: fixture.expected.lifetimeTargetPaise,
      targetPositionPaise: fixture.expected.lifetimeTargetPositionPaise,
      elapsedCalendarMonths: fixture.expected.elapsedCalendarMonths,
    });
    expect(result.recovery).toMatchObject({
      from: fixture.expected.recoveryFrom,
      toExclusive: fixture.expected.recoveryToExclusive,
      totalPaise: fixture.expected.recoveryTotalPaise,
    });
    expect(result.recovery.daily.at(-1)?.date).toBe(fixture.expected.recoveryLastDate);
  });

  it("runs the populated manual, EMI and Compliance pool through encrypted production export, restore, reopen, recovery and recomputation", async () => {
    const unregister = [
      registerVehicleBrowserBackupParticipant(),
      registerComplianceBrowserBackupParticipant(),
      registerFinanceBrowserBackupParticipant(),
      registerPerformanceBrowserBackupParticipant(),
    ];
    try {
      const sourceIds = fixture.input.preBusinessRecovery.map(source =>
        source.sourceId.replace(/:emi:\d+:v\d+$/, ""),
      );
      const poolIds = new Set(["feature:vehicle:MH01AB1234", ...sourceIds]);
      const poolRecords = fixture.records.filter(record => poolIds.has(record.id));
      expect(poolRecords).toHaveLength(4);
      await browserDatabase.records.bulkPut(poolRecords as never[]);

      // Use the same production snapshot exporter and authenticated backup
      // package used by BackupRuntime, not a test-only serialization.
      const exported = await exportBrowserSnapshot("0.1.0");
      const { backup, recoveryKey } = await createEncryptedBackup({
        plaintext: exported.plaintext,
        manifest: exported.manifest as import("../packages/core/src/backup").SnapshotManifest,
        mode: "recovery-key-only",
      });
      const parsed = parseBackupPackage(serializeBackupPackage(backup));
      const plaintext = await decryptBackupWithRecoveryKey(parsed, recoveryKey);
      const imported = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));

      // Simulate a different destination store before invoking the production
      // restore transaction; the encrypted export must replace it atomically.
      const manualSource = fixture.input.preBusinessRecovery.find(source => source.origin === "manual")!;
      const manualRecord = poolRecords.find(record => record.id === manualSource.sourceId)! as any;
      await browserDatabase.records.put({
        ...manualRecord,
        revision: manualRecord.revision + 1,
        updatedAt: "2026-03-16T00:00:00.000Z",
        data: { ...manualRecord.data, amountPaise: 1 },
      });

      const restored = await restoreBrowserSnapshot({
        data: imported,
        manifest: parsed.manifest as import("../packages/core/src/backup").SnapshotManifest,
        confirmed: true,
      });
      expect(await listBrowserRecoveryCheckpoints()).toEqual([
        expect.objectContaining({ id: restored.checkpointId, status: "restored_unverified" }),
      ]);

      const restoredRows = await browserDatabase.records.bulkGet(poolRecords.map(record => record.id));
      const present = restoredRows.filter((row): row is NonNullable<typeof row> => row !== undefined);
      expect(present).toHaveLength(poolRecords.length);
      const restoredById = new Map(present.map(row => [row.id, row]));
      for (const source of fixture.input.preBusinessRecovery) {
        const sourceId = source.sourceId.replace(/:emi:\d+:v\d+$/, "");
        const record = restoredById.get(sourceId) as any;
        expect(record).toBeDefined();
        expect(record.revision).toBe(source.revision);
        if (source.origin === "manual" || source.origin === "compliance") {
          expect(record.data.amountPaise ?? record.data.totalCostPaise).toBe(source.amountPaise);
        } else {
          const match = /:emi:(\d+):v(\d+)$/.exec(source.sourceId)!;
          const schedule = record.data.scheduleVersions.find((item: any) => item.version === Number(match[2]));
          const installment = schedule.output.rows.find((item: any) => item.installmentNumber === Number(match[1]));
          expect(installment.installmentAmountPaise).toBe(source.amountPaise);
          expect(installment.dueDate < fixture.input.businessStartDate).toBe(true);
        }
      }

      const calculateFromRestoredRecords = (rows: readonly any[]) => {
        const recordsById = new Map(rows.map(record => [record.id, record]));
        const restoredPool = fixture.input.preBusinessRecovery.map(source => {
          const sourceId = source.sourceId.replace(/:emi:\d+:v\d+$/, "");
          const record = recordsById.get(sourceId);
          expect(record).toBeDefined();
          if (source.origin === "manual") {
            return { ...source, revision: record.revision, amountPaise: record.data.amountPaise, note: record.data.note };
          }
          if (source.origin === "compliance") {
            return { ...source, revision: record.revision, amountPaise: record.data.totalCostPaise, note: record.data.complianceName };
          }
          const match = /:emi:(\d+):v(\d+)$/.exec(source.sourceId)!;
          const schedule = record.data.scheduleVersions.find((item: any) => item.version === Number(match[2]));
          const installment = schedule.output.rows.find((item: any) => item.installmentNumber === Number(match[1]));
          return {
            ...source,
            revision: record.revision,
            amountPaise: installment.installmentAmountPaise,
            scheduleVersion: schedule.version,
            note: "EMI installment " + installment.installmentNumber,
          };
        });
        return calculatePerformanceV1({ ...fixture.input, preBusinessRecovery: restoredPool });
      };
      const result = calculateFromRestoredRecords(present);
      expect(result.recovery.totalPaise).toBe(fixture.expected.recoveryTotalPaise);
      expect(result.recovery.daily.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(23_400);
      expect(result.recovery.daily.at(-1)?.date).toBe(fixture.expected.recoveryLastDate);
      expect(result.lifetime).toMatchObject({
        costPaise: fixture.expected.lifetimeCostPaise,
        profitPaise: fixture.expected.lifetimeProfitPaise,
        targetPositionPaise: fixture.expected.lifetimeTargetPositionPaise,
      });
      expect(result.provenance.sourceRefs.map(ref => ref.sourceId)).toEqual(
        expect.arrayContaining(fixture.input.preBusinessRecovery.map(source => source.sourceId)),
      );

      // A restore is not durable until the application has verified its
      // contents. Mark/discard through the production checkpoint API, then
      // model process death and the normal startup-recovery gate.
      await markBrowserRestoreVerified(restored.checkpointId);
      await discardVerifiedBrowserCheckpoint(restored.checkpointId);
      browserDatabase.close();
      await browserDatabase.open();
      expect(await recoverBrowserRestoreTransactions()).toEqual({ recovered: 0 });

      const reExported = await exportBrowserSnapshot("0.1.0");
      expect(reExported.data.records).toEqual(exported.data.records);
      expect(await listBrowserRecoveryCheckpoints()).toHaveLength(0);
      const afterRestart = calculateFromRestoredRecords(reExported.data.records as readonly any[]);
      expect(afterRestart.recovery).toMatchObject({
        totalPaise: fixture.expected.recoveryTotalPaise,
        from: fixture.expected.recoveryFrom,
        toExclusive: fixture.expected.recoveryToExclusive,
      });
      expect(afterRestart.lifetime.profitPaise).toBe(fixture.expected.lifetimeProfitPaise);

      // Also exercise the interrupted-unverified path with the same populated
      // pool: startup recovery must roll back to the exact pre-restore graph.
      const changedManual = await browserDatabase.records.get(manualSource.sourceId) as any;
      await browserDatabase.records.put({
        ...changedManual,
        revision: changedManual.revision + 1,
        updatedAt: "2026-03-17T00:00:00.000Z",
        data: { ...changedManual.data, amountPaise: 777 },
      });
      const interrupted = await restoreBrowserSnapshot({
        data: imported,
        manifest: parsed.manifest as import("../packages/core/src/backup").SnapshotManifest,
        confirmed: true,
      });
      browserDatabase.close();
      await browserDatabase.open();
      expect(await recoverBrowserRestoreTransactions()).toEqual({ recovered: 1 });
      expect(await browserDatabase.records.get(manualSource.sourceId)).toMatchObject({
        revision: changedManual.revision + 1,
        data: { amountPaise: 777 },
      });
      expect(await listBrowserRecoveryCheckpoints()).toEqual([
        expect.objectContaining({ id: interrupted.checkpointId, status: "rollback_complete" }),
      ]);
    } finally {
      unregister.reverse().forEach(dispose => dispose());
    }
  });

});
