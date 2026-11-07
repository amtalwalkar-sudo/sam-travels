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
