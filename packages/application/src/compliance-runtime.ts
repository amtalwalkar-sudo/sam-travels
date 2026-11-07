import type { AtomicRecordRepository } from "../../core/src/repositories";
import {
  ComplianceService,
  type ComplianceRecordValidator,
} from "./compliance-service";

/** Construct Compliance at the application composition boundary. */
export function createApplicationComplianceService(
  repository: AtomicRecordRepository,
  validate: ComplianceRecordValidator,
  now?: () => string,
): ComplianceService {
  return new ComplianceService(repository, validate, now);
}

let applicationComplianceService: ComplianceService | undefined;

export function initializeApplicationComplianceService(
  repository: AtomicRecordRepository,
  validate: ComplianceRecordValidator,
  now?: () => string,
): ComplianceService {
  if (applicationComplianceService) {
    throw new Error("Application Compliance service is already initialized");
  }
  applicationComplianceService = createApplicationComplianceService(repository, validate, now);
  return applicationComplianceService;
}

export function getApplicationComplianceService(): ComplianceService {
  if (!applicationComplianceService) {
    throw new Error("Application Compliance service has not been initialized");
  }
  return applicationComplianceService;
}
