import type { AtomicRecordRepository } from "../../core/src/repositories";
import { VehicleService, type VehicleRecordValidator } from "./vehicle-service";

export function createApplicationVehicleService(
  repository: AtomicRecordRepository,
  validate: VehicleRecordValidator,
  now?: () => string,
): VehicleService {
  return new VehicleService(repository, validate, now);
}

let applicationVehicleService: VehicleService | undefined;

export function initializeApplicationVehicleService(
  repository: AtomicRecordRepository,
  validate: VehicleRecordValidator,
  now?: () => string,
): VehicleService {
  if (applicationVehicleService) throw new Error("Application Vehicle service is already initialized");
  applicationVehicleService = createApplicationVehicleService(repository, validate, now);
  return applicationVehicleService;
}

export function getApplicationVehicleService(): VehicleService {
  if (!applicationVehicleService) throw new Error("Application Vehicle service has not been initialized");
  return applicationVehicleService;
}
