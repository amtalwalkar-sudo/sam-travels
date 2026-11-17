import type { BreakevenPeriodResultV1 } from "../../../domain/src/full-cost-breakeven";
import type { PerformanceCalculationResultV1 } from "../../../domain/src/performance-calculation-v1";
import type { PerformanceCalculationPortV1, PerformanceDistanceProjectionPortV1 } from "./contracts";

/**
 * Structural adapter for the existing application calculation services.
 * It delegates to the established engines unchanged; it owns no calculations.
 */
export class PerformanceScreenServicesAdapterV1
implements PerformanceCalculationPortV1, PerformanceDistanceProjectionPortV1 {
  constructor(
    private readonly calculation: PerformanceCalculationPortV1,
    private readonly distanceProjection: { calculate(from: string, to: string): Promise<BreakevenPeriodResultV1> },
  ) {}

  calculate(from: string, to: string): Promise<PerformanceCalculationResultV1> {
    return this.calculation.calculate(from, to);
  }

  calculateDistance(from: string, to: string): Promise<BreakevenPeriodResultV1> {
    return this.distanceProjection.calculate(from, to);
  }
}
