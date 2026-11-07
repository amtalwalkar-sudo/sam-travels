/** Business Settings v1 owns only the business-wide start date. */
export type BusinessSettingsRecordV1 = Readonly<{
  schemaVersion: 1;
  businessStartDate: string;
}>;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

/** Fail-closed payload validator used by persistence and backup boundaries. */
export function assertBusinessSettingsRecordV1(value: unknown): asserts value is BusinessSettingsRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("business_settings_record_invalid");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "businessStartDate" || keys[1] !== "schemaVersion" ||
      record.schemaVersion !== 1 || !isCalendarDate(record.businessStartDate)) {
    throw new Error("business_settings_record_invalid");
  }
}
