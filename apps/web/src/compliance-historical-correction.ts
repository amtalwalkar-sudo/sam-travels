import type { AtomicRecordBatchRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import { HistoricalCorrectionService, type HistoricalCorrectionActorProvider } from "../../../packages/application/src/historical-correction-service";
import { assertComplianceRecordIdentity, assertComplianceRecordV1 } from "../../../packages/features/compliance";

const COMPLIANCE_PREFIX = "feature:compliance:";
const CORRECTABLE_FIELDS = [
  "validFrom",
  "validTo",
  "totalCostPaise",
  "supportingDocumentRef",
] as const;

/**
 * Compliance-owned correction policy. Original envelopes stay immutable; only
 * explicitly approved business fields can be projected through the shared
 * append-only correction chain. Identity, vehicle, schema and renewal links
 * remain immutable so cross-record relationships cannot be silently broken.
 */
export function createComplianceHistoricalCorrectionService(
  repository: AtomicRecordBatchRepository,
  actorProvider: HistoricalCorrectionActorProvider,
  source: RecordEnvelope<unknown>["source"] = "web",
  now?: () => string,
): HistoricalCorrectionService {
  return new HistoricalCorrectionService(
    repository,
    actorProvider,
    {
      async resolve(record) {
        if (!record.id.startsWith(COMPLIANCE_PREFIX)) {
          throw new Error("historical_correction_feature_mismatch");
        }
        assertComplianceRecordIdentity(record.id);
        assertComplianceRecordV1(record.data);
        return {
          featureId: "compliance",
          allowedFieldPaths: CORRECTABLE_FIELDS,
          validateProjectedData(data) {
            assertComplianceRecordV1(data);
          },
        };
      },
    },
    source,
    now,
  );
}
