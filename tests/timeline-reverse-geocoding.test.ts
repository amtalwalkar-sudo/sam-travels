import { describe, expect, it, vi } from "vitest";
import { NetworkAccessDisabledError } from "../packages/core/src/network";
import { OpenStreetMapNominatimReverseGeocoder, TimelineReverseGeocodingService } from "../packages/application/src/timeline-reverse-geocoding";
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
  it("uses public Nominatim without credentials and normalizes locality components", async () => {
    const request = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe("https://nominatim.openstreetmap.org");
      expect(url.pathname).toBe("/reverse");
      expect(url.searchParams.get("format")).toBe("jsonv2");
      expect(url.searchParams.get("lat")).toBe("19.076");
      expect(url.searchParams.get("lon")).toBe("72.8777");
      expect(url.searchParams.has("apiKey")).toBe(false);
      expect(init?.headers).toEqual({ Accept: "application/json" });
      expect(init?.referrerPolicy).toBe("strict-origin-when-cross-origin");
      return new Response(JSON.stringify({ address: { suburb: "Andheri", city: "Mumbai", state: "Maharashtra" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = new OpenStreetMapNominatimReverseGeocoder(request);
    await expect(adapter.reverse(19.076, 72.8777)).resolves.toBe("Andheri, Mumbai, Maharashtra");
  });

  it("caches successful lookups across event IDs sharing rounded coordinates", async () => {
    const reverse = vi.fn(async () => "Mumbai, Maharashtra");
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "openstreetmap_nominatim", reverse });
    const result = await service.enrich([event("one"), event("two", "shift_end", 19.07601, 72.87771)]);
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(result.one.status).toBe("resolved");
    expect(result.two.label).toBe("Mumbai, Maharashtra");
  });

  it("degrades gracefully when internet policy is disabled", async () => {
    const reverse = vi.fn(async () => "Mumbai");
    const service = new TimelineReverseGeocodingService({
      run: async () => { throw new NetworkAccessDisabledError(); },
    }, { provider: "openstreetmap_nominatim", reverse });
    const result = await service.enrich([event("one")]);
    expect(result.one.status).toBe("network_disabled");
    expect(reverse).not.toHaveBeenCalled();
  });

  it("isolates provider errors and skips non-location lifecycle events", async () => {
    const reverse = vi.fn(async () => { throw new Error("service unavailable"); });
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "openstreetmap_nominatim", reverse });
    const result = await service.enrich([event("one"), event("two", "some_non_location_event")]);
    expect(result.one.status).toBe("unavailable");
    expect(result.two).toBeUndefined();
  });

  it("negative-caches no-result lookups", async () => {
    const reverse = vi.fn(async () => undefined);
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "openstreetmap_nominatim", reverse });
    const result = await service.enrich([event("one"), event("two", "shift_end")]);
    expect(result.one.status).toBe("not_found");
    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it("serializes public-service requests at no more than one start per second", async () => {
    vi.useFakeTimers();
    try {
      const starts: number[] = [];
      const request = vi.fn(async () => {
        starts.push(Date.now());
        return new Response(JSON.stringify({ address: { city: "Mumbai" } }), { status: 200 });
      }) as unknown as typeof fetch;
      const adapter = new OpenStreetMapNominatimReverseGeocoder(request);
      const first = adapter.reverse(19.076, 72.8777);
      const second = adapter.reverse(19.077, 72.8778);
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all([first, second]);
      expect(starts).toHaveLength(2);
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});
