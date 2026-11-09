import { describe, expect, it } from "vitest";
import { getDriverSwipeAction } from "../packages/features/work-shift";

describe("state-aware trip swipe action", () => {
  it("offers Going to pickup only while a shift is active", () => {
    expect(getDriverSwipeAction("shift_active")).toEqual({
      label: "Going to pickup",
      eventType: "trip_create",
    });
  });

  it("offers Start trip while approaching pickup", () => {
    expect(getDriverSwipeAction("going_to_pickup")).toEqual({
      label: "Start trip",
      eventType: "start_ride",
    });
  });

  it("offers End trip only while a trip is active", () => {
    expect(getDriverSwipeAction("trip_active")).toEqual({
      label: "End trip",
      eventType: "end_ride",
    });
  });

  it("does not offer a trip swipe action outside an active trip workflow state", () => {
    expect(getDriverSwipeAction("idle")).toBeUndefined();
    expect(getDriverSwipeAction("needs_attention")).toBeUndefined();
    expect(getDriverSwipeAction("approach_active")).toBeUndefined();
    expect(getDriverSwipeAction(undefined)).toBeUndefined();
  });
});
