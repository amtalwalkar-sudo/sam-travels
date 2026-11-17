import { describe, expect, it, vi } from "vitest";
import { PerformanceScreenControllerV1 } from "../packages/features/performance";

describe("PerformanceScreenControllerV1", () => {
  it("loads calculation and distance projections through application capabilities", async () => {
    const result = { calculationId: "performance.calculation.v1" };
    const distanceProjection = { daily: [{ date: "2026-11-17", businessKm: 12 }] };
    const calculate = vi.fn(async () => result);
    const calculateDistance = vi.fn(async () => distanceProjection);
    const controller = new PerformanceScreenControllerV1({ calculate, calculateDistance } as never);

    await expect(controller.loadPeriod("2026-11-01", "2026-11-17")).resolves.toEqual({
      result,
      distanceProjection,
      distanceError: undefined,
    });
    expect(calculate).toHaveBeenCalledWith("2026-11-01", "2026-11-17");
    expect(calculateDistance).toHaveBeenCalledWith("2026-11-01", "2026-11-17");
  });

  it("keeps the Performance result when the optional distance projection fails", async () => {
    const result = { calculationId: "performance.calculation.v1" };
    const calculate = vi.fn(async () => result);
    const calculateDistance = vi.fn(async () => { throw new Error("distance unavailable"); });
    const controller = new PerformanceScreenControllerV1({ calculate, calculateDistance } as never);

    await expect(controller.loadPeriod("2026-11-01", "2026-11-17")).resolves.toEqual({
      result,
      distanceProjection: undefined,
      distanceError: "distance unavailable",
    });
  });

  it("fails the screen load when the authoritative Performance calculation fails", async () => {
    const calculate = vi.fn(async () => { throw new Error("calculation unavailable"); });
    const calculateDistance = vi.fn(async () => ({ daily: [] }));
    const controller = new PerformanceScreenControllerV1({ calculate, calculateDistance } as never);

    await expect(controller.loadPeriod("2026-11-01", "2026-11-17")).rejects.toThrow("calculation unavailable");
  });

  it("rejects an invalid reporting period before invoking either service", async () => {
    const calculate = vi.fn();
    const calculateDistance = vi.fn();
    const controller = new PerformanceScreenControllerV1(
      { calculate } as never,
      { calculate: calculateDistance } as never,
    );

    await expect(controller.loadPeriod("2026-11-18", "2026-11-17")).rejects.toThrow("valid Performance reporting period");
    expect(calculate).not.toHaveBeenCalled();
    expect(calculateDistance).not.toHaveBeenCalled();
  });
});
