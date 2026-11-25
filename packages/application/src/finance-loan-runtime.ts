import type { AtomicRecordRepository } from "../../core/src/repositories";
import type {
  FinanceLoanInputsChanged,
  FinanceLoanRecordValidator,
  FinanceLoanScheduleBuilder,
  FinanceLoanVehicleDirectory,
} from "./finance-loan-service";
import { FinanceLoanService } from "./finance-loan-service";
import type { OperatingConfigurationServiceV1 } from "./operating-configuration-service";

export function createApplicationFinanceLoanService(
  repository: AtomicRecordRepository,
  vehicles: FinanceLoanVehicleDirectory,
  validate: FinanceLoanRecordValidator,
  buildScheduleVersion: FinanceLoanScheduleBuilder,
  calculationInputsChanged: FinanceLoanInputsChanged,
  now?: () => string,
  operatingConfiguration?: Pick<OperatingConfigurationServiceV1, "get">,
): FinanceLoanService {
  return new FinanceLoanService(repository, vehicles, validate, buildScheduleVersion, calculationInputsChanged, now, operatingConfiguration);
}

let applicationFinanceLoanService: FinanceLoanService | undefined;

export function initializeApplicationFinanceLoanService(
  repository: AtomicRecordRepository,
  vehicles: FinanceLoanVehicleDirectory,
  validate: FinanceLoanRecordValidator,
  buildScheduleVersion: FinanceLoanScheduleBuilder,
  calculationInputsChanged: FinanceLoanInputsChanged,
  now?: () => string,
  operatingConfiguration?: Pick<OperatingConfigurationServiceV1, "get">,
): FinanceLoanService {
  if (applicationFinanceLoanService) throw new Error("Application Finance Loan service is already initialized");
  applicationFinanceLoanService = createApplicationFinanceLoanService(
    repository, vehicles, validate, buildScheduleVersion, calculationInputsChanged, now, operatingConfiguration,
  );
  return applicationFinanceLoanService;
}

export function getApplicationFinanceLoanService(): FinanceLoanService {
  if (!applicationFinanceLoanService) throw new Error("Application Finance Loan service has not been initialized");
  return applicationFinanceLoanService;
}
