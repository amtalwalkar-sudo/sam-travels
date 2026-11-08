import { NetworkAccessDisabledError, type NetworkGateway } from "../../core/src/network";
import type { DriverEvent } from "../../domain/src/driver-workflow";

export type TimelineLocationStatus = "resolved" | "not_found" | "pending" | "network_disabled" | "unavailable";
export type TimelineLocationEnrichment = Readonly<{
  status: TimelineLocationStatus;
  label?: string;
  provider?: "openstreetmap_nominatim";
  lookedUpAt?: string;
}>;
export type TimelineLocationMap = Readonly<Record<string, TimelineLocationEnrichment>>;

/** Replaceable adapter port. Implementations receive only one event's GPS coordinates. */
export interface ReverseGeocoderAdapter {
  readonly provider: string;
  reverse(latitude: number, longitude: number, signal?: AbortSignal): Promise<string | undefined>;
}

/*
 * Nominatim's public service permits at most one request per second. Keep one
 * module-wide queue so Timeline service instances in this app share the same
 * start-to-start throttle. Browser fetch supplies the page referrer; the app
 * does not attempt to spoof a User-Agent header.
 */
let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimRequestAt = 0;

function scheduleNominatimRequest<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const result = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, 1000 - (Date.now() - lastNominatimRequestAt));
    if (waitMs > 0) await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
    lastNominatimRequestAt = Date.now();
    return operation();
  });
  nominatimQueue = result.then(() => undefined, () => undefined);
  return result;
}

/** Public OpenStreetMap Nominatim adapter; no account or API key is required. */
export class OpenStreetMapNominatimReverseGeocoder implements ReverseGeocoderAdapter {
  readonly provider = "openstreetmap_nominatim";
  constructor(private readonly request: typeof fetch = fetch) {}

  async reverse(latitude: number, longitude: number, signal?: AbortSignal): Promise<string | undefined> {
    return scheduleNominatimRequest(async () => {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));
      url.searchParams.set("zoom", "18");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "en");
      const response = await this.request(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        referrerPolicy: "strict-origin-when-cross-origin",
        signal,
      });
      if (!response.ok) throw new Error("nominatim_http_" + response.status);
      const body = await response.json() as { address?: Record<string, unknown>; error?: string };
      if (body.error || !body.address) return undefined;
      const address = body.address;
      const parts = [
        address.suburb, address.neighbourhood, address.city_district,
        address.town, address.city, address.village, address.municipality,
        address.county, address.state,
      ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
      const unique = [...new Set(parts.map(part => part.trim()))];
      return unique.length ? unique.join(", ") : undefined;
    }, signal);
  }
}

type CacheEntry = Readonly<{ label?: string; expiresAt: number; lookedUpAt: string }>;
const ENRICHMENT_EVENT_TYPES = new Set([
  "shift_start", "shift_end", "trip_create", "start_ride", "end_ride", "cancel_ride", "trip_start", "trip_end", "ride_cancel", "trip_completed",
]);

/**
 * Optional read-only enrichment. Positive and negative cache entries are
 * session-local; immutable source GPS evidence and Timeline business persistence
 * are untouched. Requests are serialized and throttled by the Nominatim adapter.
 */
export class TimelineReverseGeocodingService {
  private readonly cache = new Map<string, CacheEntry>();
  constructor(
    private readonly gateway: Pick<NetworkGateway, "run">,
    private readonly adapter: ReverseGeocoderAdapter,
    private readonly now: () => number = Date.now,
    private readonly successTtlMs = 30 * 24 * 60 * 60 * 1000,
    private readonly negativeTtlMs = 60 * 60 * 1000,
  ) {}

  async enrich(events: readonly DriverEvent[], signal?: AbortSignal): Promise<TimelineLocationMap> {
    const result: Record<string, TimelineLocationEnrichment> = {};
    for (const event of events) {
      if (signal?.aborted) break;
      const gps = event.gps;
      if (!ENRICHMENT_EVENT_TYPES.has(event.command.eventType) || !gps ||
          !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) continue;
      const key = this.cacheKey(gps.latitude, gps.longitude);
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > this.now()) {
        result[event.eventId] = cached.label
          ? { status: "resolved", label: cached.label, provider: "openstreetmap_nominatim", lookedUpAt: cached.lookedUpAt }
          : { status: "not_found", provider: "openstreetmap_nominatim", lookedUpAt: cached.lookedUpAt };
        continue;
      }
      try {
        const label = await this.gateway.run(() => this.adapter.reverse(gps.latitude, gps.longitude, signal));
        const lookedUpAt = new Date(this.now()).toISOString();
        this.cache.set(key, {
          label, lookedUpAt,
          expiresAt: this.now() + (label ? this.successTtlMs : this.negativeTtlMs),
        });
        result[event.eventId] = label
          ? { status: "resolved", label, provider: "openstreetmap_nominatim", lookedUpAt }
          : { status: "not_found", provider: "openstreetmap_nominatim", lookedUpAt };
      } catch (cause) {
        if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) break;
        result[event.eventId] = {
          status: cause instanceof NetworkAccessDisabledError ? "network_disabled" : "unavailable",
          provider: "openstreetmap_nominatim",
        };
      }
    }
    return Object.freeze(result);
  }

  private cacheKey(latitude: number, longitude: number): string {
    // Cache keys coalesce GPS jitter (~11 m at 4 decimals); requests retain original coordinate values.
    return latitude.toFixed(4) + "," + longitude.toFixed(4);
  }
}
