import type { AtomicRecordRepository } from "../../core/src/repositories";
import type {
  FinanceLoanInputsChanged,
  FinanceLoanRecordValidator,
  FinanceLoanScheduleBuilder,
  FinanceLoanVehicleDirectory,
} from "./finance-loan-service";
import { FinanceLoanService } from "./finance-loan-service";

export function createApplicationFinanceLoanService(
  repository: AtomicRecordRepository,
  vehicles: FinanceLoanVehicleDirectory,
  validate: FinanceLoanRecordValidator,
  buildScheduleVersion: FinanceLoanScheduleBuilder,
  calculationInputsChanged: FinanceLoanInputsChanged,
  now?: () => string,
): FinanceLoanService {
  return new FinanceLoanService(repository, vehicles, validate, buildScheduleVersion, calculationInputsChanged, now);
}

let applicationFinanceLoanService: FinanceLoanService | undefined;

export function initializeApplicationFinanceLoanService(
  repository: AtomicRecordRepository,
  vehicles: FinanceLoanVehicleDirectory,
  validate: FinanceLoanRecordValidator,
  buildScheduleVersion: FinanceLoanScheduleBuilder,
  calculationInputsChanged: FinanceLoanInputsChanged,
  now?: () => string,
): FinanceLoanService {
  if (applicationFinanceLoanService) throw new Error("Application Finance Loan service is already initialized");
  applicationFinanceLoanService = createApplicationFinanceLoanService(
    repository, vehicles, validate, buildScheduleVersion, calculationInputsChanged, now,
  );
  return applicationFinanceLoanService;
}

export function getApplicationFinanceLoanService(): FinanceLoanService {
  if (!applicationFinanceLoanService) throw new Error("Application Finance Loan service has not been initialized");
  return applicationFinanceLoanService;
}
