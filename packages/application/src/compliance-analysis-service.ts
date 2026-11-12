import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import {
  analyzeComplianceCoverage,
  resolveComplianceOverlapReview,
  ComplianceOverlapReviewService,
  type ComplianceOverlapReviewV1,
  type ComplianceOverlapReviewActorV1,
} from "../../features/compliance";
import type { ComplianceService, ComplianceRecordV1 } from "./compliance-service";
import type { PersonIdentityService } from "./person-identity-service";

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
  reviews: readonly ComplianceOverlapReviewV1[];
  gaps: readonly ComplianceOverviewGap[];
  overlaps: readonly ComplianceOverviewOverlap[];
}>;

/** Application boundary for fleet-wide Compliance analysis and Admin review commands. */
export class ComplianceAnalysisService {
  private readonly reviewEvents: ComplianceOverlapReviewService;

  constructor(
    private readonly compliance: ComplianceService,
    repository: AtomicRecordBatchRepository,
    private readonly identity: PersonIdentityService,
    source: RecordEnvelope<unknown>["source"],
    now?: () => string,
  ) {
    this.reviewEvents = new ComplianceOverlapReviewService(
      repository,
      { currentActor: async (): Promise<ComplianceOverlapReviewActorV1> => {
        const actor = await this.identity.currentActor();
        return { actorId: actor.actorId, role: actor.role };
      } },
      source,
      now,
    );
  }

  async getOverview(): Promise<ComplianceOverview> {
    const actor = await this.identity.currentActor();
    if (actor.role !== "admin") throw new Error("business_admin_authority_required");
    const [records, reviews] = await Promise.all([this.compliance.list(), this.reviewEvents.list()]);
    const groups = new Map<string, { vehicleId: string; complianceName: string }>();
    for (const record of records) {
      const key = record.data.vehicleId + "\u0000" + record.data.complianceName;
      groups.set(key, { vehicleId: record.data.vehicleId, complianceName: record.data.complianceName });
    }
    const gaps: ComplianceOverviewGap[] = [];
    const overlaps: ComplianceOverviewOverlap[] = [];
    for (const group of groups.values()) {
      const analysis = analyzeComplianceCoverage(records, group.vehicleId, group.complianceName);
      gaps.push(...analysis.gaps.map(gap => ({ ...group, ...gap })));
      for (const overlap of analysis.overlaps) {
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
          reviewStatus: resolveComplianceOverlapReview(ordered, overlap.from, overlap.to, reviews),
        });
      }
    }
    gaps.sort((a, b) => a.from.localeCompare(b.from) || a.vehicleId.localeCompare(b.vehicleId));
    overlaps.sort((a, b) => a.from.localeCompare(b.from) || a.vehicleId.localeCompare(b.vehicleId));
    return Object.freeze({
      records: Object.freeze(records),
      reviews: Object.freeze(reviews),
      gaps: Object.freeze(gaps),
      overlaps: Object.freeze(overlaps),
    });
  }

  async recordReview(input: Readonly<{
    uuid: string; firstRecordId: string; secondRecordId: string; from: string; to: string;
    decision: "confirmed" | "rejected"; rationale: string;
  }>): Promise<ComplianceOverlapReviewV1> {
    const actor = await this.identity.currentActor();
    if (actor.role !== "admin") throw new Error("business_admin_authority_required");
    return this.reviewEvents.recordDecision(input);
  }
}
