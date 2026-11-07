import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import {
  assertWorkSelectedDriverV1, WORK_SELECTED_DRIVER_RECORD_ID, type WorkSelectedDriverV1,
} from "../../domain/src/work-driver-context";
import { driverRecordId } from "../../domain/src/driver-record-identity";
import type { DriverWorkflowRepository } from "./driver-workflow-service";

/** Persists Work's single selected Driver reference without copying feature-owned profile data. */
export class WorkDriverSelectionService {
  constructor(
    private readonly records: AtomicRecordRepository,
    private readonly workflow: Pick<DriverWorkflowRepository, "getSnapshot">,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getSelectedDriver(): Promise<WorkSelectedDriverV1 | undefined> {
    const record = await this.records.get<WorkSelectedDriverV1>(WORK_SELECTED_DRIVER_RECORD_ID);
    if (!record) return undefined;
    assertWorkSelectedDriverV1(record.data);
    return record.data;
  }

  async selectDriver(driverId: string, source: RecordEnvelope<unknown>["source"] = "web"): Promise<WorkSelectedDriverV1> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(driverId)) throw new Error("work_selected_driver_invalid");
    if ((await this.workflow.getSnapshot()).state === "trip_active") throw new Error("work_driver_selection_locked_during_trip");
    const driver = await this.records.get<{schemaVersion:number;driverId:string;name:string;lifecycleState:string}>(driverRecordId(driverId));
    if (!driver || driver.data.schemaVersion !== 1 || driver.data.driverId !== driverId ||
        !driver.data.name.trim() || driver.data.lifecycleState !== "active") throw new Error("driver_not_active");
    const data: WorkSelectedDriverV1 = { schemaVersion: 1, driverId };
    const current = await this.records.get<WorkSelectedDriverV1>(WORK_SELECTED_DRIVER_RECORD_ID);
    const now = this.now();
    const next: RecordEnvelope<WorkSelectedDriverV1> = current
      ? { ...current, updatedAt: now, revision: current.revision + 1, data }
      : { id: WORK_SELECTED_DRIVER_RECORD_ID, schemaVersion: 1, createdAt: now, updatedAt: now, source, revision: 1, data };
    if (current) {
      if (!await this.records.compareAndSet(WORK_SELECTED_DRIVER_RECORD_ID, current.revision, next)) {
        throw new Error("work_selected_driver_stale_revision");
      }
    } else if (!await this.records.compareAndSet(WORK_SELECTED_DRIVER_RECORD_ID, null, next)) {
      throw new Error("work_selected_driver_stale_revision");
    }
    return data;
  }
}
