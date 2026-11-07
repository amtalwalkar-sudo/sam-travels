import type { AtomicRecordRepository } from "../../core/src/repositories";
import { DriverRecordsService, type DriverRecordValidator } from "./driver-records-service";

export function createApplicationDriverRecordsService(
  repository: AtomicRecordRepository,
  validate: DriverRecordValidator,
  now?: () => string,
): DriverRecordsService {
  return new DriverRecordsService(repository, validate, now);
}

let applicationDriverRecordsService: DriverRecordsService | undefined;

export function initializeApplicationDriverRecordsService(
  repository: AtomicRecordRepository,
  validate: DriverRecordValidator,
  now?: () => string,
): DriverRecordsService {
  if (applicationDriverRecordsService) throw new Error("Application Driver Records service is already initialized");
  applicationDriverRecordsService = createApplicationDriverRecordsService(repository, validate, now);
  return applicationDriverRecordsService;
}

export function getApplicationDriverRecordsService(): DriverRecordsService {
  if (!applicationDriverRecordsService) throw new Error("Application Driver Records service has not been initialized");
  return applicationDriverRecordsService;
}
