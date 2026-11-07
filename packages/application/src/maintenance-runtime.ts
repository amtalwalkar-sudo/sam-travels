import type { AtomicRecordRepository } from "../../core/src/repositories";
import {
  MaintenanceService,
  type MaintenanceBusinessDateResolver,
  type MaintenanceRecordValidator,
  type MaintenanceVehicleDirectory,
  type MaintenanceVisitTotalCalculator,
} from "./maintenance-service";

export function createApplicationMaintenanceService(
  repository: AtomicRecordRepository,
  validate: MaintenanceRecordValidator,
  vehicles: MaintenanceVehicleDirectory,
  calculateVisitTotal: MaintenanceVisitTotalCalculator,
  businessDateFromInstant: MaintenanceBusinessDateResolver,
  now?: () => string,
): MaintenanceService {
  return new MaintenanceService(repository, validate, vehicles, calculateVisitTotal, businessDateFromInstant, now);
}

let applicationMaintenanceService: MaintenanceService | undefined;

export function initializeApplicationMaintenanceService(
  repository: AtomicRecordRepository,
  validate: MaintenanceRecordValidator,
  vehicles: MaintenanceVehicleDirectory,
  calculateVisitTotal: MaintenanceVisitTotalCalculator,
  businessDateFromInstant: MaintenanceBusinessDateResolver,
  now?: () => string,
): MaintenanceService {
  if (applicationMaintenanceService) throw new Error("Application Maintenance service is already initialized");
  applicationMaintenanceService = createApplicationMaintenanceService(
    repository, validate, vehicles, calculateVisitTotal, businessDateFromInstant, now,
  );
  return applicationMaintenanceService;
}

export function getApplicationMaintenanceService(): MaintenanceService {
  if (!applicationMaintenanceService) throw new Error("Application Maintenance service has not been initialized");
  return applicationMaintenanceService;
}
