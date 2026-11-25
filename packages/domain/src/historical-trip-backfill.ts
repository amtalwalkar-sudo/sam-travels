export type HistoricalTripBackfillV1 = Readonly<{
  schemaVersion: 1;
  kind: "historical_trip_backfill";
  backfillId: string;
  status: "submitted";
  attribution: "admin_declared";
  driverId: string;
  vehicleId: string;
  operationalDate: string;
  startedAt: string;
  endedAt: string;
  farePaise: number;
  reason: string;
  recordedAt: string;
  actor: Readonly<{ role: "admin"; actorId: string }>;
}>;

export function assertHistoricalTripBackfillV1(value: unknown): asserts value is HistoricalTripBackfillV1 {
  if (!value || typeof value !== "object") throw new Error("historical_trip_backfill_invalid");
  const row = value as Record<string, unknown>;
  const actor = row.actor as Record<string, unknown> | undefined;
  const start = typeof row.startedAt === "string" ? Date.parse(row.startedAt) : NaN;
  const end = typeof row.endedAt === "string" ? Date.parse(row.endedAt) : NaN;
  if (row.schemaVersion !== 1 || row.kind !== "historical_trip_backfill" ||
      typeof row.backfillId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.backfillId) ||
      row.status !== "submitted" || row.attribution !== "admin_declared" ||
      typeof row.driverId !== "string" || !row.driverId.trim() ||
      typeof row.vehicleId !== "string" || !row.vehicleId.trim() ||
      typeof row.operationalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.operationalDate) ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      new Date(start + 90 * 60_000).toISOString().slice(0, 10) !== row.operationalDate ||
      !Number.isSafeInteger(row.farePaise) || (row.farePaise as number) < 0 ||
      typeof row.reason !== "string" || !row.reason.trim() || row.reason.length > 1000 ||
      typeof row.recordedAt !== "string" || !Number.isFinite(Date.parse(row.recordedAt)) ||
      !actor || actor.role !== "admin" || typeof actor.actorId !== "string" || !actor.actorId.trim() ||
      "eventId" in row || "startEventId" in row || "endEventId" in row || "gps" in row ||
      "startGps" in row || "endGps" in row || "shiftId" in row) {
    throw new Error("historical_trip_backfill_invalid");
  }
}
