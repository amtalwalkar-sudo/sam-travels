import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import {
  assertDriverAssignmentHistoryV1,
  driverAssignmentHistoryId,
  type DriverAssignmentHistoryV1,
} from "../../domain/src/driver-assignment";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

type DriverDirectory = { get(driverId: string): Promise<RecordEnvelope<{ driverId: string; lifecycleState: string }> | undefined> };
type VehicleDirectory = { getById(vehicleId: string): Promise<RecordEnvelope<{ lifecycleState: string }> | undefined> };

export class DriverAssignmentService {
  private readonly records: FeatureRecordService<DriverAssignmentHistoryV1>;

  constructor(
    repository: AtomicRecordRepository,
    private readonly drivers: DriverDirectory,
    private readonly vehicles: VehicleDirectory,
    now?: () => string,
  ) {
    this.records = new FeatureRecordService(repository, {
      featureId: "driver-records",
      recordIdPrefix: "feature:driver-records:assignment:",
      validate: assertDriverAssignmentHistoryV1,
    }, now);
  }

  async getHistory(driverId: string): Promise<RecordEnvelope<DriverAssignmentHistoryV1> | undefined> {
    return this.records.get(driverAssignmentHistoryId(driverId));
  }

  async assign(input: {
    driverId: string;
    vehicleId: string;
    assignmentId: string;
    assignedAt: string;
    source: FeatureRecordSource;
  }): Promise<RecordEnvelope<DriverAssignmentHistoryV1>> {
    const [driver, vehicle] = await Promise.all([
      this.drivers.get(input.driverId), this.vehicles.getById(input.vehicleId),
    ]);
    if (!driver || driver.data.lifecycleState !== "active") throw new Error("driver_not_active");
    if (!vehicle || vehicle.data.lifecycleState !== "active") throw new Error("vehicle_not_active");
    const current = await this.getHistory(input.driverId);
    const assignments = [...(current?.data.assignments ?? [])];
    if (assignments.some(item => item.assignmentId === input.assignmentId)) throw new Error("driver_assignment_duplicate_id");
    const active = assignments.find(item => item.unassignedAt === undefined);
    if (active?.vehicleId === input.vehicleId) throw new Error("driver_already_assigned_to_vehicle");
    if (active) {
      if (Date.parse(input.assignedAt) < Date.parse(active.assignedAt)) throw new Error("driver_assignment_time_order_invalid");
      assignments[assignments.indexOf(active)] = { ...active, unassignedAt: input.assignedAt };
    }
    assignments.push({
      assignmentId: input.assignmentId, vehicleId: input.vehicleId, assignedAt: input.assignedAt,
    });
    const data: DriverAssignmentHistoryV1 = { schemaVersion: 1, driverId: input.driverId, assignments };
    if (!current) return this.records.create({
      id: driverAssignmentHistoryId(input.driverId), data, source: input.source,
    });
    return this.records.update({
      id: current.id, expectedRevision: current.revision, data,
    });
  }

  async unassign(input: {
    driverId: string; expectedRevision: number; unassignedAt: string;
  }): Promise<RecordEnvelope<DriverAssignmentHistoryV1>> {
    const id = driverAssignmentHistoryId(input.driverId);
    const current = await this.records.get(id);
    if (!current) throw new Error("driver_assignment_not_found");
    const active = current.data.assignments.find(item => item.unassignedAt === undefined);
    if (!active) throw new Error("driver_assignment_not_active");
    if (Date.parse(input.unassignedAt) < Date.parse(active.assignedAt)) throw new Error("driver_assignment_period_invalid");
    const assignments = current.data.assignments.map(item =>
      item.assignmentId === active.assignmentId ? { ...item, unassignedAt: input.unassignedAt } : item,
    );
    return this.records.update({
      id, expectedRevision: input.expectedRevision,
      data: { schemaVersion: 1, driverId: input.driverId, assignments },
    });
  }

  async list(): Promise<Array<RecordEnvelope<DriverAssignmentHistoryV1>>> {
    return (await this.records.list()).filter(row => row.id.startsWith("feature:driver-records:assignment:"));
  }
}
