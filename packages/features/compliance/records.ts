/** Compliance v1 owns vehicle-scoped legal/regulatory coverage records. */
export type ComplianceRecordV1 = Readonly<{
  schemaVersion: 1;
  vehicleId: string;
  complianceName: string;
  validFrom: string;
  validTo: string;
  totalCostPaise: number;
  supportingDocumentRef?: string;
  renewedFromRecordId?: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VEHICLE_ID = /^feature:vehicle:[^\s:][^\s]*$/;
const COMPLIANCE_RECORD_PREFIX = "feature:compliance:";

export function complianceRecordId(uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) {
    throw new Error("compliance_record_uuid_invalid");
  }
  return COMPLIANCE_RECORD_PREFIX + uuid.toLowerCase();
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Fail-closed payload validator shared by application, backup, and restore boundaries. */
export function assertComplianceRecordV1(value: unknown): asserts value is ComplianceRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("compliance_record_invalid");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const required = [
    "complianceName", "schemaVersion", "totalCostPaise", "validFrom", "validTo", "vehicleId",
  ];
  const allowed = new Set([
    ...required, "renewedFromRecordId", "supportingDocumentRef",
  ]);
  if (keys.some(key => !allowed.has(key)) ||
      required.some(key => !keys.includes(key)) ||
      record.schemaVersion !== 1 ||
      typeof record.vehicleId !== "string" || !VEHICLE_ID.test(record.vehicleId) ||
      typeof record.complianceName !== "string" || !record.complianceName.trim() ||
      !isCalendarDate(record.validFrom) || !isCalendarDate(record.validTo) ||
      record.validTo < record.validFrom ||
      !Number.isSafeInteger(record.totalCostPaise) || (record.totalCostPaise as number) < 0) {
    throw new Error("compliance_record_invalid");
  }
  if (record.supportingDocumentRef !== undefined &&
      (typeof record.supportingDocumentRef !== "string" || !record.supportingDocumentRef.trim())) {
    throw new Error("compliance_record_document_reference_invalid");
  }
  if (record.renewedFromRecordId !== undefined &&
      (typeof record.renewedFromRecordId !== "string" ||
       !record.renewedFromRecordId.startsWith(COMPLIANCE_RECORD_PREFIX) ||
       record.renewedFromRecordId.length <= COMPLIANCE_RECORD_PREFIX.length)) {
    throw new Error("compliance_record_renewal_reference_invalid");
  }
}

export const COMPLIANCE_RECORD_ID_PREFIX = COMPLIANCE_RECORD_PREFIX;
