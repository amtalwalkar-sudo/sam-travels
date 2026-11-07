import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import {
  assertFinanceLoanRecordIdentity,
  assertFinanceLoanRecordV1,
  createLoanScheduleVersion,
  financeLoanRecordId,
  loanCalculationInputsChanged,
  type FinanceLoanRecordV1,
  type LoanDetailsV1,
} from "../../features/finance";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

export type FinanceLoanVehicleDirectory = {
  getById(id: string): Promise<RecordEnvelope<{ lifecycleState: string }> | undefined>;
};

/**
 * Finance owns loan aggregates and original EMI schedule history.
 * Schedule versions are embedded in the same CAS-protected record as the
 * current loan details so a details revision and schedule pointer commit atomically.
 */
export class FinanceLoanService {
  private readonly records: FeatureRecordService<FinanceLoanRecordV1>;

  constructor(
    repository: AtomicRecordRepository,
    private readonly vehicles: FinanceLoanVehicleDirectory,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.records = new FeatureRecordService(repository, {
      featureId: "finance",
      recordIdPrefix: "feature:finance:loan:",
      validate: assertFinanceLoanRecordV1,
    }, now);
    this.now = now;
  }

  private readonly now: () => string;

  private async requireVehicle(vehicleId: string): Promise<void> {
    const vehicle = await this.vehicles.getById(vehicleId);
    if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
    if (vehicle.id !== vehicleId || !vehicleId.startsWith("feature:vehicle:")) {
      throw new Error("finance_loan_vehicle_identity_invalid");
    }
  }

  async create(input: {
    uuid: string;
    details: LoanDetailsV1;
    source: FeatureRecordSource;
  }): Promise<RecordEnvelope<FinanceLoanRecordV1>> {
    await this.requireVehicle(input.details.vehicleId);
    const createdAt = this.now();
    const data: FinanceLoanRecordV1 = {
      schemaVersion: 1,
      kind: "loan",
      details: Object.freeze({ ...input.details }),
      currentScheduleVersion: 1,
      scheduleVersions: [createLoanScheduleVersion(1, input.details, createdAt)],
    };
    return this.records.create({
      id: financeLoanRecordId(input.uuid),
      data,
      source: input.source,
      businessDate: input.details.loanStartDate,
      now: createdAt,
    });
  }

  async get(id: string): Promise<RecordEnvelope<FinanceLoanRecordV1> | undefined> {
    assertFinanceLoanRecordIdentity(id);
    return this.records.get(id);
  }

  async list(): Promise<Array<RecordEnvelope<FinanceLoanRecordV1>>> {
    const records = await this.records.list();
    for (const record of records) {
      assertFinanceLoanRecordIdentity(record.id);
      await this.requireVehicle(record.data.details.vehicleId);
    }
    return records;
  }

  async update(input: {
    id: string;
    expectedRevision: number;
    details: LoanDetailsV1;
  }): Promise<RecordEnvelope<FinanceLoanRecordV1>> {
    assertFinanceLoanRecordIdentity(input.id);
    const current = await this.records.get(input.id);
    if (!current) throw new Error("finance_loan_not_found");
    if (current.data.details.vehicleId !== input.details.vehicleId) {
      throw new Error("finance_loan_vehicle_identity_immutable");
    }
    await this.requireVehicle(input.details.vehicleId);
    const changed = loanCalculationInputsChanged(current.data.details, input.details);
    const createdAt = this.now();
    const scheduleVersions = changed
      ? [...current.data.scheduleVersions,
          createLoanScheduleVersion(current.data.currentScheduleVersion + 1, input.details, createdAt)]
      : current.data.scheduleVersions;
    const next: FinanceLoanRecordV1 = {
      schemaVersion: 1,
      kind: "loan",
      details: Object.freeze({ ...input.details }),
      currentScheduleVersion: changed
        ? current.data.currentScheduleVersion + 1
        : current.data.currentScheduleVersion,
      scheduleVersions,
    };
    return this.records.update({
      id: input.id,
      expectedRevision: input.expectedRevision,
      data: next,
      now: createdAt,
    });
  }
}
