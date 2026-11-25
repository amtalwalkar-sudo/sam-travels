import type { AtomicRecordRepository } from "../../core/src/repositories";
import { resolveOperatingConfiguration, type OperatingConfigurationV1 } from "../../domain/src/work-driver-context";

/** Resolves and revalidates the configured single Driver–Vehicle pair for dependent commands. */
export class OperatingConfigurationServiceV1 {
  constructor(private readonly records: AtomicRecordRepository) {}

  async get(): Promise<OperatingConfigurationV1> {
    // One repository list call provides a coherent versioned configuration snapshot.
    return resolveOperatingConfiguration(await this.records.list());
  }

  async assertCurrent(expected: OperatingConfigurationV1): Promise<OperatingConfigurationV1> {
    const current = await this.get();
    if (current.driverId !== expected.driverId || current.vehicleId !== expected.vehicleId ||
        current.assignmentId !== expected.assignmentId ||
        current.selectionRevision !== expected.selectionRevision ||
        current.driverRevision !== expected.driverRevision ||
        current.vehicleRevision !== expected.vehicleRevision ||
        current.assignmentRevision !== expected.assignmentRevision) {
      throw new Error("operating_configuration_stale");
    }
    return current;
  }
}
