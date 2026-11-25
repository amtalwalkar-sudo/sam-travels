import type { AtomicRecordBatchRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import { HistoricalCorrectionService, type HistoricalCorrectionActorProvider } from "../../../packages/application/src/historical-correction-service";
import { resolveOperatingVehicle } from "../../../packages/domain/src/work-driver-context";

export type ComplianceHistoricalCorrectionAdapter = Pick<HistoricalCorrectionService, "listForTarget" | "submit">;
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
): ComplianceHistoricalCorrectionAdapter {
  const corrections = new HistoricalCorrectionService(
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
  return Object.freeze({
    listForTarget: (targetRecordId: string) => corrections.listForTarget(targetRecordId),
    submit: async (input: Parameters<HistoricalCorrectionService["submit"]>[0]) => {
      // Compliance is vehicle-scoped, not Work/Driver-scoped. Resolve the one
      // active vehicle without requiring work:selected-driver or an assignment.
      const [target, records] = await Promise.all([
        repository.get(input.targetRecordId), repository.list(),
      ]);
      if (!target || (target.data as { vehicleId?: string }).vehicleId !==
          resolveOperatingVehicle(records).vehicleId) {
        throw new Error("compliance_correction_operating_vehicle_mismatch");
      }
      const expectedVehicle = resolveOperatingVehicle(records);
      const currentVehicle = resolveOperatingVehicle(await repository.list());
      if (currentVehicle.vehicleId !== expectedVehicle.vehicleId ||
          currentVehicle.vehicleRevision !== expectedVehicle.vehicleRevision) {
        throw new Error("operating_configuration_stale");
      }
      return corrections.submit(input);
    },
  });
}
