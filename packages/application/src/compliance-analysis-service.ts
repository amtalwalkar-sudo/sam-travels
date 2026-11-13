import type { RecordEnvelope } from "../../core/src/types";
import type { ComplianceService, ComplianceRecordV1 } from "./compliance-service";
import type { PersonIdentityService } from "./person-identity-service";
import { projectHistoricalCorrectionsV1, type HistoricalCorrectionV1 } from "../../domain/src/historical-correction";

export type ComplianceReviewEvent = Readonly<{
  schemaVersion: 1;
  eventId: string;
  sourceRecords: readonly [{ recordId: string; recordRevision: number }, { recordId: string; recordRevision: number }];
  from: string; to: string; decision: "confirmed" | "rejected"; decisionRevision: number; supersedesEventId?: string;
  actor: { actorId: string; role: "admin" | "driver" }; rationale: string; recordedAt: string;
}>;
export interface ComplianceReviewEventPort {
  list(): Promise<ComplianceReviewEvent[]>;
  recordDecision(input: {
    uuid: string; firstRecordId: string; secondRecordId: string; from: string; to: string;
    decision: "confirmed" | "rejected"; rationale: string;
  }): Promise<ComplianceReviewEvent>;
}
export type ComplianceAnalysisFunctions = Readonly<{
  analyzeCoverage(records: readonly RecordEnvelope<ComplianceRecordV1>[], vehicleId: string, complianceName: string): {
    gaps: readonly { from: string; to: string; days: number }[];
    overlaps: readonly { firstRecordId: string; secondRecordId: string; from: string; to: string; days: number }[];
  };
  resolveOverlap(
    sources: readonly [{ recordId: string; recordRevision: number }, { recordId: string; recordRevision: number }],
    from: string, to: string, reviews: readonly ComplianceReviewEvent[],
  ): "unreviewed" | "confirmed" | "rejected" | "stale";
  validateProjectedComplianceData?(data: unknown): void;
  calculateDailyCost(
    records: readonly RecordEnvelope<ComplianceRecordV1>[], vehicleId: string, businessDate: string,
    reviews: readonly ComplianceReviewEvent[],
  ): {
    status: "available" | "overlap_review_required";
    total: { numeratorPaise: string; denominator: string } | null;
    breakdown: readonly { recordId: string; complianceName: string; cost: { numeratorPaise: string; denominator: string } }[];
    overlaps: readonly { firstRecordId: string; secondRecordId: string; from: string; to: string; days: number; reviewStatus: "unreviewed" | "confirmed" | "rejected" | "stale" }[];
  };
}>;

export type ComplianceOverviewGap = Readonly<{
  vehicleId: string; complianceName: string; from: string; to: string; days: number;
}>;
export type ComplianceOverviewOverlap = Readonly<{
  vehicleId: string; complianceName: string; firstRecordId: string; secondRecordId: string;
  from: string; to: string; days: number;
  reviewStatus: "unreviewed" | "confirmed" | "rejected" | "stale";
}>;
export type ComplianceOverview = Readonly<{
  records: readonly RecordEnvelope<ComplianceRecordV1>[];
  reviews: readonly ComplianceReviewEvent[];
  gaps: readonly ComplianceOverviewGap[];
  overlaps: readonly ComplianceOverviewOverlap[];
}>;

/** Read-only port for append-only corrections belonging to a Compliance source. */
export type ComplianceHistoricalCorrectionPortV1 = Readonly<{
  listForTarget(targetRecordId: string): Promise<HistoricalCorrectionV1[]>;
}>;

/** Application boundary for fleet-wide Compliance analysis and Admin review commands. */
export class ComplianceAnalysisService {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly reviewEvents: ComplianceReviewEventPort,
    private readonly identity: PersonIdentityService,
    private readonly analysis: ComplianceAnalysisFunctions,
    private readonly historicalCorrections?: ComplianceHistoricalCorrectionPortV1,
  ) {}

  private async projectCorrectedRecords(
    records: readonly RecordEnvelope<ComplianceRecordV1>[],
  ): Promise<RecordEnvelope<ComplianceRecordV1>[]> {
    if (!this.historicalCorrections) return [...records];
    return Promise.all(records.map(async record => {
      const corrections = await this.historicalCorrections!.listForTarget(record.id);
      if (!corrections.length) return record;
      const projection = projectHistoricalCorrectionsV1(record.data, corrections);
      if (projection.status !== "valid") {
        throw new Error("compliance_historical_correction_projection_needs_attention");
      }
      this.analysis.validateProjectedComplianceData?.(projection.data);
      return Object.freeze({ ...record, data: projection.data });
    }));
  }

  async getOverview(): Promise<ComplianceOverview> {
    const actor = await this.identity.currentActor();
    if (actor.role !== "admin") throw new Error("business_admin_authority_required");
    const [sourceRecords, reviews] = await Promise.all([this.compliance.list(), this.reviewEvents.list()]);
    const records = await this.projectCorrectedRecords(sourceRecords);
    const groups = new Map<string, { vehicleId: string; complianceName: string }>();
    for (const record of records) {
      const key = record.data.vehicleId + "\u0000" + record.data.complianceName;
      groups.set(key, { vehicleId: record.data.vehicleId, complianceName: record.data.complianceName });
    }
    const gaps: ComplianceOverviewGap[] = [];
    const overlaps: ComplianceOverviewOverlap[] = [];
    for (const group of groups.values()) {
      const result = this.analysis.analyzeCoverage(records, group.vehicleId, group.complianceName);
      gaps.push(...result.gaps.map(gap => ({ ...group, ...gap })));
      for (const overlap of result.overlaps) {
        const first = records.find(record => record.id === overlap.firstRecordId);
        const second = records.find(record => record.id === overlap.secondRecordId);
        if (!first || !second) throw new Error("compliance_analysis_source_missing");
        const ordered = [
          { recordId: first.id, recordRevision: first.revision },
          { recordId: second.id, recordRevision: second.revision },
        ].sort((a, b) => a.recordId.localeCompare(b.recordId)) as [
          { recordId: string; recordRevision: number },
          { recordId: string; recordRevision: number },
        ];
        overlaps.push({
          ...group, ...overlap,
          reviewStatus: this.analysis.resolveOverlap(ordered, overlap.from, overlap.to, reviews),
        });
      }
    }
    gaps.sort((a, b) => a.from.localeCompare(b.from) || a.vehicleId.localeCompare(b.vehicleId));
    overlaps.sort((a, b) => a.from.localeCompare(b.from) || a.vehicleId.localeCompare(b.vehicleId));
    return Object.freeze({
      records: Object.freeze(records), reviews: Object.freeze(reviews),
      gaps: Object.freeze(gaps), overlaps: Object.freeze(overlaps),
    });
  }

  async getDailyCost(vehicleId: string, businessDate: string) {
    const actor = await this.identity.currentActor();
    if (actor.role !== "admin") throw new Error("business_admin_authority_required");
    const [sourceRecords, reviews] = await Promise.all([this.compliance.list(), this.reviewEvents.list()]);
    const records = await this.projectCorrectedRecords(sourceRecords);
    return this.analysis.calculateDailyCost(records, vehicleId, businessDate, reviews);
  }

  async recordReview(input: {
    uuid: string; firstRecordId: string; secondRecordId: string; from: string; to: string;
    decision: "confirmed" | "rejected"; rationale: string;
  }): Promise<ComplianceReviewEvent> {
    const actor = await this.identity.currentActor();
    if (actor.role !== "admin") throw new Error("business_admin_authority_required");
    return this.reviewEvents.recordDecision(input);
  }
}
