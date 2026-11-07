import type { RecordEnvelope } from "../../core/src/types";
import type { MaintenanceRateV1 } from "./records";
import { DEFAULT_MAINTENANCE_RATE_PAISE_PER_KM } from "./records";

/** Convert an instant to the existing Asia/Kolkata business-date convention. */
export function maintenanceBusinessDateFromInstant(instant: string): string {
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp)) throw new Error("maintenance_timestamp_invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export type MaintenanceRateHistoryEntry = Readonly<{
  recordId?: string;
  effectiveFrom: string;
  ratePaisePerKm: number;
  isDefault: boolean;
  savedAt?: string;
}>;

/** Default rate starts on the vehicle's creation business date; edits append immutable history. */
export function buildMaintenanceRateHistory(
  vehicleCreatedAt: string,
  records: readonly RecordEnvelope<MaintenanceRateV1>[],
): readonly MaintenanceRateHistoryEntry[] {
  const history: MaintenanceRateHistoryEntry[] = [{
    effectiveFrom: maintenanceBusinessDateFromInstant(vehicleCreatedAt),
    ratePaisePerKm: DEFAULT_MAINTENANCE_RATE_PAISE_PER_KM,
    isDefault: true,
  }, ...records.map(record => ({
    recordId: record.id,
    effectiveFrom: record.data.effectiveFrom,
    ratePaisePerKm: record.data.ratePaisePerKm,
    isDefault: false,
    savedAt: record.createdAt,
  }))];
  return Object.freeze(history.sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom) ||
    (left.savedAt ?? "").localeCompare(right.savedAt ?? ""),
  ));
}

export function maintenanceRateForDate(
  history: readonly MaintenanceRateHistoryEntry[],
  businessDate: string,
): MaintenanceRateHistoryEntry {
  const eligible = history.filter(entry => entry.effectiveFrom <= businessDate);
  if (eligible.length === 0) throw new Error("maintenance_rate_not_effective");
  return eligible[eligible.length - 1];
}
