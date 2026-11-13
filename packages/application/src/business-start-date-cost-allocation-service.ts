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


export type BusinessStartDateCostAllocationReportV1 = Readonly<{
  businessStartDate: string;
  businessSettingsRevision: number;
  generatedAt: string;
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
  ) {}

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
      const scheduleVersion = settlement?.scheduleVersion ?? history.currentScheduleVersion;
      const selected = history.versions.find(item => item.version === scheduleVersion);
      if (!selected) throw new Error("business_start_date_emi_schedule_version_missing");
      // Settlement payment facts (including paid-through boundaries) do not
      // independently truncate scheduled EMI cost allocation. Only the Finance
      // schedule version itself defines the allocation horizon. A genuine
      // duration reduction from prepayment is represented by its revised rows.
      const rows = selected.rows;
      if (!rows.length) continue;
      const emiRows: EmiAllocationRowV1[] = rows.map(row => ({
        installmentNumber: row.installmentNumber,
        dueDate: row.dueDate,
        installmentAmountPaise: row.installmentAmountPaise,
      }));
      sources.push(...allocateScheduledEmisV1(businessStartDate, {
        loanId: loan.id,
        loanRevision: loan.revision,
        scheduleVersion,
        rows: emiRows,
      }));
    }

    return Object.freeze({
      businessStartDate,
      businessSettingsRevision: settings.revision,
      generatedAt: this.now(),
      result: buildBusinessStartDateAllocationResultV1(businessStartDate, sources),
    });
  }
}
