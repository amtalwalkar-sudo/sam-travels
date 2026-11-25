import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { driverAssignmentHistoryId } from "../packages/domain/src/driver-assignment";
import { driverRecordId } from "../packages/domain/src/driver-record-identity";
import { OperatingConfigurationServiceV1 } from "../packages/application/src/operating-configuration-service";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";
import { MaintenanceService } from "../packages/application/src/maintenance-service";
import { FinanceLoanService } from "../packages/application/src/finance-loan-service";
import { ComplianceService } from "../packages/application/src/compliance-service";
import {
  assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory,
} from "../packages/features/business-expenses";
import { assertMaintenanceRecordV1, calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant } from "../packages/features/maintenance";
import { assertComplianceRecordV1 } from "../packages/features/compliance";
import { assertFinanceLoanRecordV1, createLoanScheduleVersion, loanCalculationInputsChanged } from "../packages/features/finance";

class MemoryRepository implements AtomicRecordBatchRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    if ((this.rows.get(id)?.revision ?? null) !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>); return true;
  }
  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]) {
    for (const item of mutations) if ((this.rows.get(item.id)?.revision ?? null) !== item.expectedRevision) return false;
    for (const item of mutations) this.rows.set(item.id, item.next as RecordEnvelope<unknown>);
    return true;
  }
}
const at = "2026-11-20T08:00:00.000Z";
const vehicleId = "feature:vehicle:MH01AB1234";
const otherVehicleId = "feature:vehicle:MH02CD5678";
function row<T>(id: string, data: T): RecordEnvelope<T> {
  return { id, schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision: 1, data };
}
async function setup(configurationOverride?: (base: OperatingConfigurationServiceV1) => Pick<OperatingConfigurationServiceV1, "get" | "assertCurrent">) {
  const repository = new MemoryRepository();
  await repository.put(row("work:selected-driver", { schemaVersion: 1, driverId: "driver-1" }));
  await repository.put(row(driverRecordId("driver-1"), {
    schemaVersion: 1, driverId: "driver-1", name: "Configured Driver", lifecycleState: "active",
  }));
  await repository.put(row(vehicleId, {
    schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata", model: "Ace",
    vehicleType: "LCV", fuelType: "CNG", yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
  }));
  await repository.put(row(driverAssignmentHistoryId("driver-1"), {
    schemaVersion: 1, driverId: "driver-1",
    assignments: [{ assignmentId: "assignment-1", vehicleId, assignedAt: at }],
  }));
  await repository.put(row(otherVehicleId, {
    schemaVersion: 1, registrationNumber: "MH02CD5678", make: "Tata", model: "Ace",
    vehicleType: "LCV", fuelType: "CNG", yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "inactive",
  }));
  const configuration = new OperatingConfigurationServiceV1(repository);
  const operatingConfiguration = configurationOverride?.(configuration) ?? configuration;
  const vehicles = { async getById(id: string) { return repository.get<{ lifecycleState: string }>(id); } };
  const expenses = new BusinessExpensesService(repository, {
    validateRecord: assertBusinessExpenseRecordV1, validateFuelPurchase: assertFuelPurchaseV1,
    validateExpenseEntry: assertBusinessExpenseEntryV1, calculateDailyExpenses: calculateDailyBusinessExpenses,
    calculateFuelIntervals, calculateFuelCostRateHistory,
  }, vehicles, () => at, undefined, operatingConfiguration);
  const maintenance = new MaintenanceService(repository, assertMaintenanceRecordV1, vehicles,
    calculateMaintenanceVisitTotal, maintenanceBusinessDateFromInstant, () => at, operatingConfiguration);
  const finance = new FinanceLoanService(repository, vehicles, assertFinanceLoanRecordV1,
    createLoanScheduleVersion, loanCalculationInputsChanged, () => at, operatingConfiguration);
  return { repository, expenses, maintenance, finance };
}

describe("operating-context command guards", () => {
  it("rejects Fuel and Business Expense writes for a vehicle outside the configured pair", async () => {
    const { repository, expenses } = await setup();
    const before = await repository.list();
    await expect(expenses.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174040", source: "web",
      data: { businessDate: "2026-11-20", occurredAt: at, vehicleId: otherVehicleId,
        odometerKm: 45000, pricePaisePerKg: 9000, amountPaise: 18000, partialRefill: false },
    })).rejects.toThrow("business_expense_operating_vehicle_mismatch");
    await expect(expenses.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174041", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-20", amountPaise: 10000,
        currencyCode: "INR", effect: "charge", vehicleId, driverId: "driver-2",
        category: "Cleaning", description: "Wrong driver attribution" },
    })).rejects.toThrow("business_expense_operating_driver_mismatch");
    expect(await repository.list()).toEqual(before);
  });

  it("rejects Maintenance and Finance writes for a vehicle outside the configured pair", async () => {
    const { repository, maintenance, finance, compliance } = await setup();
    const before = await repository.list();
    await expect(maintenance.createExpense({
      uuid: "123e4567-e89b-42d3-a456-426614174042", source: "web",
      data: { vehicleId: otherVehicleId, expenseDate: "2026-11-20",
        expenseName: "Tyre", description: "Other vehicle expense", amountPaise: 10000 },
    })).rejects.toThrow("maintenance_operating_vehicle_mismatch");
    await expect(finance.create({
      uuid: "123e4567-e89b-42d3-a456-426614174043", source: "web",
      details: { loanName: "Other vehicle loan", lenderName: "Lender", vehicleId: otherVehicleId,
        principalPaise: 100000, annualInterestRateBasisPoints: 1200, loanStartDate: "2026-11-20",
        tenureMonths: 12, firstEmiDate: "2026-12-01" },
    })).rejects.toThrow("finance_loan_operating_vehicle_mismatch");
    expect(await repository.list()).toEqual(before);
  });
  it("rejects stale operating-configuration revisions before Fuel, expense, Maintenance and Finance writes", async () => {
    const { repository, expenses, maintenance, finance, compliance } = await setup(base => ({
      get: () => base.get(),
      assertCurrent: async () => { throw new Error("operating_configuration_stale"); },
    }));
    const before = await repository.list();
    await expect(expenses.createFuelPurchase({
      uuid: "123e4567-e89b-42d3-a456-426614174044", source: "web",
      data: { businessDate: "2026-11-20", occurredAt: at, vehicleId,
        odometerKm: 45001, pricePaisePerKg: 9000, amountPaise: 18000, partialRefill: false },
    })).rejects.toThrow("operating_configuration_stale");
    await expect(expenses.createExpenseEntry({
      uuid: "123e4567-e89b-42d3-a456-426614174045", source: "web",
      data: { sourceKind: "miscellaneous", businessDate: "2026-11-20", amountPaise: 10000,
        currencyCode: "INR", effect: "charge", vehicleId, driverId: "driver-1",
        category: "Cleaning", description: "Configured operating context changed before commit" },
    })).rejects.toThrow("operating_configuration_stale");
    await expect(maintenance.createExpense({
      uuid: "123e4567-e89b-42d3-a456-426614174046", source: "web",
      data: { vehicleId, expenseDate: "2026-11-20",
        expenseName: "Tyre", description: "Configured operating context changed before commit", amountPaise: 10000 },
    })).rejects.toThrow("operating_configuration_stale");
    await expect(finance.create({
      uuid: "123e4567-e89b-42d3-a456-426614174047", source: "web",
      details: { loanName: "Configured vehicle loan", lenderName: "Lender", vehicleId,
        principalPaise: 100000, annualInterestRateBasisPoints: 1200, loanStartDate: "2026-11-20",
        tenureMonths: 12, firstEmiDate: "2026-12-01" },
    })).rejects.toThrow("operating_configuration_stale");
    expect(await repository.list()).toEqual(before);
  });

});
