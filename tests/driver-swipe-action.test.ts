import { describe, expect, it } from "vitest";
import { driverSwipePresentationContract, getDriverSwipeAction } from "../packages/features/work-shift";

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

describe("versioned cross-surface swipe presentation contract", () => {
  it("declares the same action mapping and gesture thresholds used by the native overlay", () => {
    expect(driverSwipePresentationContract.contractId).toBe("sam-travels.driver-swipe-presentation");
    expect(driverSwipePresentationContract.version).toBe(1);
    expect(driverSwipePresentationContract.gesture.completionPercent).toBe(95);
    expect(driverSwipePresentationContract.gesture.minimumIntentTravel.nativeDp).toBe(24);
    expect(driverSwipePresentationContract.gesture.minimumIntentTravel.webCssPx).toBe(24);
    expect(driverSwipePresentationContract.actions).toEqual({
      shift_active: { label: "Going to pickup", eventType: "trip_create" },
      going_to_pickup: { label: "Start trip", eventType: "start_ride" },
      trip_active: { label: "End trip", eventType: "end_ride" },
    });
    expect(driverSwipePresentationContract.secondaryActions.going_to_pickup).toEqual({
      label: "Cancel ride",
      eventType: "cancel_ride",
    });
  });
});
