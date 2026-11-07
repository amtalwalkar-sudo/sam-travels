import type { AtomicRecordRepository } from "../../core/src/repositories";
import {
  BusinessSettingsService,
  type BusinessSettingsRecordValidator,
} from "./business-settings-service";

/** Build the platform-neutral Business Settings service at the application composition boundary. */
export function createApplicationBusinessSettingsService(
  repository: AtomicRecordRepository,
  validate: BusinessSettingsRecordValidator,
  now?: () => string,
): BusinessSettingsService {
  return new BusinessSettingsService(repository, validate, now);
}

let applicationBusinessSettingsService: BusinessSettingsService | undefined;

/** Bind Business Settings to the same authoritative repository used by lifecycle and backup. */
export function initializeApplicationBusinessSettingsService(
  repository: AtomicRecordRepository,
  validate: BusinessSettingsRecordValidator,
  now?: () => string,
): BusinessSettingsService {
  if (applicationBusinessSettingsService) {
    throw new Error("Application Business Settings service is already initialized");
  }
  applicationBusinessSettingsService = createApplicationBusinessSettingsService(repository, validate, now);
  return applicationBusinessSettingsService;
}

/** Access is unavailable until the outer application composition root binds persistence. */
export function getApplicationBusinessSettingsService(): BusinessSettingsService {
  if (!applicationBusinessSettingsService) {
    throw new Error("Application Business Settings service has not been initialized");
  }
  return applicationBusinessSettingsService;
}
