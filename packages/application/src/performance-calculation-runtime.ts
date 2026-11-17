import type { BusinessSettingsService } from "./business-settings-service";
import type { BusinessStartDateCostAllocationService } from "./business-start-date-cost-allocation-service";
import type { FullCostBreakevenService } from "./full-cost-breakeven-service";
import type { PerformanceAdminSettingsServiceV1 } from "./performance-admin-settings-service";
import type { TripFinancialService } from "./trip-financial-service";
import type { RecordRepository } from "../../core/src/repositories";
import { PerformanceCalculationSnapshotBoundaryV1 } from "./performance-calculation-snapshot-boundary";
import { PerformanceCalculationServiceV1 } from "./performance-calculation-service";
import { PerformanceBusinessSettingsAdapterV1 } from "./performance-admin-settings-service";
import { PerformanceFixedCostAllocationAdapterV1 } from "./performance-fixed-cost-allocation-adapter";
import { PerformanceOperatingCostAdapterV1, PerformanceCompletenessCompositeV1 } from "./performance-operating-cost-adapter";
import { PerformanceTripRevenueAdapterV1 } from "./performance-trip-revenue-adapter";

export type PerformanceCalculationRuntimeDependenciesV1 = Readonly<{
  businessSettings: Pick<BusinessSettingsService, "get">;
  adminSettings: Pick<PerformanceAdminSettingsServiceV1,
    "getMonthlyTargetPaise" | "getSourceSnapshotIdentity" | "listEntries" | "prepareSnapshot" | "releaseSnapshot">;
  fullCost: Pick<FullCostBreakevenService, "getSourceProjection">;
  allocation: Pick<BusinessStartDateCostAllocationService, "getReport">;
  tripFinancials: Pick<TripFinancialService, "submittedTripFinancialRecords">;
  /** The same authoritative record repository used by all calculation sources. */
  recordRepository: Pick<RecordRepository, "list">;
}>;

/**
 * The composition root wires the independently owned source adapters into
 * one reproducible Performance calculation service. No UI or persistence
 * implementation is imported into the calculation domain.
 */
export function createPerformanceCalculationServiceV1(
  dependencies: PerformanceCalculationRuntimeDependenciesV1,
): PerformanceCalculationServiceV1 {
  const fixedCosts = new PerformanceFixedCostAllocationAdapterV1(dependencies.allocation);
  const operatingCosts = new PerformanceOperatingCostAdapterV1(dependencies.fullCost);
  const revenue = new PerformanceTripRevenueAdapterV1(dependencies.tripFinancials);
  const completeness = new PerformanceCompletenessCompositeV1([
    operatingCosts, fixedCosts, revenue,
  ]);
  return new PerformanceCalculationServiceV1({
    businessSettings: new PerformanceBusinessSettingsAdapterV1(dependencies.businessSettings),
    driverTarget: dependencies.adminSettings,
    revenue,
    operatingCosts,
    emi: fixedCosts,
    compliance: fixedCosts,
    manualPreBusinessCosts: dependencies.adminSettings,
    completeness,
  }, new PerformanceCalculationSnapshotBoundaryV1(dependencies.recordRepository));
}
