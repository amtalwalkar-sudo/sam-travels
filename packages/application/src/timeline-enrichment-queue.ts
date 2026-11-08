import type { NetworkGateway } from "../../core/src/network";
import type { RecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { DriverEvent } from "../../domain/src/driver-workflow";
import type { ReverseGeocoderAdapter, TimelineLocationEnrichment, TimelineLocationMap } from "./timeline-reverse-geocoding";

export const TIMELINE_ENRICHMENT_RECORD_PREFIX = "timeline-enrichment:";
const MAX_BATCH_SIZE = 5;
const SUCCESS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000;

export type TimelineEnrichmentRecord = Readonly<{
  eventId: string;
  latitude: number;
  longitude: number;
  status: "pending" | "retry_wait" | "resolved" | "not_found" | "network_disabled";
  label?: string;
  provider: "geoapify";
  lookedUpAt?: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt?: string;
  lastFailure?: string;
}>;

const eligibleEvents = new Set([
  "shift_start", "shift_end", "trip_create", "start_ride", "end_ride",
  "cancel_ride", "trip_start", "trip_end", "ride_cancel", "trip_completed",
]);

function recordId(eventId: string) {
  return TIMELINE_ENRICHMENT_RECORD_PREFIX + eventId;
}

/**
 * Durable, separately-owned derived data. Source DriverEvent rows are only read;
 * every status/result is stored in a platform RecordRepository record of its own.
 */
export class TimelineEnrichmentQueue {
  constructor(
    private readonly records: RecordRepository,
    private readonly gateway: Pick<NetworkGateway, "run">,
    private readonly adapter: ReverseGeocoderAdapter,
    private readonly now: () => number = Date.now,
  ) {}
  private draining = false;

  async enqueue(events: readonly DriverEvent[]): Promise<void> {
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const resolvedCoordinates = new Map<string, TimelineEnrichmentRecord>();
    const existing = (await this.records.list<TimelineEnrichmentRecord>())
      .filter(row => row.id.startsWith(TIMELINE_ENRICHMENT_RECORD_PREFIX));
    for (const row of existing) {
      const data = row.data;
      if ((data.status !== "resolved" && data.status !== "not_found") || !data.lookedUpAt) continue;
      const age = nowMs - Date.parse(data.lookedUpAt);
      const ttl = data.status === "resolved" ? SUCCESS_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
      if (!Number.isFinite(age) || age < 0 || age > ttl) continue;
      resolvedCoordinates.set(this.coordinateKey(data.latitude, data.longitude), data);
    }
    for (const event of events) {
      const gps = event.gps;
      if (!eligibleEvents.has(event.command.eventType) || !gps ||
          !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude) ||
          gps.latitude < -90 || gps.latitude > 90 || gps.longitude < -180 || gps.longitude > 180) continue;
      const id = recordId(event.eventId);
      if (await this.records.get<TimelineEnrichmentRecord>(id)) continue;
      const next: RecordEnvelope<TimelineEnrichmentRecord> = {
        id, schemaVersion: 1, createdAt: now, updatedAt: now, source: "integration", revision: 1,
        data: (() => {
          const cached = resolvedCoordinates.get(this.coordinateKey(gps.latitude, gps.longitude));
          return {
            eventId: event.eventId, latitude: gps.latitude, longitude: gps.longitude,
            status: cached?.status ?? "pending", provider: "geoapify" as const,
            createdAt: now, attempts: 0,
            ...(cached?.label ? { label: cached.label } : {}),
            ...(cached?.lookedUpAt ? { lookedUpAt: cached.lookedUpAt } : {}),
          };
        })(),
      };
      await this.records.put(next);
    }
  }

  async drain(limit = MAX_BATCH_SIZE, signal?: AbortSignal): Promise<TimelineLocationMap> {
    if (this.draining) return Object.freeze({});
    this.draining = true;
    try {
    const nowMs = this.now();
    const all = (await this.records.list<TimelineEnrichmentRecord>())
      .filter(row => row.id.startsWith(TIMELINE_ENRICHMENT_RECORD_PREFIX))
      .filter(row => (row.data.status === "pending" || row.data.status === "network_disabled") ||
        (row.data.status === "retry_wait" && (!row.data.nextAttemptAt || Date.parse(row.data.nextAttemptAt) <= nowMs)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, Math.max(1, Math.min(limit, MAX_BATCH_SIZE)));
    const result: Record<string, TimelineLocationEnrichment> = {};
    for (const row of all) {
      if (signal?.aborted) break;
      try {
        const label = await this.gateway.run(() =>
          this.adapter.reverse(row.data.latitude, row.data.longitude, signal));
        const lookedUpAt = new Date(this.now()).toISOString();
        const resolved = !!label;
        const data: TimelineEnrichmentRecord = {
          ...row.data, status: resolved ? "resolved" : "not_found",
          label, lookedUpAt, attempts: row.data.attempts + 1,
          nextAttemptAt: undefined, lastFailure: undefined,
        };
        await this.writeNext(row, data, lookedUpAt);
        result[row.data.eventId] = resolved
          ? { status: "resolved", label, provider: "geoapify", lookedUpAt }
          : { status: "not_found", provider: "geoapify", lookedUpAt };
      } catch (cause) {
        if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) break;
        const disabled = cause instanceof Error && cause.name === "NetworkAccessDisabledError";
        const attempts = row.data.attempts + 1;
        const delayMs = Math.min(6 * 60 * 60 * 1000, 30_000 * (2 ** Math.min(attempts - 1, 10)));
        const data: TimelineEnrichmentRecord = {
          ...row.data, status: disabled ? "network_disabled" : "retry_wait",
          attempts, lastFailure: disabled ? "network_disabled" : "provider_unavailable",
          nextAttemptAt: disabled ? undefined : new Date(this.now() + delayMs).toISOString(),
        };
        await this.writeNext(row, data, new Date(this.now()).toISOString());
        result[row.data.eventId] = { status: disabled ? "network_disabled" : "unavailable", provider: "geoapify" };
      }
    }
    return Object.freeze(result);
    } finally {
      this.draining = false;
    }
  }

  async locations(eventIds: readonly string[]): Promise<TimelineLocationMap> {
    const result: Record<string, TimelineLocationEnrichment> = {};
    for (const eventId of eventIds) {
      const row = await this.records.get<TimelineEnrichmentRecord>(recordId(eventId));
      if (!row) continue;
      const data = row.data;
      result[eventId] = {
        status: data.status === "retry_wait" ? "unavailable" : data.status,
        ...(data.label ? { label: data.label } : {}),
        provider: data.provider,
        ...(data.lookedUpAt ? { lookedUpAt: data.lookedUpAt } : {}),
      };
    }
    return Object.freeze(result);
  }

  /** Earliest persisted wake-up time for one-shot PWA scheduling; undefined means no work. */
  async nextWakeAt(): Promise<number | undefined> {
    const rows = (await this.records.list<TimelineEnrichmentRecord>())
      .filter(row => row.id.startsWith(TIMELINE_ENRICHMENT_RECORD_PREFIX))
      .filter(row => row.data.status === "pending" || row.data.status === "network_disabled" || row.data.status === "retry_wait");
    if (!rows.length) return undefined;
    const times = rows.map(row => row.data.status === "retry_wait" && row.data.nextAttemptAt
      ? Date.parse(row.data.nextAttemptAt) : this.now());
    const valid = times.filter(Number.isFinite);
    return valid.length ? Math.min(...valid) : this.now();
  }

  async drainDueRetries(limit = MAX_BATCH_SIZE, signal?: AbortSignal) {
    return this.drain(limit, signal);
  }

  private coordinateKey(latitude: number, longitude: number) {
    return latitude.toFixed(4) + "," + longitude.toFixed(4);
  }

  private async writeNext(
    current: RecordEnvelope<TimelineEnrichmentRecord>,
    data: TimelineEnrichmentRecord,
    updatedAt: string,
  ) {
    const next: RecordEnvelope<TimelineEnrichmentRecord> = {
      ...current, updatedAt, revision: current.revision + 1, data,
    };
    const repository = this.records as RecordRepository & {
      compareAndSet?: (id: string, expectedRevision: number | null, next: RecordEnvelope<unknown>) => Promise<boolean>;
    };
    if (repository.compareAndSet) {
      const committed = await repository.compareAndSet(current.id, current.revision, next);
      if (!committed) throw new Error("timeline_enrichment_revision_conflict");
    } else {
      await this.records.put(next);
    }
  }
}
