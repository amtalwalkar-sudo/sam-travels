import { describe, expect, it, vi } from "vitest";
import { NetworkAccessDisabledError } from "../packages/core/src/network";
import { GeoapifyReverseGeocoder, TimelineReverseGeocodingService } from "../packages/application/src/timeline-reverse-geocoding";
import type { DriverEvent } from "../packages/domain/src/driver-workflow";

function event(id: string, eventType = "shift_start", latitude = 19.076, longitude = 72.8777): DriverEvent {
  return {
    eventId: id,
    command: { eventType, transitionAt: "2026-11-08T03:00:00.000Z" },
    gps: { latitude, longitude, horizontalAccuracyM: 8, fixAt: "2026-11-08T03:00:00.000Z", provider: "fixture" },
    committedAt: "2026-11-08T03:00:00.000Z",
    revision: 1,
  } as unknown as DriverEvent;
}

describe("Timeline reverse geocoding", () => {
  it("maps Geoapify locality components and uses the configured key", async () => {
    const request = vi.fn(async (url: string) => {
      expect(url).toContain("apiKey=deployment-key");
      return new Response(JSON.stringify({ features: [{ properties: { suburb: "Andheri", city: "Mumbai", state: "Maharashtra" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = new GeoapifyReverseGeocoder("deployment-key", request);
    await expect(adapter.reverse(19.076, 72.8777)).resolves.toBe("Andheri, Mumbai, Maharashtra");
  });

  it("caches successful lookups across event IDs sharing rounded coordinates", async () => {
    const reverse = vi.fn(async () => "Mumbai, Maharashtra");
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "geoapify", reverse });
    const result = await service.enrich([event("one"), event("two", "shift_end", 19.07601, 72.87771)]);
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(result.one.status).toBe("resolved");
    expect(result.two.label).toBe("Mumbai, Maharashtra");
  });

  it("degrades gracefully when internet policy is disabled", async () => {
    const reverse = vi.fn(async () => "Mumbai");
    const service = new TimelineReverseGeocodingService({
      run: async () => { throw new NetworkAccessDisabledError(); },
    }, { provider: "geoapify", reverse });
    const result = await service.enrich([event("one")]);
    expect(result.one.status).toBe("network_disabled");
    expect(reverse).not.toHaveBeenCalled();
  });

  it("isolates provider errors and skips non-location lifecycle events", async () => {
    const reverse = vi.fn(async () => { throw new Error("quota"); });
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "geoapify", reverse });
    const result = await service.enrich([event("one"), event("two", "some_non_location_event")]);
    expect(result.one.status).toBe("unavailable");
    expect(result.two).toBeUndefined();
  });

  it("represents missing configuration and negative-caches no-result lookups", async () => {
    const missing = new TimelineReverseGeocodingService({ run: operation => operation() });
    expect((await missing.enrich([event("one")])).one.status).toBe("configuration_missing");
    const reverse = vi.fn(async () => undefined);
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "geoapify", reverse });
    const result = await service.enrich([event("one"), event("two", "shift_end")]);
    expect(result.one.status).toBe("not_found");
    expect(reverse).toHaveBeenCalledTimes(1);
  });
});
