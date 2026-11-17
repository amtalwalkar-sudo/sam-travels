import type { FullCostBreakevenService } from "../../../application/src/full-cost-breakeven-service";
import type { PerformanceCalculationServiceV1 } from "../../../application/src/performance-calculation-service";
import type { BreakevenPeriodResultV1 } from "../../../domain/src/full-cost-breakeven";
import type { PerformanceCalculationResultV1 } from "../../../domain/src/performance-calculation-v1";

/** Stable application-facing read result consumed by the replaceable Performance screen. */
export type PerformanceScreenLoadResultV1 = Readonly<{
  result: PerformanceCalculationResultV1;
  distanceProjection?: BreakevenPeriodResultV1;
  distanceError?: string;
}>;

/**
 * Coordinates the two Performance read models outside the screen component.
 * Calculation failure remains fatal; the optional distance projection keeps
 * its existing independent failure behaviour.
 */
export class PerformanceScreenControllerV1 {
  constructor(
    private readonly calculation: Pick<PerformanceCalculationServiceV1, "calculate">,
    private readonly fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">,
  ) {}

  async loadPeriod(from: string, to: string): Promise<PerformanceScreenLoadResultV1> {
    if (!from || !to || from > to) {
      throw new Error("A valid Performance reporting period is required.");
    }

    const [selectedPeriod, distance] = await Promise.allSettled([
      this.calculation.calculate(from, to),
      this.fullCostBreakeven.calculate(from, to),
    ]);

    if (selectedPeriod.status === "rejected") {
      throw selectedPeriod.reason;
    }

    return {
      result: selectedPeriod.value,
      distanceProjection: distance.status === "fulfilled" ? distance.value : undefined,
      distanceError: distance.status === "rejected"
        ? distance.reason instanceof Error
          ? distance.reason.message
          : "Confirmed distance projection is unavailable."
        : undefined,
    };
  }
}
