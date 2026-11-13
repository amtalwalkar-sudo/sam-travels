import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  COMPLIANCE_FEATURE,
  assertComplianceRecordIdentity,
  assertComplianceRecordV1,
  assertComplianceOverlapReviewV1,
  resolveComplianceOverlapReview,
  type ComplianceOverlapReviewV1,
} from "../../../packages/features/compliance";
import {
  assertHistoricalCorrectionV1,
  projectHistoricalCorrectionsV1,
  type HistoricalCorrectionV1,
} from "../../../packages/domain/src/historical-correction";
import { assertVehicleRecordV1 } from "../../../packages/features/vehicle";
import { registerBrowserFeatureBackupParticipant } from "../../../packages/storage-browser/src";

const PREFIX = "feature:compliance:";
const REVIEW_PREFIX = "compliance-overlap-review:";
const CORRECTION_PREFIX = "historical-correction:";
const CORRECTION_CHAIN_PREFIX = "historical-correction-chain:";
const REVIEW_HEAD_PREFIX = "compliance-overlap-review-head:";
const CORRECTABLE_FIELDS = new Set([
  "complianceName", "validFrom", "validTo", "totalCostPaise", "supportingDocumentRef",
]);

function validateComplianceRelationships(
  records: readonly RecordEnvelope<unknown>[],
  record: RecordEnvelope<unknown>,
): void {
  assertComplianceRecordIdentity(record.id);
  assertComplianceRecordV1(record.data);
  const data = record.data;
  const vehicle = records.find(item => item.id === data.vehicleId);
  if (!vehicle) throw new Error("compliance_vehicle_not_found");
  const vehicleData = vehicle.data;
  assertVehicleRecordV1(vehicleData);
  if (vehicle.id !== "feature:vehicle:" + vehicleData.registrationNumber) {
    throw new Error("compliance_vehicle_identity_mismatch");
  }
  if (data.renewedFromRecordId) {
    const previous = records.find(item => item.id === data.renewedFromRecordId);
    if (!previous) throw new Error("compliance_renewal_source_not_found");
    const previousData = previous.data;
    assertComplianceRecordV1(previousData);
    if (previousData.vehicleId !== data.vehicleId ||
        previousData.complianceName !== data.complianceName) {
      throw new Error("compliance_renewal_source_mismatch");
    }
  }
}

/** Validate Compliance records and their append-only audit chains on export and restore. */
export function registerComplianceBrowserBackupParticipant(): () => void {
  return registerBrowserFeatureBackupParticipant({
    feature: COMPLIANCE_FEATURE,
    participantId: "compliance-records",
    recordIdPrefix: PREFIX,
    validateRecord(record, allRecords) {
      validateComplianceRelationships(allRecords, record);
    },
    validateSnapshot(records) {
      const owned = records.filter(record => record.id.startsWith(PREFIX));
      const ids = new Set<string>();
      for (const record of owned) {
        validateComplianceRelationships(records, record);
        if (ids.has(record.id)) throw new Error("compliance_backup_duplicate_identity");
        ids.add(record.id);
      }

      const reviews: ComplianceOverlapReviewV1[] = records
        .filter(record => record.id.startsWith(REVIEW_PREFIX))
        .map(record => {
          assertComplianceOverlapReviewV1(record.data);
          const review = record.data as ComplianceOverlapReviewV1;
          if (review.eventId !== record.id) throw new Error("compliance_overlap_review_identity_mismatch");
          const sourceRecords = review.sourceRecords.map(source => {
            if (!ids.has(source.recordId)) throw new Error("compliance_overlap_review_source_not_found");
            const envelope = owned.find(item => item.id === source.recordId)!;
            assertComplianceRecordV1(envelope.data);
            return envelope.data;
          });
          const [first, second] = sourceRecords;
          if (first.vehicleId !== second.vehicleId || first.complianceName !== second.complianceName) {
            throw new Error("compliance_overlap_review_source_mismatch");
          }
          const overlapFrom = first.validFrom > second.validFrom ? first.validFrom : second.validFrom;
          const overlapTo = first.validTo < second.validTo ? first.validTo : second.validTo;
          if (overlapFrom > overlapTo || overlapFrom !== review.from || overlapTo !== review.to) {
            throw new Error("compliance_overlap_review_scope_mismatch");
          }
          return review;
        });
      const reviewGroups = new Map<string, ComplianceOverlapReviewV1[]>();
      for (const review of reviews) {
        const key = [
          review.sourceRecords[0].recordId, review.sourceRecords[1].recordId,
          review.from, review.to,
        ].join("|");
        const group = reviewGroups.get(key) ?? [];
        group.push(review);
        reviewGroups.set(key, group);
      }
      for (const [key, group] of reviewGroups) {
        const latest = [...group].sort((a, b) => b.decisionRevision - a.decisionRevision)[0];
        // A stale source revision is valid history; chain corruption is not.
        resolveComplianceOverlapReview(latest.sourceRecords, latest.from, latest.to, group);
        const headId = REVIEW_HEAD_PREFIX + encodeURIComponent(key);
        const headEnvelope = records.find(record => record.id === headId);
        if (!headEnvelope) throw new Error("compliance_overlap_review_head_missing");
        const head = headEnvelope.data as Record<string, unknown>;
        if (head.schemaVersion !== 1 || head.overlapKey !== key ||
            head.decisionRevision !== latest.decisionRevision || head.headEventId !== latest.eventId) {
          throw new Error("compliance_overlap_review_head_mismatch");
        }
      }
      if (records.some(record => record.id.startsWith(REVIEW_HEAD_PREFIX) &&
          ![...reviewGroups.keys()].some(key => record.id === REVIEW_HEAD_PREFIX + encodeURIComponent(key)))) {
        throw new Error("compliance_overlap_review_orphan_head");
      }

      const corrections: HistoricalCorrectionV1[] = records
        .filter(record => record.id.startsWith(CORRECTION_PREFIX))
        .map(record => {
          assertHistoricalCorrectionV1(record.data);
          const correction = record.data as HistoricalCorrectionV1;
          if (record.id !== CORRECTION_PREFIX + correction.correctionId ||
              correction.featureId !== "compliance" ||
              !ids.has(correction.targetRecordId) ||
              !CORRECTABLE_FIELDS.has(correction.fieldPath)) {
            throw new Error("compliance_historical_correction_invalid_target");
          }
          return correction;
        });
      const correctionsByTarget = new Map<string, HistoricalCorrectionV1[]>();
      for (const correction of corrections) {
        const group = correctionsByTarget.get(correction.targetRecordId) ?? [];
        group.push(correction);
        correctionsByTarget.set(correction.targetRecordId, group);
      }
      for (const [targetId, chain] of correctionsByTarget) {
        const target = owned.find(record => record.id === targetId)!;
        if (chain.some(item => item.targetRecordRevision !== target.revision)) {
          throw new Error("historical_correction_target_revision_changed");
        }
        const projection = projectHistoricalCorrectionsV1(target.data, chain);
        if (projection.status !== "valid") throw new Error("historical_correction_chain_needs_attention");
        assertComplianceRecordV1(projection.data);
        const headId = CORRECTION_CHAIN_PREFIX + encodeURIComponent(targetId);
        const headEnvelope = records.find(record => record.id === headId);
        if (!headEnvelope) throw new Error("historical_correction_chain_head_missing");
        const head = headEnvelope.data as Record<string, unknown>;
        if (head.schemaVersion !== 1 || head.targetRecordId !== targetId ||
            head.chainRevision !== projection.chainRevision ||
            head.headCorrectionId !== projection.headCorrectionId) {
          throw new Error("historical_correction_chain_head_mismatch");
        }
      }
      const chainHeads = records.filter(record => record.id.startsWith(CORRECTION_CHAIN_PREFIX));
      if (chainHeads.some(record => !correctionsByTarget.has(
        String((record.data as Record<string, unknown>)?.targetRecordId ?? ""),
      ))) {
        throw new Error("historical_correction_orphan_chain_head");
      }
    },
  });
}
