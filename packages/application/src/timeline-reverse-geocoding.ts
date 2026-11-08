import { NetworkAccessDisabledError, type NetworkGateway } from "../../core/src/network";
import type { DriverEvent } from "../../domain/src/driver-workflow";

export type TimelineLocationStatus = "resolved" | "not_found" | "pending" | "network_disabled" | "unavailable";
export type TimelineLocationEnrichment = Readonly<{
  status: TimelineLocationStatus;
  label?: string;
  provider?: "geoapify";
  lookedUpAt?: string;
}>;
export type TimelineLocationMap = Readonly<Record<string, TimelineLocationEnrichment>>;

export interface ReverseGeocoderAdapter {
  readonly provider: string;
  reverse(latitude: number, longitude: number, signal?: AbortSignal): Promise<string | undefined>;
}

function configuredProxyUrl(): string {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  return meta.env?.VITE_GEOAPIFY_PROXY_URL?.trim() ?? "";
}

/** Calls the Sam Travels proxy; the Geoapify credential never reaches the client. */
export class GeoapifyProxyReverseGeocoder implements ReverseGeocoderAdapter {
  readonly provider = "geoapify";
  constructor(
    private readonly endpoint = configuredProxyUrl(),
    private readonly request: typeof fetch = fetch,
  ) {}

  async reverse(latitude: number, longitude: number, signal?: AbortSignal): Promise<string | undefined> {
    if (!this.endpoint) throw new Error("geocoding_proxy_not_configured");
    const url = new URL("reverse-geocode", this.endpoint.endsWith("/") ? this.endpoint : this.endpoint + "/");
    const response = await this.request(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ latitude, longitude }),
      signal,
    });
    if (!response.ok) throw new Error("geoapify_proxy_http_" + response.status);
    const body = await response.json() as { label?: unknown };
    return typeof body.label === "string" && body.label.trim() ? body.label.trim() : undefined;
  }
}

type CacheEntry = Readonly<{ label?: string; expiresAt: number; lookedUpAt: string }>;
const ENRICHMENT_EVENT_TYPES = new Set([
  "shift_start", "shift_end", "trip_create", "start_ride", "end_ride", "cancel_ride", "trip_start", "trip_end", "ride_cancel", "trip_completed",
]);

/**
 * Optional read-only enrichment. Positive and negative cache entries are
 * session-local; immutable source GPS evidence and Timeline business persistence
 * are untouched. Calls are made sequentially and protected by the proxy rate limit.
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
          ? { status: "resolved", label: cached.label, provider: "geoapify", lookedUpAt: cached.lookedUpAt }
          : { status: "not_found", provider: "geoapify", lookedUpAt: cached.lookedUpAt };
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
          ? { status: "resolved", label, provider: "geoapify", lookedUpAt }
          : { status: "not_found", provider: "geoapify", lookedUpAt };
      } catch (cause) {
        if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) break;
        result[event.eventId] = {
          status: cause instanceof NetworkAccessDisabledError ? "network_disabled" : "unavailable",
          provider: "geoapify",
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
