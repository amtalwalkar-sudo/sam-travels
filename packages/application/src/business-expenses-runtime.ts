import type { AtomicRecordRepository } from "../../core/src/repositories";
import {
  BusinessExpensesService,
  type BusinessExpenseVehicleDirectory,
  type BusinessExpensesDomain,
  type BusinessExpenseHistoricalCorrectionPortV1,
} from "./business-expenses-service";

export function createApplicationBusinessExpensesService(
  repository: AtomicRecordRepository,
  domain: BusinessExpensesDomain,
  vehicles: BusinessExpenseVehicleDirectory,
  now?: () => string,
  historicalCorrections?: BusinessExpenseHistoricalCorrectionPortV1,
): BusinessExpensesService {
  return new BusinessExpensesService(repository, domain, vehicles, now, historicalCorrections);
}

let applicationBusinessExpensesService: BusinessExpensesService | undefined;

export function initializeApplicationBusinessExpensesService(
  repository: AtomicRecordRepository,
  domain: BusinessExpensesDomain,
  vehicles: BusinessExpenseVehicleDirectory,
  now?: () => string,
  historicalCorrections?: BusinessExpenseHistoricalCorrectionPortV1,
): BusinessExpensesService {
  if (applicationBusinessExpensesService) throw new Error("Application Business Expenses service is already initialized");
  applicationBusinessExpensesService = createApplicationBusinessExpensesService(repository, domain, vehicles, now, historicalCorrections);
  return applicationBusinessExpensesService;
}

export function getApplicationBusinessExpensesService(): BusinessExpensesService {
  if (!applicationBusinessExpensesService) throw new Error("Application Business Expenses service has not been initialized");
  return applicationBusinessExpensesService;
}
