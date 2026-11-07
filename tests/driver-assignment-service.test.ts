import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { assertDriverRecordV1 } from "../packages/features/driver-records";
import { assertVehicleRecordV1 } from "../packages/features/vehicle";
import { DriverRecordsService } from "../packages/application/src/driver-records-service";
import { VehicleService } from "../packages/application/src/vehicle-service";
import { DriverAssignmentService } from "../packages/application/src/driver-assignment-service";
import { assertDriverAssignmentHistoryV1 } from "../packages/domain/src/driver-assignment";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

describe("DriverAssignmentService", () => {
  it("reassigns without overwriting history and permits only one active assignment", async () => {
    const repository = new MemoryRepository();
    const drivers = new DriverRecordsService(repository, assertDriverRecordV1);
    const vehicles = new VehicleService(repository, assertVehicleRecordV1);
    await drivers.create({ schemaVersion: 1, driverId: "driver-001", name: "Example", lifecycleState: "active" }, "web");
    await vehicles.create({ schemaVersion: 1, registrationNumber: "MH 01 AB 1234", make: "Example", model: "Sedan", vehicleType: "car", fuelType: "petrol", yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active" }, "web");
    await vehicles.create({ schemaVersion: 1, registrationNumber: "MH02CD5678", make: "Example", model: "Sedan", vehicleType: "car", fuelType: "petrol", yearOfManufacture: 2023, ownership: "Owned", lifecycleState: "active" }, "web");
    const firstVehicleId = "feature:vehicle:MH01AB1234", secondVehicleId = "feature:vehicle:MH02CD5678";
    const service = new DriverAssignmentService(repository, drivers, {
      getById: async id => repository.get(id),
    });
    const first = await service.assign({ driverId: "driver-001", vehicleId: firstVehicleId, assignmentId: "assignment-1", assignedAt: "2026-11-07T09:00:00.000Z", source: "web" });
    const second = await service.assign({ driverId: "driver-001", vehicleId: secondVehicleId, assignmentId: "assignment-2", assignedAt: "2026-11-08T09:00:00.000Z", source: "web" });
    expect(first.data.assignments[0].unassignedAt).toBeUndefined();
    expect(second.data.assignments).toHaveLength(2);
    expect(second.data.assignments[0].unassignedAt).toBe("2026-11-08T09:00:00.000Z");
    expect(second.data.assignments[1].unassignedAt).toBeUndefined();
    expect(second.revision).toBe(2);
  });

  it("rejects inactive drivers, inactive vehicles, invalid histories, and stale unassignment", async () => {
    const repository = new MemoryRepository();
    const drivers = new DriverRecordsService(repository, assertDriverRecordV1);
    await drivers.create({ schemaVersion: 1, driverId: "driver-002", name: "Inactive", lifecycleState: "inactive" }, "web");
    const service = new DriverAssignmentService(repository, drivers, { getById: async () => undefined });
    await expect(service.assign({ driverId: "driver-002", vehicleId: "feature:vehicle:MH01AB1234", assignmentId: "a1", assignedAt: "2026-11-07T09:00:00.000Z", source: "web" })).rejects.toThrow("driver_not_active");
    expect(() => assertDriverAssignmentHistoryV1({ schemaVersion: 1, driverId: "driver-002", assignments: [
      { assignmentId: "a1", vehicleId: "feature:vehicle:MH01AB1234", assignedAt: "2026-11-07T09:00:00.000Z" },
      { assignmentId: "a2", vehicleId: "feature:vehicle:MH02CD5678", assignedAt: "2026-11-08T09:00:00.000Z" },
    ] })).toThrow("driver_multiple_active_assignments");
  });
});
