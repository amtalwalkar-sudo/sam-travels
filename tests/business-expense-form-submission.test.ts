import { describe, expect, it } from "vitest";
import { beginFuelLocationCapture } from "../apps/web/src/business-expense-form-submission";

describe("Fuel Entry submit-time GPS acquisition", () => {
  it("requests a fresh device fix and resolves with its actual timestamp and accuracy", async () => {
    let success: ((position: GeolocationPosition) => void) | undefined;
    let options: PositionOptions | undefined;
    const geolocation = {
      getCurrentPosition(callback: (position: GeolocationPosition) => void, _error: unknown, requested?: PositionOptions) {
        success = callback;
        options = requested;
      },
    } as unknown as Geolocation;

    const capture = beginFuelLocationCapture(geolocation);
    expect(options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0, timeout: 6000 });
    expect(capture.completedAt()).toBeUndefined();

    success!({
      coords: {
        latitude: 19.076, longitude: 72.8777, accuracy: 12.5,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null,
      },
      timestamp: Date.parse("2026-11-14T20:00:02.000Z"),
    } as GeolocationPosition);

    await expect(capture.promise).resolves.toEqual({
      status: "captured", latitude: 19.076, longitude: 72.8777,
      accuracyMeters: 12.5, fixAt: "2026-11-14T20:00:02.000Z", gpsProvider: "device",
    });
    expect(capture.completedAt()).toEqual(expect.any(Number));
  });

  it("records permission denial as unavailable evidence instead of rejecting submission", async () => {
    let failure: ((error: GeolocationPositionError) => void) | undefined;
    const geolocation = {
      getCurrentPosition(_success: unknown, callback: (error: GeolocationPositionError) => void) {
        failure = callback;
      },
    } as unknown as Geolocation;
    const capture = beginFuelLocationCapture(geolocation);
    failure!({
      code: 1, message: "permission denied",
      PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
    } as GeolocationPositionError);
    await expect(capture.promise).resolves.toEqual({
      status: "permission_denied", reason: "permission_denied",
    });
    expect(capture.completedAt()).toEqual(expect.any(Number));
  });

  it("reports unsupported location without throwing", async () => {
    const capture = beginFuelLocationCapture(undefined);
    await expect(capture.promise).resolves.toEqual({
      status: "unavailable", reason: "geolocation_unsupported",
    });
  });
});
