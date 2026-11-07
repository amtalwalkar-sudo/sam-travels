import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { DriverRecordsService } from "./driver-records-service";
import type { VehicleService } from "./vehicle-service";
import { DriverAssignmentService } from "./driver-assignment-service";

export function createApplicationDriverAssignmentService(
  repository: AtomicRecordRepository,
  drivers: DriverRecordsService,
  vehicles: VehicleService,
  now?: () => string,
): DriverAssignmentService {
  return new DriverAssignmentService(repository, drivers, vehicles, now);
}

let applicationDriverAssignmentService: DriverAssignmentService | undefined;

export function initializeApplicationDriverAssignmentService(
  repository: AtomicRecordRepository,
  drivers: DriverRecordsService,
  vehicles: VehicleService,
  now?: () => string,
): DriverAssignmentService {
  if (applicationDriverAssignmentService) throw new Error("Application Driver Assignment service is already initialized");
  applicationDriverAssignmentService = createApplicationDriverAssignmentService(repository, drivers, vehicles, now);
  return applicationDriverAssignmentService;
}

export function getApplicationDriverAssignmentService(): DriverAssignmentService {
  if (!applicationDriverAssignmentService) throw new Error("Application Driver Assignment service has not been initialized");
  return applicationDriverAssignmentService;
}
