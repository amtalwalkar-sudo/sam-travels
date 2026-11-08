import { describe, expect, it, vi } from "vitest";
import { NetworkAccessDisabledError } from "../packages/core/src/network";
import { GeoapifyProxyReverseGeocoder, TimelineReverseGeocodingService } from "../packages/application/src/timeline-reverse-geocoding";
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
  it("sends coordinates to the application proxy without exposing a provider key", async () => {
    const request = vi.fn(async (input: string, init?: RequestInit) => {
      expect(input).toBe("https://geocoder.example/reverse-geocode");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json" });
      expect(init?.body).toBe(JSON.stringify({ latitude: 19.076, longitude: 72.8777 }));
      expect(JSON.stringify(init)).not.toContain("apiKey");
      return new Response(JSON.stringify({ label: "Andheri, Mumbai, Maharashtra, India" }), { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = new GeoapifyProxyReverseGeocoder("https://geocoder.example", request);
    await expect(adapter.reverse(19.076, 72.8777)).resolves.toBe("Andheri, Mumbai, Maharashtra, India");
  });

  it("does not make a request when the proxy endpoint is not configured", async () => {
    const request = vi.fn() as unknown as typeof fetch;
    const adapter = new GeoapifyProxyReverseGeocoder("", request);
    await expect(adapter.reverse(19.076, 72.8777)).rejects.toThrow("geocoding_proxy_not_configured");
    expect(request).not.toHaveBeenCalled();
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
    const reverse = vi.fn(async () => { throw new Error("service unavailable"); });
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "geoapify", reverse });
    const result = await service.enrich([event("one"), event("two", "some_non_location_event")]);
    expect(result.one.status).toBe("unavailable");
    expect(result.two).toBeUndefined();
  });

  it("negative-caches no-result lookups", async () => {
    const reverse = vi.fn(async () => undefined);
    const service = new TimelineReverseGeocodingService({ run: operation => operation() }, { provider: "geoapify", reverse });
    const result = await service.enrich([event("one"), event("two", "shift_end")]);
    expect(result.one.status).toBe("not_found");
    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it("does not start a queued request after its lookup has been cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn(async () => new Response(JSON.stringify({ label: "Mumbai" }), { status: 200 })) as unknown as typeof fetch;
    const adapter = new GeoapifyProxyReverseGeocoder("https://geocoder.example", request);
    await expect(adapter.reverse(19.076, 72.8777, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
});
