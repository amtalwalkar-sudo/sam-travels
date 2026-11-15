export type PerformanceAdminSettingsRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: "settings";
  monthlyDriverTargetPaise: number;
}>;
export type PerformancePreBusinessCostRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: "pre_business_cost";
  amountPaise: number;
  note: string;
  commandId: string;
}>;
export type PerformanceRecordV1 = PerformanceAdminSettingsRecordV1 | PerformancePreBusinessCostRecordV1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

/** Shared fail-closed validator used at persistence and backup/restore boundaries. */
export function assertPerformanceRecordV1(value: unknown): asserts value is PerformanceRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("performance_admin_record_invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "settings") {
    if (!exactKeys(record, ["kind", "monthlyDriverTargetPaise", "schemaVersion"]) ||
        record.schemaVersion !== 1 || !Number.isSafeInteger(record.monthlyDriverTargetPaise) ||
        (record.monthlyDriverTargetPaise as number) < 0) {
      throw new Error("performance_driver_target_invalid");
    }
    return;
  }
  if (record.kind === "pre_business_cost") {
    if (!exactKeys(record, ["amountPaise", "commandId", "kind", "note", "schemaVersion"]) ||
        record.schemaVersion !== 1 || !Number.isSafeInteger(record.amountPaise) ||
        (record.amountPaise as number) <= 0 || typeof record.note !== "string" ||
        !record.note.trim() || typeof record.commandId !== "string" || !UUID.test(record.commandId)) {
      throw new Error("performance_pre_business_cost_invalid");
    }
    return;
  }
  throw new Error("performance_admin_record_kind_invalid");
}
