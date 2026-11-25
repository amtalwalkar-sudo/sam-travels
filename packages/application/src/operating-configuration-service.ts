import type { AtomicRecordRepository } from "../../core/src/repositories";
import { resolveOperatingConfiguration, type OperatingConfigurationV1, WORK_SELECTED_DRIVER_RECORD_ID } from "../../domain/src/work-driver-context";

/** Resolves and revalidates the configured single Driver–Vehicle pair for dependent commands. */
export class OperatingConfigurationServiceV1 {
  constructor(private readonly records: AtomicRecordRepository) {}

  async get(): Promise<OperatingConfigurationV1> {
    // Command resolution remains fail-closed while Work has locked the selected Driver.
    return resolveOperatingConfiguration(await this.records.list());
  }

  /**
   * Read-only consumers may inspect the already-configured pair during an active
   * shift. This does not unlock or mutate Work selection; command paths must keep
   * using get(), which rejects a locked selection.
   */
  async getForReadOnly(): Promise<OperatingConfigurationV1> {
    const snapshot = await this.records.list();
    const selection = snapshot.find(record =>
      record.id === WORK_SELECTED_DRIVER_RECORD_ID && !record.deletedAt
    );
    const lockedShiftId = selection?.data && typeof selection.data === "object" &&
      "lockedShiftId" in selection.data &&
      typeof (selection.data as { lockedShiftId?: unknown }).lockedShiftId === "string"
      ? (selection.data as { lockedShiftId: string }).lockedShiftId
      : undefined;
    return resolveOperatingConfiguration(snapshot, undefined, lockedShiftId);
  }

  async assertCurrentForReadOnly(expected: OperatingConfigurationV1): Promise<OperatingConfigurationV1> {
    const current = await this.getForReadOnly();
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
