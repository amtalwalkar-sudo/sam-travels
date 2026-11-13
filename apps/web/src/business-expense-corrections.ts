import type { AtomicRecordBatchRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import { HistoricalCorrectionService } from "../../../packages/application/src";
import type { PersonIdentityService } from "../../../packages/application/src/person-identity-service";
import { assertBusinessExpenseEntryV1, assertFuelPurchaseV1 } from "../../../packages/features/business-expenses";
import { assertComplianceRecordV1 } from "../../../packages/features/compliance";

/** Composition-root factory for append-only, feature-owned historical correction policies. */
export function createBusinessExpenseHistoricalCorrections(
  repository: AtomicRecordBatchRepository,
  source: RecordEnvelope<unknown>["source"],
  identity: Pick<PersonIdentityService, "currentActor">,
): HistoricalCorrectionService {
  return new HistoricalCorrectionService(
    repository,
    { currentActor: () => identity.currentActor() },
    {
      async resolve(record) {
        if (record.id.startsWith("feature:compliance:")) {
          return {
            featureId: "compliance",
            allowedFieldPaths: ["complianceName", "validFrom", "validTo", "totalCostPaise"],
            validateProjectedData: assertComplianceRecordV1,
          };
        }
        if (record.id.startsWith("feature:business-expenses:fuel:")) {
          return {
            featureId: "business-expenses",
            allowedFieldPaths: ["odometerKm", "pricePaisePerKg", "amountPaise", "partialRefill"],
            validateProjectedData: assertFuelPurchaseV1,
          };
        }
        if (record.id.startsWith("feature:business-expenses:entry:")) {
          return {
            featureId: "business-expenses",
            allowedFieldPaths: ["businessDate", "amountPaise", "category", "description", "reference",
              "alreadyNettedFromIncome", "paymentStatus"],
            validateProjectedData: assertBusinessExpenseEntryV1,
          };
        }
        throw new Error("historical_correction_target_feature_unsupported");
      },
    },
    source,
  );
}
