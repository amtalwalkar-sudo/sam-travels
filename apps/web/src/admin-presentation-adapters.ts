import type { AtomicRecordBatchRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import type { PersonIdentityService } from "../../../packages/application/src/person-identity-service";
import type { AdminPresentationServices } from "../../../packages/application/src/admin-presentation-services";
import { createAdminIdentityPresentationAdapter } from "./admin-identity-presentation-adapter";
import { createMaintenanceExpenseCorrectionAdapter } from "./maintenance-expense-correction-runtime";
import { createComplianceHistoricalCorrectionService } from "./compliance-historical-correction";

/** All Admin-only presentation adapters are composed once beside the platform repository. */
export function createAdminPresentationAdapters(input: {
  identity: PersonIdentityService;
  records: AtomicRecordBatchRepository;
  source: RecordEnvelope<unknown>["source"];
  driverRecords: AdminPresentationServices["driverRecords"];
}) {
  return Object.freeze({
    identity: createAdminIdentityPresentationAdapter(input),
    maintenance: createMaintenanceExpenseCorrectionAdapter(input.records, input.source, input.identity),
    compliance: createComplianceHistoricalCorrectionService(input.records, input.identity, input.source),
  });
}
