import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

export type FinanceLoanDetailsV1 = Readonly<{
  loanName: string;
  lenderName: string;
  loanAccountReference?: string;
  vehicleId: string;
  principalPaise: number;
  annualInterestRateBasisPoints: number;
  loanStartDate: string;
  tenureMonths: number;
  firstEmiDate: string;
}>;
export type FinanceLoanScheduleRowV1 = Readonly<{
  installmentNumber: number; dueDate: string; openingPrincipalPaise: number;
  interestPaise: number; installmentAmountPaise: number; principalComponentPaise: number;
  closingPrincipalPaise: number; finalAdjusted: boolean;
}>;
export type FinanceLoanScheduleOutputV1 = Readonly<{
  currencyCode: "INR"; principalPaise: number; annualInterestRateBasisPoints: number;
  tenureMonths: number; monthlyRateNumerator: number; monthlyRateDenominator: number;
  regularEmiPaise: number; rows: readonly FinanceLoanScheduleRowV1[];
  totalInterestPaise: number; totalScheduledPaymentsPaise: number;
}>;
export type FinanceLoanScheduleVersionV1 = Readonly<{
  version: number;
  createdAt: string;
  effectiveDate: string;
  calculationId: "finance.loan-monthly-reducing-balance.v1";
  calculationVersion: 1;
  inputSchemaVersion: 1;
  outputSchemaVersion: 1;
  input: Readonly<{
    principalPaise: number;
    annualInterestRateBasisPoints: number;
    tenureMonths: number;
    loanStartDate: string;
    firstEmiDate: string;
  }>;
  output: FinanceLoanScheduleOutputV1;
}>;
export type FinanceLoanRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: "loan";
  details: FinanceLoanDetailsV1;
  currentScheduleVersion: number;
  scheduleVersions: readonly FinanceLoanScheduleVersionV1[];
  lifecycleState?: "active" | "closed";
}>;
export type FinanceLoanRecordValidator = (value: unknown) => asserts value is FinanceLoanRecordV1;
export type FinanceLoanScheduleBuilder = (
  version: number, details: FinanceLoanDetailsV1, createdAt: string,
) => FinanceLoanScheduleVersionV1;
export type FinanceLoanInputsChanged = (
  left: FinanceLoanDetailsV1, right: FinanceLoanDetailsV1,
) => boolean;
export type FinanceLoanVehicleDirectory = {
  getById(id: string): Promise<RecordEnvelope<{ lifecycleState: string }> | undefined>;
};
const PREFIX = "feature:finance:loan:";
const PREPAYMENT_PREFIX = "feature:finance:prepayments:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recordId(uuid: string): string {
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("finance_loan_uuid_invalid");
  return PREFIX + uuid.toLowerCase();
}
function assertRecordId(id: string): void {
  if (typeof id !== "string" || !id.startsWith(PREFIX) || recordId(id.slice(PREFIX.length)) !== id) {
    throw new Error("finance_loan_record_identity_invalid");
  }
}

/**
 * Finance owns loan aggregates and original EMI schedule history.
 * Schedule versions are embedded in the same CAS-protected record as the
 * current loan details so a details revision and schedule pointer commit atomically.
 */
export class FinanceLoanService {
  private readonly records: FeatureRecordService<FinanceLoanRecordV1>;

  constructor(
    private readonly repository: AtomicRecordRepository,
    private readonly vehicles: FinanceLoanVehicleDirectory,
    validate: FinanceLoanRecordValidator,
    private readonly buildScheduleVersion: FinanceLoanScheduleBuilder,
    private readonly calculationInputsChanged: FinanceLoanInputsChanged,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.records = new FeatureRecordService(repository, {
      featureId: "finance",
      recordIdPrefix: PREFIX,
      validate,
    }, now);
  }

  private async requireVehicle(vehicleId: string): Promise<void> {
    const vehicle = await this.vehicles.getById(vehicleId);
    if (!vehicle) throw new Error("finance_loan_vehicle_not_found");
    if (vehicle.id !== vehicleId || !vehicleId.startsWith("feature:vehicle:")) {
      throw new Error("finance_loan_vehicle_identity_invalid");
    }
  }

  async create(input: {
    uuid: string;
    details: FinanceLoanDetailsV1;
    source: FeatureRecordSource;
  }): Promise<RecordEnvelope<FinanceLoanRecordV1>> {
    await this.requireVehicle(input.details.vehicleId);
    const createdAt = this.now();
    const data: FinanceLoanRecordV1 = {
      schemaVersion: 1,
      kind: "loan",
      details: Object.freeze({ ...input.details }),
      currentScheduleVersion: 1,
      scheduleVersions: [this.buildScheduleVersion(1, input.details, createdAt)],
      lifecycleState: "active",
    };
    return this.records.create({
      id: recordId(input.uuid),
      data,
      source: input.source,
      businessDate: input.details.loanStartDate,
      now: createdAt,
    });
  }

  async get(id: string): Promise<RecordEnvelope<FinanceLoanRecordV1> | undefined> {
    assertRecordId(id);
    return this.records.get(id);
  }

  async list(): Promise<Array<RecordEnvelope<FinanceLoanRecordV1>>> {
    const records = await this.records.list();
    for (const record of records) {
      assertRecordId(record.id);
      await this.requireVehicle(record.data.details.vehicleId);
    }
    return records;
  }

  async update(input: {
    id: string;
    expectedRevision: number;
    details: FinanceLoanDetailsV1;
  }): Promise<RecordEnvelope<FinanceLoanRecordV1>> {
    assertRecordId(input.id);
    const current = await this.records.get(input.id);
    if (!current) throw new Error("finance_loan_not_found");
    if (current.data.lifecycleState === "closed") throw new Error("finance_loan_closed");
    if (current.data.details.vehicleId !== input.details.vehicleId) {
      throw new Error("finance_loan_vehicle_identity_immutable");
    }
    await this.requireVehicle(input.details.vehicleId);
    const changed = this.calculationInputsChanged(current.data.details, input.details);
    if (changed) {
      const prepaymentState = await this.repository.get(PREPAYMENT_PREFIX + input.id.slice(PREFIX.length));
      if (prepaymentState) throw new Error("finance_loan_prepayment_schedule_locked");
    }
    const createdAt = this.now();
    const scheduleVersions = changed
      ? [...current.data.scheduleVersions,
          this.buildScheduleVersion(current.data.currentScheduleVersion + 1, input.details, createdAt)]
      : current.data.scheduleVersions;
    const next: FinanceLoanRecordV1 = {
      schemaVersion: 1,
      kind: "loan",
      details: Object.freeze({ ...input.details }),
      currentScheduleVersion: changed
        ? current.data.currentScheduleVersion + 1
        : current.data.currentScheduleVersion,
      scheduleVersions,
      lifecycleState: current.data.lifecycleState ?? "active",
    };
    return this.records.update({
      id: input.id,
      expectedRevision: input.expectedRevision,
      data: next,
      now: createdAt,
    });
  }
}
