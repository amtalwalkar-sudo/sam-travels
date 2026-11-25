import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { OperatingConfigurationServiceV1 } from "./operating-configuration-service";
import {
  ComplianceService,
  type ComplianceRecordValidator,
} from "./compliance-service";

/** Construct Compliance at the application composition boundary. */
export function createApplicationComplianceService(
  repository: AtomicRecordRepository,
  validate: ComplianceRecordValidator,
  vehicles: import("./compliance-service").VehicleDirectory,
  now?: () => string,
  operatingConfiguration?: Pick<OperatingConfigurationServiceV1, "get" | "assertCurrent">,
): ComplianceService {
  return new ComplianceService(repository, validate, vehicles, now, operatingConfiguration);
}

let applicationComplianceService: ComplianceService | undefined;

export function initializeApplicationComplianceService(
  repository: AtomicRecordRepository,
  validate: ComplianceRecordValidator,
  vehicles: import("./compliance-service").VehicleDirectory,
  now?: () => string,
  operatingConfiguration?: Pick<OperatingConfigurationServiceV1, "get" | "assertCurrent">,
): ComplianceService {
  if (applicationComplianceService) {
    throw new Error("Application Compliance service is already initialized");
  }
  applicationComplianceService = createApplicationComplianceService(repository, validate, vehicles, now, operatingConfiguration);
  return applicationComplianceService;
}

export function getApplicationComplianceService(): ComplianceService {
  if (!applicationComplianceService) {
    throw new Error("Application Compliance service has not been initialized");
  }
  return applicationComplianceService;
}
