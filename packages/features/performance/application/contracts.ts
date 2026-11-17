import type { BreakevenPeriodResultV1 } from "../../../domain/src/full-cost-breakeven";
import type { PerformanceCalculationResultV1 } from "../../../domain/src/performance-calculation-v1";

/** Feature-owned capabilities required by the Performance screen controller. */
export interface PerformanceCalculationPortV1 {
  calculate(from: string, to: string): Promise<PerformanceCalculationResultV1>;
}

/** Optional distance/cost projection; its failure must not hide Performance results. */
export interface PerformanceDistanceProjectionPortV1 {
  calculateDistance(from: string, to: string): Promise<BreakevenPeriodResultV1>;
}
