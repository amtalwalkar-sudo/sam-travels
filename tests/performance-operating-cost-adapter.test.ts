import { describe, expect, it } from "vitest";
import {
  PerformanceCompletenessCompositeV1,
  PerformanceOperatingCostAdapterV1,
} from "../packages/application/src/performance-operating-cost-adapter";
import type { FullCostBreakevenSourceProjectionV1 } from "../packages/application/src/full-cost-breakeven-service";

describe("Performance operating cost adapter v1", () => {
  it("maps consumption, accrual and expense costs with category-specific provenance", async () => {
    const projection: FullCostBreakevenSourceProjectionV1 = {
      dailyActivity: [{
        date: "2026-04-05", businessKm: 100, fuelCostPaise: 5_000, maintenanceCostPaise: 2_000,
        distanceSourceId: "distance-1", distanceSourceRevision: 1,
        sourceRefs: [],
        fuelSourceRefs: [{ sourceId: "fuel-purchase-1", revision: 2 }],
        maintenanceSourceRefs: [
          { sourceId: "maintenance-accrual-1", revision: 3 },
          { sourceId: "daily-business-km-1", revision: 1 },
        ],
      }],
      datedCosts: [
        { date: "2026-04-05", amountPaise: 3_000, kind: "platform-fee",
          sourceId: "platform-1", sourceRevision: 1 },
        { date: "2026-04-05", amountPaise: 4_000, kind: "traffic-challan",
          sourceId: "challan-1", sourceRevision: 2 },
        { date: "2026-04-05", amountPaise: 1_000, kind: "miscellaneous",
          sourceId: "expense-1", sourceRevision: 1 },
        { date: "2026-04-05", amountPaise: 2_500, kind: "miscellaneous",
          sourceId: "work:trip-financial-obligation:trip-1", sourceRevision: 4,
          sourceRefs: [{ sourceId: "work:trip-financial-obligation:trip-1", revision: 4 }] },
        { date: "2026-04-05", amountPaise: 8_000, kind: "emi",
          sourceId: "loan-1", sourceRevision: 1 },
      ],
      completeness: [{ source: "maintenance", status: "complete" }],
    };
    const adapter = new PerformanceOperatingCostAdapterV1({
      getSourceProjection: async () => projection,
    });
    const rows = await adapter.listDailyCosts("2026-04-05", "2026-04-05");
    expect(rows.map(row => [row.kind, row.amountPaise])).toEqual([
      ["fuel", 5_000], ["maintenance", 2_000], ["platform-fee", 3_000],
      ["traffic-challan", 4_000], ["miscellaneous", 1_000], ["toll-parking", 2_500],
    ]);
    expect(rows[0].sourceRefs).toEqual([{ sourceId: "fuel-purchase-1", revision: 2 }]);
    expect(rows[1].sourceRefs).toContainEqual({ sourceId: "maintenance-accrual-1", revision: 3 });
    expect(rows[5].sourceRefs).toEqual([
      { sourceId: "work:trip-financial-obligation:trip-1", revision: 4 },
    ]);
  });

  it("combines completeness from independent source owners", async () => {
    const composite = new PerformanceCompletenessCompositeV1([
      { getCompleteness: async () => [{ source: "operating", status: "complete" }] },
      { getCompleteness: async () => [{ source: "fixed-cost", status: "review-required", detail: "overlap" }] },
    ]);
    await expect(composite.getCompleteness("2026-04-01", "2026-04-30")).resolves.toEqual([
      { source: "operating", status: "complete" },
      { source: "fixed-cost", status: "review-required", detail: "overlap" },
    ]);
  });
});
