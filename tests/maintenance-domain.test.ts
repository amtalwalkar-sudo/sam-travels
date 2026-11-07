import { describe, expect, it } from "vitest";
import {
  assertMaintenanceRecordV1,
  calculateMaintenanceVisitTotal,
  maintenanceRateHistoryRecordId,
} from "../packages/features/maintenance";
import {
  buildMaintenanceRateHistory,
  maintenanceBusinessDateFromInstant,
  maintenanceRateForDate,
} from "../packages/features/maintenance";

const vehicleId = "feature:vehicle:MH01AB1234";
const visit = {
  schemaVersion: 1 as const, kind: "visit" as const, vehicleId,
  maintenanceDate: "2026-10-05", maintenanceType: "Regular service",
  description: "Oil and filter replacement",
  items: [
    { id: "123e4567-e89b-42d3-a456-426614174000", description: "Engine oil", amountPaise: 200000 },
    { id: "123e4567-e89b-42d3-a456-426614174001", description: "Filter", amountPaise: 50000 },
  ],
  totalPaise: 250000,
};

describe("Maintenance v1 record contract", () => {
  it("derives visit totals from individual expense items", () => {
    expect(calculateMaintenanceVisitTotal(visit.items)).toBe(250000);
    expect(() => assertMaintenanceRecordV1(visit)).not.toThrow();
    expect(() => assertMaintenanceRecordV1({ ...visit, totalPaise: 250001 }))
      .toThrow("maintenance_visit_total_mismatch");
  });

  it("rejects empty items, duplicate item IDs and invalid dates", () => {
    expect(() => calculateMaintenanceVisitTotal([])).toThrow("maintenance_visit_items_required");
    expect(() => calculateMaintenanceVisitTotal([
      visit.items[0], { ...visit.items[1], id: visit.items[0].id },
    ])).toThrow("maintenance_visit_duplicate_item_id");
    expect(() => assertMaintenanceRecordV1({ ...visit, maintenanceDate: "2026-02-30" }))
      .toThrow("maintenance_visit_invalid");
  });

  it("keeps general expenses distinct from visits", () => {
    const expense = {
      schemaVersion: 1, kind: "expense", vehicleId, expenseDate: "2026-10-06",
      expenseName: "Towing", description: "Roadside towing", amountPaise: 120000,
    };
    expect(() => assertMaintenanceRecordV1(expense)).not.toThrow();
    expect(() => assertMaintenanceRecordV1({ ...expense, kind: "visit" }))
      .toThrow("maintenance_visit_invalid");
  });

  it("uses one deterministic rate-history identity per vehicle", () => {
    expect(maintenanceRateHistoryRecordId(vehicleId))
      .toBe("feature:maintenance:rate:feature%3Avehicle%3AMH01AB1234");
  });
});

describe("Maintenance rate history", () => {
  it("uses the Asia/Kolkata business date for the initial default rate", () => {
    expect(maintenanceBusinessDateFromInstant("2026-10-31T20:00:00.000Z")).toBe("2026-11-01");
    const history = buildMaintenanceRateHistory("2026-10-31T20:00:00.000Z");
    expect(history).toEqual([{
      effectiveFrom: "2026-11-01", ratePaisePerKm: 250, savedAt: "2026-10-31T20:00:00.000Z",
      isDefault: true,
    }]);
  });

  it("applies the latest saved rate only from its effective business date", () => {
    const history = [
      { effectiveFrom: "2026-01-01", ratePaisePerKm: 250, savedAt: "2026-01-01T00:00:00.000Z", isDefault: true },
      { effectiveFrom: "2026-02-03", ratePaisePerKm: 300, savedAt: "2026-02-03T05:00:00.000Z", isDefault: false, commandId: "123e4567-e89b-42d3-a456-426614174000", source: "web" as const },
    ];
    expect(maintenanceRateForDate(history, "2026-02-02").ratePaisePerKm).toBe(250);
    expect(maintenanceRateForDate(history, "2026-02-03").ratePaisePerKm).toBe(300);
  });
});
