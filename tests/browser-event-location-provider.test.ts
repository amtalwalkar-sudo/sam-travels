import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserEventLocationProvider } from "../apps/web/src/driver-workflow";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser event GPS acquisition", () => {
  it("keeps sampling after a poor fix and resolves only on a compliant fix", async () => {
    let onPosition: PositionCallback | undefined;
    const clearWatch = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: {
        watchPosition: (success: PositionCallback) => {
          onPosition = success;
          return 17;
        },
        clearWatch,
      },
    });

    const transitionAt = new Date().toISOString();
    const pending = new BrowserEventLocationProvider().capture(transitionAt);
    const position = (accuracy: number): GeolocationPosition => ({
      coords: {
        latitude: 19.076,
        longitude: 72.8777,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    });

    onPosition?.(position(82));
    onPosition?.(position(24));

    await expect(pending).resolves.toMatchObject({
      latitude: 19.076,
      longitude: 72.8777,
      horizontalAccuracyM: 24,
      provider: "browser-geolocation",
    });
    expect(clearWatch).toHaveBeenCalledWith(17);
  });

  it("does not start acquisition after the original evidence window expires", async () => {
    const watchPosition = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: { watchPosition, clearWatch: vi.fn() },
    });
    const transitionAt = new Date(Date.now() - 31_000).toISOString();

    await expect(new BrowserEventLocationProvider().capture(transitionAt)).rejects.toThrow(
      "gps_recovery_window_expired",
    );
    expect(watchPosition).not.toHaveBeenCalled();
  });
  it("keeps watching after transient timeout and position-unavailable errors", async () => {
    let onPosition: PositionCallback | undefined;
    let onError: PositionErrorCallback | undefined;
    const clearWatch = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: {
        watchPosition: (success: PositionCallback, error: PositionErrorCallback) => {
          onPosition = success;
          onError = error;
          return 23;
        },
        clearWatch,
      },
    });
    const transitionAt = new Date().toISOString();
    const pending = new BrowserEventLocationProvider().capture(transitionAt);

    onError?.({ code: 3, message: "temporary timeout", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    onError?.({ code: 2, message: "position unavailable", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    onPosition?.({
      coords: {
        latitude: 19.076, longitude: 72.8777, accuracy: 20, altitude: null,
        altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}),
      },
      timestamp: Date.now(), toJSON: () => ({}),
    } as GeolocationPosition);

    await expect(pending).resolves.toMatchObject({ horizontalAccuracyM: 20 });
    expect(clearWatch).toHaveBeenCalledWith(23);
  });

});
