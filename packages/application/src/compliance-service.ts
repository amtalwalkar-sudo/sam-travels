import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import {
  assertComplianceRecordIdentity,
  assertComplianceRecordV1,
  complianceRecordId,
  type ComplianceRecordV1,
} from "../../features/compliance";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

/**
 * Compliance owns vehicle legal-coverage records. A renewal is a new immutable
 * record linked to its predecessor; this service never rewrites old coverage.
 */
export class ComplianceService {
  private readonly records: FeatureRecordService<ComplianceRecordV1>;

  constructor(repository: AtomicRecordRepository, now?: () => string) {
    this.records = new FeatureRecordService(repository, {
      featureId: "compliance",
      recordIdPrefix: "feature:compliance:",
      validate: assertComplianceRecordV1,
    }, now);
  }

  async create(input: {
    uuid: string;
    data: ComplianceRecordV1;
    source: FeatureRecordSource;
    businessDate?: string;
  }): Promise<RecordEnvelope<ComplianceRecordV1>> {
    const id = complianceRecordId(input.uuid);
    if (input.data.renewedFromRecordId) {
      assertComplianceRecordIdentity(input.data.renewedFromRecordId);
      const previous = await this.records.get(input.data.renewedFromRecordId);
      if (!previous) throw new Error("compliance_renewal_source_not_found");
      if (previous.data.vehicleId !== input.data.vehicleId ||
          previous.data.complianceName !== input.data.complianceName) {
        throw new Error("compliance_renewal_source_mismatch");
      }
      if (input.data.validFrom <= previous.data.validTo) {
        throw new Error("compliance_renewal_period_not_after_previous");
      }
    }
    return this.records.create({
      id,
      data: input.data,
      source: input.source,
      businessDate: input.businessDate,
    });
  }

  async get(id: string): Promise<RecordEnvelope<ComplianceRecordV1> | undefined> {
    assertComplianceRecordIdentity(id);
    const record = await this.records.get(id);
    if (record && record.id !== complianceRecordId(id.slice("feature:compliance:".length))) {
      throw new Error("compliance_record_identity_mismatch");
    }
    return record;
  }

  async list(): Promise<Array<RecordEnvelope<ComplianceRecordV1>>> {
    const records = await this.records.list();
    const byId = new Map(records.map(record => [record.id, record]));
    for (const record of records) {
      assertComplianceRecordIdentity(record.id);
      if (record.data.renewedFromRecordId) {
        const previous = byId.get(record.data.renewedFromRecordId);
        if (!previous) throw new Error("compliance_renewal_source_not_found");
        if (previous.data.vehicleId !== record.data.vehicleId ||
            previous.data.complianceName !== record.data.complianceName ||
            record.data.validFrom <= previous.data.validTo) {
          throw new Error("compliance_renewal_source_mismatch");
        }
      }
    }
    return records;
  }
}
