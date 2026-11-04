import { describe, expect, it } from "vitest";
import { formatGpsAccuracy, formatTripDuration } from "../apps/web/src/ui/trip-history-format";

describe("trip history presentation", () => {
  it("formats elapsed time across midnight", () => {
    expect(formatTripDuration("2026-11-04T23:30:00.000Z", "2026-11-05T00:15:30.000Z")).toBe("45m 30s");
  });

  it("formats long and short trips without inventing missing durations", () => {
    expect(formatTripDuration("2026-11-04T08:00:00.000Z", "2026-11-04T10:05:00.000Z")).toBe("2h 5m");
    expect(formatTripDuration("2026-11-04T08:00:00.000Z", "2026-11-04T08:00:12.000Z")).toBe("12s");
    expect(formatTripDuration("2026-11-04T08:00:00.000Z")).toBeNull();
    expect(formatTripDuration("invalid", "2026-11-04T08:00:00.000Z")).toBeNull();
    expect(formatTripDuration("2026-11-04T08:00:01.000Z", "2026-11-04T08:00:00.000Z")).toBeNull();
  });

  it("shows only valid non-negative GPS accuracy values", () => {
    expect(formatGpsAccuracy(8.4)).toBe("8 m");
    expect(formatGpsAccuracy(0)).toBe("0 m");
    expect(formatGpsAccuracy(-1)).toBeNull();
    expect(formatGpsAccuracy(Number.NaN)).toBeNull();
    expect(formatGpsAccuracy(undefined)).toBeNull();
  });
});
