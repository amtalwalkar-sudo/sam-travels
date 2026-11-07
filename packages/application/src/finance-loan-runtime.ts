import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { FinanceLoanVehicleDirectory } from "./finance-loan-service";
import { FinanceLoanService } from "./finance-loan-service";

export function createApplicationFinanceLoanService(
  repository: AtomicRecordRepository,
  vehicles: FinanceLoanVehicleDirectory,
  now?: () => string,
): FinanceLoanService {
  return new FinanceLoanService(repository, vehicles, now);
}

let applicationFinanceLoanService: FinanceLoanService | undefined;

export function initializeApplicationFinanceLoanService(
  repository: AtomicRecordRepository,
  vehicles: FinanceLoanVehicleDirectory,
  now?: () => string,
): FinanceLoanService {
  if (applicationFinanceLoanService) throw new Error("Application Finance Loan service is already initialized");
  applicationFinanceLoanService = createApplicationFinanceLoanService(repository, vehicles, now);
  return applicationFinanceLoanService;
}

export function getApplicationFinanceLoanService(): FinanceLoanService {
  if (!applicationFinanceLoanService) throw new Error("Application Finance Loan service has not been initialized");
  return applicationFinanceLoanService;
}
