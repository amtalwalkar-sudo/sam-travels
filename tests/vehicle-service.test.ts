import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { assertVehicleRecordV1 } from "../packages/features/vehicle";
import { VehicleService } from "../packages/application/src/vehicle-service";

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

const vehicle = (registrationNumber: string) => ({
  schemaVersion: 1 as const, registrationNumber, make: "Example Make", model: "Example Model",
  vehicleType: "Sedan", fuelType: "Petrol", yearOfManufacture: 2022,
  ownership: "Owned", lifecycleState: "active" as const,
});

describe("VehicleService", () => {
  it("stores canonical registration identity and reads equivalent input formats", async () => {
    const service = new VehicleService(new MemoryRepository(), assertVehicleRecordV1);
    const created = await service.create(vehicle("MH 01 AB 1234"), "web");
    expect(created.id).toBe("feature:vehicle:MH01AB1234");
    expect(created.data.registrationNumber).toBe("MH01AB1234");
    expect((await service.getByRegistrationNumber("mh-01-ab-1234"))?.id).toBe(created.id);
    expect(await service.list()).toHaveLength(1);
  });

  it("atomically rejects duplicates across differently formatted registrations", async () => {
    const service = new VehicleService(new MemoryRepository(), assertVehicleRecordV1);
    await service.create(vehicle("MH 01 AB 1234"), "web");
    await expect(service.create(vehicle("mh01ab1234"), "android"))
      .rejects.toThrow("feature_record_already_exists");
  });

  it("allows revision-checked updates without changing identity", async () => {
    const service = new VehicleService(new MemoryRepository(), assertVehicleRecordV1);
    const created = await service.create(vehicle("MH01AB1234"), "web");
    const updated = await service.update({
      id: created.id, expectedRevision: 1,
      data: { ...created.data, lifecycleState: "inactive" },
    });
    expect(updated.revision).toBe(2);
    await expect(service.update({
      id: created.id, expectedRevision: 2,
      data: { ...updated.data, registrationNumber: "MH02CD5678" },
    })).rejects.toThrow("vehicle_registration_identity_immutable");
  });

  it("rejects registration values that normalize to empty or unsafe identities", async () => {
    const service = new VehicleService(new MemoryRepository(), assertVehicleRecordV1);
    await expect(service.create(vehicle(" -- "), "web")).rejects.toThrow("vehicle_registration_number_invalid");
    await expect(service.create(vehicle("MH/01/AB/1234"), "web")).rejects.toThrow("vehicle_registration_number_invalid");
  });
});
