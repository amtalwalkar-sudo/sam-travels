import type { AtomicRecordRepository, RecordRepository } from "../../core/src/repositories";
import { RECORD_ENVELOPE_SCHEMA_VERSION } from "../../core/src/persistence-contract";
import type { RecordEnvelope } from "../../core/src/types";
import { assertHistoricalTripBackfillV1, type HistoricalTripBackfillV1 } from "../../domain/src/historical-trip-backfill";
import { validateCompletedTripFinancialSubmission } from "./driver-form-definitions";

export const HISTORICAL_TRIP_BACKFILL_PREFIX = "historical-trip-backfill:";

/** Asia/Kolkata operational date: the business day rolls at 04:00 local time. */
export function historicalTripOperationalDateFromInstant(instant: string): string {
  const epoch = Date.parse(instant);
  if (!Number.isFinite(epoch)) throw new Error("historical_trip_backfill_interval_invalid");
  return new Date(epoch + 90 * 60_000).toISOString().slice(0, 10);
}

export type HistoricalTripBackfillActorProviderV1 = Readonly<{
  currentActor(): Promise<Readonly<{ role: "driver" | "admin"; actorId: string }>>;
}>;

export type SubmitHistoricalTripBackfillV1 = Readonly<{
  backfillId: string;
  driverId: string;
  vehicleId: string;
  operationalDate: string;
  startedAt: string;
  endedAt: string;
  farePaise: number;
  tollPaise?: number;
  tollPayer?: "driver" | "customer";
  parkingPaise?: number;
  parkingPayer?: "driver" | "customer";
  reason: string;
}>;

/** Append-only administrative record for a trip omitted from Work history. Never writes Work events. */
export class HistoricalTripBackfillServiceV1 {
  constructor(
    private readonly records: RecordRepository & AtomicRecordRepository,
    private readonly actorProvider: HistoricalTripBackfillActorProviderV1,
    private readonly source: RecordEnvelope<unknown>["source"],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async list(): Promise<readonly RecordEnvelope<HistoricalTripBackfillV1>[]> {
    const rows = await this.records.list<HistoricalTripBackfillV1>();
    return rows.filter(row => row.id.startsWith(HISTORICAL_TRIP_BACKFILL_PREFIX) && !row.deletedAt)
      .map(row => { assertHistoricalTripBackfillV1(row.data); return row; })
      .sort((a, b) => b.data.startedAt.localeCompare(a.data.startedAt) || a.id.localeCompare(b.id));
  }

  async submit(input: SubmitHistoricalTripBackfillV1): Promise<RecordEnvelope<HistoricalTripBackfillV1>> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.backfillId) ||
        typeof input.driverId !== "string" || !input.driverId.trim() ||
        typeof input.vehicleId !== "string" || !input.vehicleId.trim() ||
        typeof input.operationalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate) ||
        !Number.isSafeInteger(input.farePaise) || input.farePaise < 0 ||
        typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 1000) {
      throw new Error("historical_trip_backfill_command_invalid");
    }
    const financialIssues = validateCompletedTripFinancialSubmission({
      tripId: input.backfillId, farePaise: input.farePaise,
      tollPaise: input.tollPaise, tollPayer: input.tollPayer,
      parkingPaise: input.parkingPaise, parkingPayer: input.parkingPayer,
    });
    if (financialIssues.length) throw new Error("historical_trip_backfill_financials_invalid:" + financialIssues[0]);
    const start = Date.parse(input.startedAt), end = Date.parse(input.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error("historical_trip_backfill_interval_invalid");
    }
    if (historicalTripOperationalDateFromInstant(input.startedAt) !== input.operationalDate) {
      throw new Error("historical_trip_backfill_operational_date_mismatch");
    }
    const actor = await this.actorProvider.currentActor();
    if (!actor || actor.role !== "admin" || !/^[A-Za-z0-9_-]{1,128}$/.test(actor.actorId)) {
      throw new Error("historical_trip_backfill_admin_required");
    }
    const id = HISTORICAL_TRIP_BACKFILL_PREFIX + input.backfillId;
    const existing = await this.records.get<HistoricalTripBackfillV1>(id);
    const recordedAt = this.now();
    const sameIntent = (value: HistoricalTripBackfillV1) =>
      value.backfillId === input.backfillId && value.driverId === input.driverId.trim() &&
      value.vehicleId === input.vehicleId.trim() && value.operationalDate === input.operationalDate &&
      value.startedAt === new Date(start).toISOString() && value.endedAt === new Date(end).toISOString() &&
      value.farePaise === input.farePaise && value.tollPaise === input.tollPaise &&
      value.tollPayer === input.tollPayer && value.parkingPaise === input.parkingPaise &&
      value.parkingPayer === input.parkingPayer && value.reason === input.reason.trim() &&
      value.actor.role === actor.role && value.actor.actorId === actor.actorId;
    const data: HistoricalTripBackfillV1 = Object.freeze({
      schemaVersion: 1, kind: "historical_trip_backfill", backfillId: input.backfillId,
      status: "submitted", attribution: "admin_declared",
      driverId: input.driverId.trim(), vehicleId: input.vehicleId.trim(),
      operationalDate: input.operationalDate, startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(), farePaise: input.farePaise,
      ...(input.tollPaise !== undefined ? { tollPaise: input.tollPaise, tollPayer: input.tollPayer! } : {}),
      ...(input.parkingPaise !== undefined ? { parkingPaise: input.parkingPaise, parkingPayer: input.parkingPayer! } : {}),
      reason: input.reason.trim(), recordedAt,
      actor: Object.freeze({ role: "admin", actorId: actor.actorId }),
    });
    assertHistoricalTripBackfillV1(data);
    if (existing) {
      assertHistoricalTripBackfillV1(existing.data);
      if (sameIntent(existing.data)) return existing;
      throw new Error("historical_trip_backfill_id_reused");
    }
    const envelope: RecordEnvelope<HistoricalTripBackfillV1> = {
      id, schemaVersion: RECORD_ENVELOPE_SCHEMA_VERSION, createdAt: recordedAt, updatedAt: recordedAt,
      businessDate: input.operationalDate, source: this.source, revision: 1,
      createdBy: { personId: actor.actorId, role: "admin" }, data,
    };
    if (!await this.records.compareAndSet(id, null, envelope)) {
      const replay = await this.records.get<HistoricalTripBackfillV1>(id);
      if (replay && sameIntent(replay.data)) return replay;
      throw new Error("historical_trip_backfill_conflict");
    }
    return envelope;
  }
}
