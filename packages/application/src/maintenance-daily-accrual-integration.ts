import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { DriverEvent } from "../../domain/src/driver-workflow";
import type { FeatureRecordSource } from "./feature-record-service";
import type { MaintenanceDailyAccrualV1, MaintenanceService } from "./maintenance-service";

type DailyBusinessKilometresV1 = Readonly<{
  schemaVersion: 1;
  kind: "daily_business_kilometres";
  vehicleId: string;
  operationalDate: string;
  entries: readonly Readonly<{
    shiftId: string;
    shiftEndEventId: string;
    businessKm: number;
    allocationStatus: "allocated" | "awaiting_operational_boundary";
  }>[];
  totalBusinessKm: number;
  unallocatedBusinessKm: number;
}>;

/**
 * A day is complete only when Work commits its authoritative 04:00 rotation.
 * Ordinary shift ends are deliberately not accrued: another shift may still
 * contribute to the same operational date. The durable Work outbox replays
 * this integration after interruption, while Maintenance owns idempotency and
 * the immutable effective-rate snapshot.
 */
export async function accrueMaintenanceForCompletedWorkDay(input: {
  event: DriverEvent;
  records: Pick<AtomicRecordRepository, "list">;
  maintenance: Pick<MaintenanceService, "accrueDailyBusinessKilometres">;
  source: FeatureRecordSource;
}): Promise<RecordEnvelope<MaintenanceDailyAccrualV1> | undefined> {
  const { event } = input;
  if (event.command.workflowVersion !== 2 || event.command.eventType !== "shift_rotate") return undefined;
  const rotation = event.command.rotation;
  if (!rotation) throw new Error("maintenance_shift_rotation_context_missing");

  const matching: Array<{ record: RecordEnvelope<unknown>; data: DailyBusinessKilometresV1 }> = [];
  for (const record of await input.records.list<unknown>()) {
    if (!record.id.startsWith("work:daily-business-km:") || !record.data || typeof record.data !== "object") continue;
    const data = record.data as Partial<DailyBusinessKilometresV1>;
    if (data.kind !== "daily_business_kilometres" || !Array.isArray(data.entries)) continue;
    if (data.entries.some(entry => entry.shiftId === rotation.outgoingShiftId &&
        entry.shiftEndEventId === event.eventId)) {
      matching.push({ record, data: data as DailyBusinessKilometresV1 });
    }
  }
  if (matching.length !== 1) throw new Error("maintenance_completed_daily_distance_missing_or_ambiguous");

  const { data } = matching[0];
  if (data.schemaVersion !== 1 || !data.vehicleId || !data.operationalDate ||
      !Number.isSafeInteger(data.totalBusinessKm) || !Number.isSafeInteger(data.unallocatedBusinessKm)) {
    throw new Error("maintenance_completed_daily_distance_invalid");
  }
  const contribution = data.entries.find(entry =>
    entry.shiftId === rotation.outgoingShiftId && entry.shiftEndEventId === event.eventId);
  if (!contribution || contribution.allocationStatus !== "allocated" ||
      data.unallocatedBusinessKm !== 0) {
    throw new Error("maintenance_daily_business_km_not_fully_allocated");
  }

  return input.maintenance.accrueDailyBusinessKilometres({
    vehicleId: data.vehicleId,
    operationalDate: data.operationalDate,
    source: input.source,
  });
}
