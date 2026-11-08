import { NetworkAccessDisabledError, type NetworkGateway } from "../../core/src/network";
import type { DriverEvent } from "../../domain/src/driver-workflow";

export type TimelineLocationStatus = "resolved" | "not_found" | "pending" | "network_disabled" | "configuration_missing" | "unavailable";
export type TimelineLocationEnrichment = Readonly<{
  status: TimelineLocationStatus;
  label?: string;
  provider?: "geoapify";
  lookedUpAt?: string;
}>;
export type TimelineLocationMap = Readonly<Record<string, TimelineLocationEnrichment>>;

/** Replaceable adapter port. Implementations receive only one event's GPS coordinates. */
export interface ReverseGeocoderAdapter {
  readonly provider: string;
  reverse(latitude: number, longitude: number): Promise<string | undefined>;
}

/** Geoapify adapter; API key is supplied by deployment config, never committed. */
export class GeoapifyReverseGeocoder implements ReverseGeocoderAdapter {
  readonly provider = "geoapify";
  constructor(private readonly apiKey: string, private readonly request: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error("geoapify_api_key_missing");
  }

  async reverse(latitude: number, longitude: number): Promise<string | undefined> {
    const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("lang", "en");
    url.searchParams.set("format", "json");
    url.searchParams.set("apiKey", this.apiKey);
    const response = await this.request(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("geoapify_http_" + response.status);
    const body = await response.json() as { features?: Array<{ properties?: Record<string, unknown> }> };
    const properties = body.features?.[0]?.properties;
    if (!properties) return undefined;
    const parts = [
      properties.suburb, properties.neighbourhood, properties.district,
      properties.city, properties.county, properties.state,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    const unique = [...new Set(parts.map(part => part.trim()))];
    return unique.length ? unique.join(", ") : undefined;
  }
}

type CacheEntry = Readonly<{ label?: string; expiresAt: number; lookedUpAt: string }>;
const ENRICHMENT_EVENT_TYPES = new Set([
  "shift_start", "shift_end", "trip_create", "start_ride", "end_ride", "cancel_ride", "trip_start", "trip_end", "ride_cancel", "trip_completed",
]);

/**
 * Optional enrichment. Positive and negative cache entries are session-local;
 * immutable source GPS evidence and Timeline business persistence are untouched.
 */
export class TimelineReverseGeocodingService {
  private readonly cache = new Map<string, CacheEntry>();
  constructor(
    private readonly gateway: Pick<NetworkGateway, "run">,
    private readonly adapter?: ReverseGeocoderAdapter,
    private readonly now: () => number = Date.now,
    private readonly successTtlMs = 30 * 24 * 60 * 60 * 1000,
    private readonly negativeTtlMs = 60 * 60 * 1000,
  ) {}

  async enrich(events: readonly DriverEvent[]): Promise<TimelineLocationMap> {
    const result: Record<string, TimelineLocationEnrichment> = {};
    for (const event of events) {
      const gps = event.gps;
      if (!ENRICHMENT_EVENT_TYPES.has(event.command.eventType) || !gps ||
          !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) continue;
      if (!this.adapter) {
        result[event.eventId] = { status: "configuration_missing" };
        continue;
      }
      const key = this.cacheKey(gps.latitude, gps.longitude);
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > this.now()) {
        result[event.eventId] = cached.label
          ? { status: "resolved", label: cached.label, provider: "geoapify", lookedUpAt: cached.lookedUpAt }
          : { status: "not_found", provider: "geoapify", lookedUpAt: cached.lookedUpAt };
        continue;
      }
      try {
        const label = await this.gateway.run(() => this.adapter!.reverse(gps.latitude, gps.longitude));
        const lookedUpAt = new Date(this.now()).toISOString();
        this.cache.set(key, {
          label, lookedUpAt,
          expiresAt: this.now() + (label ? this.successTtlMs : this.negativeTtlMs),
        });
        result[event.eventId] = label
          ? { status: "resolved", label, provider: "geoapify", lookedUpAt }
          : { status: "not_found", provider: "geoapify", lookedUpAt };
      } catch (cause) {
        result[event.eventId] = {
          status: cause instanceof NetworkAccessDisabledError ? "network_disabled" : "unavailable",
          provider: "geoapify",
        };
      }
    }
    return Object.freeze(result);
  }

  private cacheKey(latitude: number, longitude: number): string {
    // Cache keys coalesce GPS jitter (~11 m at 4 decimals); requests retain original coordinates.
    return latitude.toFixed(4) + "," + longitude.toFixed(4);
  }
}
