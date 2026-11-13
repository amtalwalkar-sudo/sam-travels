import type { ComplianceService } from "./compliance-service";
import type { PersonIdentityService } from "./person-identity-service";
import {
  ComplianceAnalysisService,
  type ComplianceAnalysisFunctions,
  type ComplianceReviewEventPort,
  type ComplianceHistoricalCorrectionPortV1,
} from "./compliance-analysis-service";

let applicationComplianceAnalysisService: ComplianceAnalysisService | undefined;

export function initializeApplicationComplianceAnalysisService(
  compliance: ComplianceService,
  reviewEvents: ComplianceReviewEventPort,
  identity: PersonIdentityService,
  analysis: ComplianceAnalysisFunctions,
  historicalCorrections?: ComplianceHistoricalCorrectionPortV1,
): ComplianceAnalysisService {
  if (applicationComplianceAnalysisService) throw new Error("Application Compliance analysis service is already initialized");
  applicationComplianceAnalysisService = new ComplianceAnalysisService(compliance, reviewEvents, identity, analysis, historicalCorrections);
  return applicationComplianceAnalysisService;
}

export function getApplicationComplianceAnalysisService(): ComplianceAnalysisService {
  if (!applicationComplianceAnalysisService) throw new Error("Application Compliance analysis service has not been initialized");
  return applicationComplianceAnalysisService;
}
