import type { ComplianceService } from "./compliance-service";
import type { PersonIdentityService } from "./person-identity-service";
import {
  ComplianceAnalysisService,
  type ComplianceAnalysisFunctions,
  type ComplianceReviewEventPort,
} from "./compliance-analysis-service";

let applicationComplianceAnalysisService: ComplianceAnalysisService | undefined;

export function initializeApplicationComplianceAnalysisService(
  compliance: ComplianceService,
  reviewEvents: ComplianceReviewEventPort,
  identity: PersonIdentityService,
  analysis: ComplianceAnalysisFunctions,
): ComplianceAnalysisService {
  if (applicationComplianceAnalysisService) throw new Error("Application Compliance analysis service is already initialized");
  applicationComplianceAnalysisService = new ComplianceAnalysisService(compliance, reviewEvents, identity, analysis);
  return applicationComplianceAnalysisService;
}

export function getApplicationComplianceAnalysisService(): ComplianceAnalysisService {
  if (!applicationComplianceAnalysisService) throw new Error("Application Compliance analysis service has not been initialized");
  return applicationComplianceAnalysisService;
}
