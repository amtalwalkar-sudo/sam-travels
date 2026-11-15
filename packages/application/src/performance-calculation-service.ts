import {
  calculatePerformanceV1,
  type PerformanceCalculationInputV1,
  type PerformanceCalculationResultV1,
  type PerformanceDailyRevenueInputV1,
  type PerformanceDailyCostInputV1,
  type PreBusinessRecoverySourceV1,
  type PerformanceCompletenessV1,
} from "../../domain/src/performance-calculation-v1";

type DailyCostKind = PerformanceDailyCostInputV1["kind"];
type OperatingCostKind = Exclude<DailyCostKind, "emi" | "compliance">;

export interface PerformanceBusinessSettingsReadModel {
  getBusinessStartDate(): Promise<string>;
}
export interface PerformanceDriverTargetReadModel {
  getMonthlyTargetPaise(): Promise<number>;
}
export interface PerformanceRevenueReadModel {
  listVerifiedDailyRevenue(from: string, to: string): Promise<readonly PerformanceDailyRevenueInputV1[]>;
}
export interface PerformanceOperatingCostReadModel {
  listDailyCosts(from: string, to: string): Promise<readonly Readonly<{
    date: string; kind: OperatingCostKind; amountPaise: number; verified: boolean;
    sourceRefs: PerformanceDailyCostInputV1["sourceRefs"];
  }>[]>;
}
export interface PerformanceEmiReadModel {
  listDailyEmiAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]>;
  listPreBusinessEmiPortions(): Promise<readonly PreBusinessRecoverySourceV1[]>;
}
export interface PerformanceComplianceReadModel {
  listDailyComplianceAllocations(from: string, to: string): Promise<readonly PerformanceDailyCostInputV1[]>;
  listPreBusinessCompliancePortions(): Promise<readonly PreBusinessRecoverySourceV1[]>;
}
export interface PerformanceManualPreBusinessCostReadModel {
  listEntries(): Promise<readonly PreBusinessRecoverySourceV1[]>;
}
export interface PerformanceCompletenessReadModel {
  getCompleteness(from: string, to: string): Promise<readonly PerformanceCompletenessV1[]>;
}

export type PerformanceCalculationReadModelsV1 = Readonly<{
  businessSettings: PerformanceBusinessSettingsReadModel;
  driverTarget: PerformanceDriverTargetReadModel;
  revenue: PerformanceRevenueReadModel;
  operatingCosts: PerformanceOperatingCostReadModel;
  emi: PerformanceEmiReadModel;
  compliance: PerformanceComplianceReadModel;
  manualPreBusinessCosts: PerformanceManualPreBusinessCostReadModel;
  completeness: PerformanceCompletenessReadModel;
}>;

/**
 * Application orchestration over independently owned read models. EMI and
 * Compliance are intentionally separate ports: neither may be hidden inside
 * a combined cost-allocation dependency or silently substituted for the other.
 */
export class PerformanceCalculationServiceV1 {
  constructor(private readonly sources: PerformanceCalculationReadModelsV1) {}

  async calculate(periodFrom: string, periodTo: string): Promise<PerformanceCalculationResultV1> {
    const businessStartDate = await this.sources.businessSettings.getBusinessStartDate();
    if (periodTo < businessStartDate) throw new Error("performance_period_before_business_start");
    const [
      monthlyDriverTargetPaise, revenue, operatingCosts, emiCosts, complianceCosts,
      manualRecovery, emiRecovery, complianceRecovery, completeness,
    ] = await Promise.all([
      this.sources.driverTarget.getMonthlyTargetPaise(),
      this.sources.revenue.listVerifiedDailyRevenue(businessStartDate, periodTo),
      this.sources.operatingCosts.listDailyCosts(businessStartDate, periodTo),
      this.sources.emi.listDailyEmiAllocations(businessStartDate, periodTo),
      this.sources.compliance.listDailyComplianceAllocations(businessStartDate, periodTo),
      this.sources.manualPreBusinessCosts.listEntries(),
      this.sources.emi.listPreBusinessEmiPortions(),
      this.sources.compliance.listPreBusinessCompliancePortions(),
      this.sources.completeness.getCompleteness(businessStartDate, periodTo),
    ]);

    if (emiCosts.some(row => row.kind !== "emi")) throw new Error("performance_emi_read_model_kind_invalid");
    if (complianceCosts.some(row => row.kind !== "compliance")) throw new Error("performance_compliance_read_model_kind_invalid");
    if (operatingCosts.some(row => row.kind === "emi" || row.kind === "compliance")) {
      throw new Error("performance_operating_cost_contains_time_cost");
    }
    if (manualRecovery.some(row => row.origin !== "manual") ||
        emiRecovery.some(row => row.origin !== "emi") ||
        complianceRecovery.some(row => row.origin !== "compliance")) {
      throw new Error("performance_pre_business_recovery_source_kind_invalid");
    }

    const input: PerformanceCalculationInputV1 = {
      businessStartDate, periodFrom, periodTo, monthlyDriverTargetPaise,
      revenue,
      costs: [...operatingCosts, ...emiCosts, ...complianceCosts],
      preBusinessRecovery: [...manualRecovery, ...emiRecovery, ...complianceRecovery],
      completeness,
    };
    return calculatePerformanceV1(input);
  }
}
