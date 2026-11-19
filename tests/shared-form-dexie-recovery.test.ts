import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { SamTravelsDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  RecordFormWorkingCopyRepository, SharedFormRuntime, VEHICLE_FORM_V1, FUEL_ENTRY_FORM_V1,
  PerformanceAdminSettingsServiceV1,
  type FormWorkingCopy, type FormWorkingCopyRepository,
} from "../packages/application/src";
import { VehicleService } from "../packages/application/src/vehicle-service";
import { assertVehicleRecordV1 } from "../packages/features/vehicle";
import { createAdminFormRuntimeV1 } from "../apps/web/src/admin-form-runtime";
import { createBusinessExpenseFormSubmissionHandler } from "../apps/web/src/business-expense-form-submission";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";
import {
  assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory,
} from "../packages/features/business-expenses";

const databases: SamTravelsDatabase[] = [];

async function openStore() {
  const database = new SamTravelsDatabase("form-recovery-" + crypto.randomUUID());
  databases.push(database);
  await database.open();
  const repository = new DexieRecordRepository(database);
  return { database, repository };
}

class InterruptCompletionOnce implements FormWorkingCopyRepository {
  private interrupted = false;
  constructor(private readonly inner: FormWorkingCopyRepository) {}
  get(formId: string, instanceId: string) { return this.inner.get(formId, instanceId); }
  list(formId: string) { return this.inner.list(formId); }
  remove(formId: string, instanceId: string) { return this.inner.remove(formId, instanceId); }
  async put(copy: FormWorkingCopy, expectedRevision?: number) {
    if (copy.status === "saved" || copy.status === "submitted") {
      if (!this.interrupted) {
        this.interrupted = true;
        throw new Error("simulated_process_death_after_domain_commit");
      }
    }
    await this.inner.put(copy, expectedRevision);
  }
}

function vehicleData(registrationNumber: string, make = "Recovery"): import("../packages/features/vehicle/records").VehicleRecordV1 {
  return {
    schemaVersion: 1, registrationNumber, make, model: "Test", vehicleType: "Car",
    fuelType: "CNG", yearOfManufacture: 2024, ownership: "Owned", lifecycleState: "active",
  };
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    const name = database.name;
    database.close();
    await database.delete();
    void name;
  }
});

describe("shared form recovery against the production Dexie adapter", () => {
  it("reopens and replays an Admin Vehicle create after the feature commit", async () => {
    const { repository } = await openStore();
    const vehicleService = new VehicleService(repository, assertVehicleRecordV1);
    const workingCopies = new InterruptCompletionOnce(new RecordFormWorkingCopyRepository(repository, "web"));
    const runtime = createAdminFormRuntimeV1({
      repository, recordSource: "web", performanceAdminSettings: new PerformanceAdminSettingsServiceV1(repository),
      handleBusinessExpenseSubmission: async () => undefined, vehicleService, workingCopyRepository: workingCopies,
    });
    const registrationNumber = "DXECR001";
    let copy = await runtime.open(VEHICLE_FORM_V1, "new:" + registrationNumber);
    for (const [field, value] of Object.entries({
      registrationNumber, make: "Recovery", model: "Test", vehicleType: "Car", fuelType: "CNG",
      yearOfManufacture: 2024, ownership: "Owned", lifecycleState: "active",
    })) copy = await runtime.update(VEHICLE_FORM_V1, copy, field, value);
    await expect(runtime.save(VEHICLE_FORM_V1, copy)).rejects.toThrow("simulated_process_death_after_domain_commit");
    const pending = await workingCopies.get(VEHICLE_FORM_V1.id, copy.instanceId);
    expect(pending?.status).toBe("pending");
    const committed = await vehicleService.getByRegistrationNumber(registrationNumber);
    expect(committed).toMatchObject({ revision: 1, data: { make: "Recovery" } });

    const retryRuntime = createAdminFormRuntimeV1({
      repository, recordSource: "web", performanceAdminSettings: new PerformanceAdminSettingsServiceV1(repository),
      handleBusinessExpenseSubmission: async () => undefined, vehicleService, workingCopyRepository: workingCopies,
    });
    const reopened = await retryRuntime.open(VEHICLE_FORM_V1, copy.instanceId);
    const replay = await retryRuntime.save(VEHICLE_FORM_V1, reopened);
    expect(replay).toEqual(committed);
    expect(await vehicleService.list()).toHaveLength(1);
    expect((await repository.list()).filter(row => row.id.startsWith("__sam_travels_feature_operation__:"))).toHaveLength(1);
  });

  it("reopens and replays a real Admin Vehicle update without applying revision twice", async () => {
    const { repository } = await openStore();
    const vehicleService = new VehicleService(repository, assertVehicleRecordV1);
    const original = await vehicleService.create(vehicleData("DXEUP001"), "web", undefined, "2026-11-19T08:00:00.000Z");
    const inner = new RecordFormWorkingCopyRepository(repository, "web");
    const workingCopies = new InterruptCompletionOnce(inner);
    const runtime = createAdminFormRuntimeV1({
      repository, recordSource: "web", performanceAdminSettings: new PerformanceAdminSettingsServiceV1(repository),
      handleBusinessExpenseSubmission: async () => undefined, vehicleService, workingCopyRepository: workingCopies,
    });
    const instanceId = original.id;
    const values = {
      ...vehicleData("DXEUP001", "Updated make"), _recordRevision: original.revision,
    };
    await inner.put({
      formId: VEHICLE_FORM_V1.id, formVersion: VEHICLE_FORM_V1.version, instanceId,
      revision: 0, status: "in_progress", values, operationId: "admin-update-dexie-operation",
      updatedAt: "2026-11-19T08:10:00.000Z",
    });
    const firstRuntime = createAdminFormRuntimeV1({
      repository, recordSource: "web", performanceAdminSettings: new PerformanceAdminSettingsServiceV1(repository),
      handleBusinessExpenseSubmission: async () => undefined, vehicleService, workingCopyRepository: workingCopies,
    });
    const firstCopy = await firstRuntime.open(VEHICLE_FORM_V1, instanceId);
    await expect(firstRuntime.save(VEHICLE_FORM_V1, firstCopy)).rejects.toThrow("simulated_process_death_after_domain_commit");
    const committed = await vehicleService.getById(original.id);
    expect(committed).toMatchObject({ revision: 2, data: { make: "Updated make" } });

    const retryRuntime = createAdminFormRuntimeV1({
      repository, recordSource: "web", performanceAdminSettings: new PerformanceAdminSettingsServiceV1(repository),
      handleBusinessExpenseSubmission: async () => undefined, vehicleService, workingCopyRepository: workingCopies,
    });
    const reopened = await retryRuntime.open(VEHICLE_FORM_V1, instanceId);
    const replay = await retryRuntime.save(VEHICLE_FORM_V1, reopened);
    expect(replay).toEqual(committed);
    expect((await vehicleService.getById(original.id))?.revision).toBe(2);
    expect((await repository.list()).filter(row => row.id.startsWith("__sam_travels_feature_operation__:"))).toHaveLength(1);
  });

  it("reopens and replays Fuel purchase submission using the same Dexie operation receipt", async () => {
    const { repository } = await openStore();
    const vehicleId = "feature:vehicle:DXEFUEL01";
    await repository.put({
      id: vehicleId, schemaVersion: 1, createdAt: "2026-11-19T08:00:00.000Z",
      updatedAt: "2026-11-19T08:00:00.000Z", source: "web", revision: 1,
      data: vehicleData("DXEFUEL01"),
    } satisfies RecordEnvelope<unknown>);
    const service = new BusinessExpensesService(repository, {
      validateRecord: assertBusinessExpenseRecordV1, validateFuelPurchase: assertFuelPurchaseV1,
      validateExpenseEntry: assertBusinessExpenseEntryV1, calculateDailyExpenses: calculateDailyBusinessExpenses,
      calculateFuelIntervals, calculateFuelCostRateHistory,
    }, { async getById(id) { return id === vehicleId ? await repository.get(id) as RecordEnvelope<{ lifecycleState: string }> : undefined; } });
    const handler = createBusinessExpenseFormSubmissionHandler(service, "web");
    const workingCopies = new InterruptCompletionOnce(new RecordFormWorkingCopyRepository(repository, "web"));
    const makeRuntime = () => new SharedFormRuntime(workingCopies, {
      submit: async command => {
        const result = await handler(command);
        if (result === undefined) throw new Error("fuel_handler_not_found");
        return result;
      },
    }, () => "2026-11-19T08:30:00.000Z", () => "dexie-fuel-operation");
    let copy = await makeRuntime().open(FUEL_ENTRY_FORM_V1, "123e4567-e89b-42d3-a456-426614174010");
    for (const [field, value] of Object.entries({
      vehicleId, odometerKm: 1200, priceRupeesPerKg: 95, amountRupees: 475, partialRefill: false,
    })) copy = await makeRuntime().update(FUEL_ENTRY_FORM_V1, copy, field, value);
    await expect(makeRuntime().submit(FUEL_ENTRY_FORM_V1, copy)).rejects.toThrow("simulated_process_death_after_domain_commit");
    const beforeRetry = (await service.listAll()).filter(row => row.id.includes("fuel-dexie-instance"));
    expect(beforeRetry).toHaveLength(1);
    const reopened = await makeRuntime().open(FUEL_ENTRY_FORM_V1, "fuel-dexie-instance");
    const replay = await makeRuntime().submit(FUEL_ENTRY_FORM_V1, reopened);
    expect(replay).toEqual(beforeRetry[0]);
    expect((await service.listAll()).filter(row => row.id.includes("fuel-dexie-instance"))).toEqual(beforeRetry);
  });
});
