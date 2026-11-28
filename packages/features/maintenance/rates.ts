import type { MaintenanceRateHistoryV1 } from "./records";
import { DEFAULT_MAINTENANCE_RATE_PAISE_PER_KM } from "./records";

/** Convert an instant to the Asia/Kolkata 04:00 operational-date convention. */
export function maintenanceBusinessDateFromInstant(instant: string): string {
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp)) throw new Error("maintenance_timestamp_invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const calendarDate = values.year + "-" + values.month + "-" + values.day;
  if (Number(values.hour) >= 4) return calendarDate;
  const previous = new Date(Date.parse(calendarDate + "T00:00:00.000Z") - 86_400_000);
  return previous.toISOString().slice(0, 10);
}

export type MaintenanceRateHistoryEntry = Readonly<{
  effectiveFrom: string;
  ratePaisePerKm: number;
  savedAt: string;
  isDefault: boolean;
  commandId?: string;
  source?: "web" | "android" | "import" | "integration";
}>;

/** Default rate begins at vehicle creation; all subsequent changes are immutable history entries. */
export function buildMaintenanceRateHistory(
  vehicleCreatedAt: string,
  stored?: MaintenanceRateHistoryV1,
): readonly MaintenanceRateHistoryEntry[] {
  if (stored) return Object.freeze(stored.entries.map(entry => Object.freeze({ ...entry })));
  return Object.freeze([Object.freeze({
    effectiveFrom: maintenanceBusinessDateFromInstant(vehicleCreatedAt),
    ratePaisePerKm: DEFAULT_MAINTENANCE_RATE_PAISE_PER_KM,
    savedAt: vehicleCreatedAt,
    isDefault: true,
  })]);
}

export function maintenanceRateForDate(
  history: readonly MaintenanceRateHistoryEntry[],
  businessDate: string,
): MaintenanceRateHistoryEntry {
  const eligible = history.filter(entry => entry.effectiveFrom <= businessDate);
  if (eligible.length === 0) throw new Error("maintenance_rate_not_effective");
  return eligible[eligible.length - 1];
}
