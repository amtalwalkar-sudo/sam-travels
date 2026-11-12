import type { AtomicRecordBatchRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { ComplianceService } from "./compliance-service";
import type { PersonIdentityService } from "./person-identity-service";
import { ComplianceAnalysisService } from "./compliance-analysis-service";

let applicationComplianceAnalysisService: ComplianceAnalysisService | undefined;

export function initializeApplicationComplianceAnalysisService(
  compliance: ComplianceService,
  repository: AtomicRecordBatchRepository,
  identity: PersonIdentityService,
  source: RecordEnvelope<unknown>["source"],
  now?: () => string,
): ComplianceAnalysisService {
  if (applicationComplianceAnalysisService) throw new Error("Application Compliance analysis service is already initialized");
  applicationComplianceAnalysisService = new ComplianceAnalysisService(compliance, repository, identity, source, now);
  return applicationComplianceAnalysisService;
}

export function getApplicationComplianceAnalysisService(): ComplianceAnalysisService {
  if (!applicationComplianceAnalysisService) throw new Error("Application Compliance analysis service has not been initialized");
  return applicationComplianceAnalysisService;
}
