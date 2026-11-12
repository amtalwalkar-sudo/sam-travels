import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

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
export type ComplianceRecordValidator = (value: unknown) => asserts value is ComplianceRecordV1;
export type VehicleDirectory = {
  getById(id: string): Promise<RecordEnvelope<{ lifecycleState: string }> | undefined>;
};

const PREFIX = "feature:compliance:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recordId(uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("compliance_record_uuid_invalid");
  return PREFIX + uuid.toLowerCase();
}
function assertRecordId(id: string): void {
  if (typeof id !== "string" || !id.startsWith(PREFIX) ||
      recordId(id.slice(PREFIX.length)) !== id) {
    throw new Error("compliance_record_identity_invalid");
  }
}

/**
 * Compliance owns vehicle legal-coverage records. A renewal is a new immutable
 * record linked to its predecessor; actual document dates are preserved even
 * when the new period begins before the predecessor expires.
 */
export class ComplianceService {
  private readonly records: FeatureRecordService<ComplianceRecordV1>;

  constructor(
    repository: AtomicRecordRepository,
    validate: ComplianceRecordValidator,
    private readonly vehicles: VehicleDirectory,
    now?: () => string,
  ) {
    this.records = new FeatureRecordService(repository, {
      featureId: "compliance",
      recordIdPrefix: PREFIX,
      validate,
    }, now);
  }

  async create(input: {
    uuid: string;
    data: ComplianceRecordV1;
    source: FeatureRecordSource;
    businessDate?: string;
  }): Promise<RecordEnvelope<ComplianceRecordV1>> {
    const vehicle = await this.vehicles.getById(input.data.vehicleId);
    if (!vehicle) throw new Error("compliance_vehicle_not_found");
    const id = recordId(input.uuid);
    if (input.data.renewedFromRecordId) {
      assertRecordId(input.data.renewedFromRecordId);
      const previous = await this.records.get(input.data.renewedFromRecordId);
      if (!previous) throw new Error("compliance_renewal_source_not_found");
      if (previous.data.vehicleId !== input.data.vehicleId ||
          previous.data.complianceName !== input.data.complianceName) {
        throw new Error("compliance_renewal_source_mismatch");
      }
      // Do not compare validity dates here: early renewal may create a legitimate
      // overlap, and late renewal must preserve the actual historical gap.
    }
    return this.records.create({
      id, data: input.data, source: input.source, businessDate: input.businessDate,
    });
  }

  async get(id: string): Promise<RecordEnvelope<ComplianceRecordV1> | undefined> {
    assertRecordId(id);
    return this.records.get(id);
  }

  async list(): Promise<Array<RecordEnvelope<ComplianceRecordV1>>> {
    const records = await this.records.list();
    const byId = new Map(records.map(record => [record.id, record]));
    const vehicles = await Promise.all(records.map(record => this.vehicles.getById(record.data.vehicleId)));
    if (vehicles.some(vehicle => !vehicle)) throw new Error("compliance_vehicle_not_found");
    for (const record of records) {
      assertRecordId(record.id);
      if (record.data.renewedFromRecordId) {
        const previous = byId.get(record.data.renewedFromRecordId);
        if (!previous) throw new Error("compliance_renewal_source_not_found");
        if (previous.data.vehicleId !== record.data.vehicleId ||
            previous.data.complianceName !== record.data.complianceName) {
          throw new Error("compliance_renewal_source_mismatch");
        }
      }
    }
    return records;
  }
}
