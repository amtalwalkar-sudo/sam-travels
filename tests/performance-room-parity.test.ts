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
  expected: Record<string, number | string>;
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
    const result = calculatePerformanceV1(fixture.input);
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
