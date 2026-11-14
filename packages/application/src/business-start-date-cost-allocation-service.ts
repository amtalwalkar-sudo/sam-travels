import {
  allocateComplianceCostV1,
  allocateScheduledEmisV1,
  buildBusinessStartDateAllocationResultV1,
  type BusinessStartDateAllocationResultV1,
  type ComplianceAllocationInputV1,
  type EmiAllocationRowV1,
} from "../../domain/src/business-start-date-cost-allocation";
import type { BusinessSettingsService } from "./business-settings-service";
import type { ComplianceAnalysisService } from "./compliance-analysis-service";
import type { FinanceLoanService } from "./finance-loan-service";
import type { FinanceLoanPrepaymentService } from "./finance-loan-prepayment-service";
import type { FinanceLoanPaymentService, FinancePaymentEntryV1 } from "./finance-loan-payment-service";
import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";

const PROVENANCE_PREFIX = "reporting:business-start-date-cost-allocation:provenance:";
type AllocationProvenanceV1 = Readonly<{
  schemaVersion: 1;
  fingerprint: string;
  canonicalInputs: string;
  calculationId: string;
  calculationVersion: number;
  businessStartDate: string;
  businessSettingsRevision: number;
}>;

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}


export type BusinessStartDateCostAllocationReportV1 = Readonly<{
  businessStartDate: string;
  businessSettingsRevision: number;
  generatedAt: string;
  provenance?: Readonly<{ id: string; fingerprint: string }>;
  provenanceHistory?: readonly Readonly<{
    id: string; fingerprint: string; businessStartDate: string;
    businessSettingsRevision: number; calculationVersion: number; createdAt: string;
  }>[];
  result: BusinessStartDateAllocationResultV1;
}>;

/**
 * Read-only reporting projection. It is rebuilt deterministically from the
 * current owning-service records on every read, so settings/source revisions
 * cannot leave a stale persisted allocation cache behind.
 */
export class BusinessStartDateCostAllocationService {
  constructor(
    private readonly settings: Pick<BusinessSettingsService, "get">,
    private readonly complianceAnalysis: Pick<ComplianceAnalysisService, "getOverview">,
    private readonly loans: Pick<FinanceLoanService, "list">,
    private readonly prepayments: Pick<FinanceLoanPrepaymentService, "getScheduleHistory">,
    private readonly payments: Pick<FinanceLoanPaymentService, "list">,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly provenanceRepository?: AtomicRecordRepository,
    private readonly recordSource: RecordEnvelope<unknown>["source"] = "web",
  ) {}

  private async retainProvenance(
    businessStartDate: string,
    businessSettingsRevision: number,
    result: BusinessStartDateAllocationResultV1,
    generatedAt: string,
  ): Promise<Readonly<{ id: string; fingerprint: string }> | undefined> {
    if (!this.provenanceRepository) return undefined;
    const canonicalInputs = JSON.stringify({
      calculationId: result.calculationId,
      calculationVersion: result.calculationVersion,
      businessStartDate,
      businessSettingsRevision,
      sources: result.sources.map(source => ({
        sourceId: source.sourceId, sourceKind: source.sourceKind, sourceVersion: source.sourceVersion,
        scheduleVersion: source.scheduleVersion, sourceAmountPaise: source.sourceAmountPaise,
        disposition: source.disposition, eligibleFrom: source.eligibleFrom, eligibleTo: source.eligibleTo,
      })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    });
    const digest = fingerprint(canonicalInputs);
    const id = PROVENANCE_PREFIX + digest;
    const existing = await this.provenanceRepository.get<AllocationProvenanceV1>(id);
    if (existing) {
      if (existing.data.schemaVersion !== 1 || existing.data.fingerprint !== digest ||
          existing.data.canonicalInputs !== canonicalInputs) {
        throw new Error("business_start_date_allocation_provenance_collision");
      }
      return Object.freeze({ id, fingerprint: digest });
    }
    const data: AllocationProvenanceV1 = {
      schemaVersion: 1, fingerprint: digest, canonicalInputs,
      calculationId: result.calculationId, calculationVersion: result.calculationVersion,
      businessStartDate, businessSettingsRevision,
    };
    const next: RecordEnvelope<AllocationProvenanceV1> = {
      id, schemaVersion: 1, createdAt: generatedAt, updatedAt: generatedAt,
      source: this.recordSource, revision: 1, data,
    };
    const committed = await this.provenanceRepository.compareAndSet(id, null, next);
    if (!committed) {
      const replay = await this.provenanceRepository.get<AllocationProvenanceV1>(id);
      if (!replay || replay.data.fingerprint !== digest || replay.data.canonicalInputs !== canonicalInputs) {
        throw new Error("business_start_date_allocation_provenance_write_conflict");
      }
    }
    return Object.freeze({ id, fingerprint: digest });
  }

  private async getProvenanceHistory() {
    if (!this.provenanceRepository) return undefined;
    const rows = (await this.provenanceRepository.list<AllocationProvenanceV1>())
      .filter(row => row.id.startsWith(PROVENANCE_PREFIX))
      .filter(row => row.data?.schemaVersion === 1 && typeof row.data.fingerprint === "string")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    return Object.freeze(rows.map(row => Object.freeze({
      id: row.id, fingerprint: row.data.fingerprint, businessStartDate: row.data.businessStartDate,
      businessSettingsRevision: row.data.businessSettingsRevision,
      calculationVersion: row.data.calculationVersion, createdAt: row.createdAt,
    })));
  }

  async getReport(): Promise<BusinessStartDateCostAllocationReportV1> {
    const [settings, overview, loans] = await Promise.all([
      this.settings.get(), this.complianceAnalysis.getOverview(), this.loans.list(),
    ]);
    if (!settings) throw new Error("business_start_date_not_configured");
    const businessStartDate = settings.data.businessStartDate;
    const sources = [];

    for (const record of overview.records) {
      const related = overview.overlaps.filter(item =>
        item.firstRecordId === record.id || item.secondRecordId === record.id);
      const overlapReviewStatus = related.length === 0 ? "not_overlapping" as const :
        related.every(item => item.reviewStatus === "confirmed") ? "confirmed" as const :
          (related.find(item => item.reviewStatus !== "confirmed")?.reviewStatus ?? "unreviewed");
      const input: ComplianceAllocationInputV1 = {
        id: record.id, revision: record.revision,
        complianceName: record.data.complianceName,
        validFrom: record.data.validFrom, validTo: record.data.validTo,
        totalCostPaise: record.data.totalCostPaise, overlapReviewStatus,
      };
      sources.push(allocateComplianceCostV1(businessStartDate, input));
    }

    const loanHistories = await Promise.all(loans.map(async loan => ({
      loan, history: await this.prepayments.getScheduleHistory(loan.id),
      payments: await this.payments.list(loan.id),
    })));
    for (const { loan, history, payments } of loanHistories) {
      const settlement = payments.find((entry): entry is Extract<FinancePaymentEntryV1, { kind: "settlement" }> =>
        entry.kind === "settlement");
      const settlementVersion = settlement?.scheduleVersion;
      const orderedVersions = [...history.versions]
        .filter(item => settlementVersion === undefined || item.version <= settlementVersion)
        .sort((left, right) => left.version - right.version);
      const selected = orderedVersions.find(item => item.version === (settlementVersion ?? history.currentScheduleVersion));
      if (!selected) throw new Error("business_start_date_emi_schedule_version_missing");

      // Compose immutable schedule history. Each old version contributes only
      // through the day before the first due date in its replacement schedule;
      // this retains the open EMI period instead of dropping it on prepayment.
      const compositeRows: EmiAllocationRowV1[] = [];
      for (let index = 0; index < orderedVersions.length; index++) {
        const version = orderedVersions[index];
        const nextVersionFirstDue = orderedVersions[index + 1]?.rows
          .map(row => row.dueDate).sort()[0];
        const versionRows = version.rows
          .filter(row => !nextVersionFirstDue || row.dueDate < nextVersionFirstDue)
          .map(row => ({
            installmentNumber: row.installmentNumber,
            dueDate: row.dueDate,
            installmentAmountPaise: row.installmentAmountPaise,
            scheduleVersion: version.version,
          }));
        compositeRows.push(...versionRows);
      }
      if (!compositeRows.length) continue;
      sources.push(...allocateScheduledEmisV1(businessStartDate, {
        loanId: loan.id,
        loanRevision: loan.revision,
        scheduleVersion: selected.version,
        rows: compositeRows,
        ...(settlement ? { allocationEndDate: settlement.businessDate } : {}),
      }));
    }

    const generatedAt = this.now();
    const result = buildBusinessStartDateAllocationResultV1(businessStartDate, sources);
    const provenance = await this.retainProvenance(businessStartDate, settings.revision, result, generatedAt);
    const provenanceHistory = await this.getProvenanceHistory();
    return Object.freeze({
      businessStartDate,
      businessSettingsRevision: settings.revision,
      generatedAt,
      ...(provenance ? { provenance } : {}),
      ...(provenanceHistory ? { provenanceHistory } : {}),
      result,
    });
  }
}
