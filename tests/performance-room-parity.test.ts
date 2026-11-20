import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
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
    const recordsById = new Map(restored.map(row => [row.id, row]));
    const recoveryByOrigin = { manual: 0, emi: 0, compliance: 0 };
    for (const source of fixture.input.preBusinessRecovery) {
      recoveryByOrigin[source.origin] += source.amountPaise;
      if (source.origin === "manual" || source.origin === "compliance") {
        const record = recordsById.get(source.sourceId) as any;
        expect(record).toBeDefined();
        expect(record.revision).toBe(source.revision);
        expect(record.data.amountPaise ?? record.data.totalCostPaise).toBe(source.amountPaise);
      } else {
        const match = /^(.*):emi:(\\d+):v(\\d+)$/.exec(source.sourceId);
        expect(match).not.toBeNull();
        const loan = recordsById.get(match![1]) as any;
        expect(loan).toBeDefined();
        expect(loan.revision).toBe(source.revision);
        const schedule = loan.data.scheduleVersions.find((item: any) => item.version === Number(match![3]));
        const installment = schedule.output.rows.find((item: any) => item.installmentNumber === Number(match![2]));
        expect(schedule).toBeDefined();
        expect(installment.installmentAmountPaise).toBe(source.amountPaise);
        expect(installment.dueDate).toBeLessThan(fixture.input.businessStartDate);
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
});
