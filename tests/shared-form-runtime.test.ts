import { describe, expect, it } from "vitest";
import { BUSINESS_SETUP_FORM_V1, VEHICLE_FORM_V1, DRIVER_FORM_V1, COMPLIANCE_FORM_V1, MAINTENANCE_VISIT_FORM_V1, MAINTENANCE_EXPENSE_FORM_V1, MAINTENANCE_RATE_FORM_V1, LOAN_DETAILS_FORM_V1 } from "../packages/application/src/admin-form-definitions";
import {
  SharedFormRuntime, validateFormValues,
  type FormDefinition, type FormWorkingCopy, type FormWorkingCopyRepository,
} from "../packages/application/src/shared-form-runtime";

class MemoryCopies implements FormWorkingCopyRepository {
  private readonly rows = new Map<string, FormWorkingCopy>();
  async get(formId: string, instanceId: string) { return this.rows.get(formId + ":" + instanceId); }
  async list(formId: string) { return [...this.rows.values()].filter(copy => copy.formId === formId); }
  async put(copy: FormWorkingCopy, expectedRevision?: number) {
    const key = copy.formId + ":" + copy.instanceId;
    const current = this.rows.get(key);
    if (expectedRevision !== undefined && current?.revision !== expectedRevision) throw new Error("form_copy_revision_conflict");
    if (expectedRevision === undefined && current) throw new Error("form_copy_already_exists");
    this.rows.set(key, copy);
  }
  async remove(formId: string, instanceId: string) { this.rows.delete(formId + ":" + instanceId); }
}

const definition: FormDefinition = {
  id: "work.trip-fare", version: 1, owner: "work", purpose: "Finalize a completed trip fare",
  primaryAction: "submit",
  fields: [
    { id: "farePaise", label: "Fare", type: "number", required: true },
    { id: "tripDate", label: "Trip date", type: "date", required: true },
    { id: "payer", label: "Toll payer", type: "select", options: ["Driver", "Customer"] },
  ],
};

describe("shared form runtime", () => {
  it("validates the canonical Admin Business Setup definition", () => {
    expect(BUSINESS_SETUP_FORM_V1).toMatchObject({
      id: "admin.business-setup", version: 1, owner: "business-settings", primaryAction: "save",
    });
    expect(validateFormValues(BUSINESS_SETUP_FORM_V1, {})).toMatchObject([
      { fieldId: "businessStartDate", code: "required" },
    ]);
    expect(validateFormValues(BUSINESS_SETUP_FORM_V1, { businessStartDate: "2026-02-31" })).toMatchObject([
      { fieldId: "businessStartDate", code: "date" },
    ]);
    expect(validateFormValues(BUSINESS_SETUP_FORM_V1, { businessStartDate: "2020-01-01" })).toEqual([]);
  });

  it("validates the canonical Vehicle definition and its domain field constraints", () => {
    expect(VEHICLE_FORM_V1).toMatchObject({
      id: "admin.vehicle", version: 1, owner: "vehicles", primaryAction: "save",
    });
    expect(validateFormValues(VEHICLE_FORM_V1, {})).toMatchObject([
      { fieldId: "registrationNumber", code: "required" },
      { fieldId: "make", code: "required" },
      { fieldId: "model", code: "required" },
      { fieldId: "vehicleType", code: "required" },
      { fieldId: "fuelType", code: "required" },
      { fieldId: "yearOfManufacture", code: "required" },
      { fieldId: "ownership", code: "required" },
      { fieldId: "lifecycleState", code: "required" },
    ]);
    const valid = {
      registrationNumber: "MH01AB1234", make: "Maruti", model: "Ertiga",
      vehicleType: "Car", fuelType: "Diesel", yearOfManufacture: 2022,
      ownership: "Owned", lifecycleState: "active",
    };
    expect(validateFormValues(VEHICLE_FORM_V1, valid)).toEqual([]);
    expect(validateFormValues(VEHICLE_FORM_V1, { ...valid, fuelType: "Unleaded" }))
      .toMatchObject([{ fieldId: "fuelType", code: "option" }]);
    expect(validateFormValues(VEHICLE_FORM_V1, { ...valid, make: "x".repeat(81) }))
      .toMatchObject([{ fieldId: "make", code: "max_length" }]);
    expect(validateFormValues(VEHICLE_FORM_V1, { ...valid, yearOfManufacture: "2022" }))
      .toMatchObject([{ fieldId: "yearOfManufacture", code: "type" }]);
  });

  it("validates the canonical Driver definition and profile fields", () => {
    expect(DRIVER_FORM_V1).toMatchObject({
      id: "admin.driver", version: 1, owner: "driver-records", primaryAction: "save",
    });
    expect(validateFormValues(DRIVER_FORM_V1, {})).toMatchObject([
      { fieldId: "name", code: "required" },
      { fieldId: "lifecycleState", code: "required" },
    ]);
    const valid = { name: "A Driver", licenceNumber: "DL-123", licenceExpiryDate: "2027-05-31",
      mobileNumber: "9876543210", lifecycleState: "active", _selectedForWork: false, _recordRevision: 2 };
    expect(validateFormValues(DRIVER_FORM_V1, valid)).toEqual([]);
    expect(validateFormValues(DRIVER_FORM_V1, { ...valid, lifecycleState: "suspended" }))
      .toMatchObject([{ fieldId: "lifecycleState", code: "option" }]);
    expect(validateFormValues(DRIVER_FORM_V1, { ...valid, licenceExpiryDate: "2027-02-30" }))
      .toMatchObject([{ fieldId: "licenceExpiryDate", code: "date" }]);
    expect(validateFormValues(DRIVER_FORM_V1, { ...valid, name: "x".repeat(121) }))
      .toMatchObject([{ fieldId: "name", code: "max_length" }]);
  });

  it("validates the canonical immutable Compliance creation form", () => {
    expect(COMPLIANCE_FORM_V1).toMatchObject({
      id: "admin.compliance", version: 1, owner: "compliance", primaryAction: "save",
    });
    expect(validateFormValues(COMPLIANCE_FORM_V1, {})).toMatchObject([
      { fieldId: "vehicleId", code: "required" },
      { fieldId: "complianceName", code: "required" },
      { fieldId: "validFrom", code: "required" },
      { fieldId: "validTo", code: "required" },
      { fieldId: "totalCostPaise", code: "required" },
    ]);
    const valid = { vehicleId: "feature:vehicle:MH01AB1234", complianceName: "Insurance", validFrom: "2026-01-01", validTo: "2026-12-31",
      totalCostPaise: 36500, supportingDocumentRef: "policy-1", renewedFromRecordId: "" };
    expect(validateFormValues(COMPLIANCE_FORM_V1, valid)).toEqual([]);
    expect(validateFormValues(COMPLIANCE_FORM_V1, { ...valid, validFrom: "2026-02-30" }))
      .toMatchObject([{ fieldId: "validFrom", code: "date" }]);
    expect(validateFormValues(COMPLIANCE_FORM_V1, { ...valid, totalCostPaise: "36500" }))
      .toMatchObject([{ fieldId: "totalCostPaise", code: "type" }]);
    expect(validateFormValues(COMPLIANCE_FORM_V1, { ...valid, complianceName: "x".repeat(121) }))
      .toMatchObject([{ fieldId: "complianceName", code: "max_length" }]);
  });

  it("validates the canonical Maintenance visit, expense, and rate form definitions", () => {
    expect(MAINTENANCE_VISIT_FORM_V1).toMatchObject({
      id: "admin.maintenance-visit", version: 1, owner: "maintenance", primaryAction: "save",
    });
    expect(validateFormValues(MAINTENANCE_VISIT_FORM_V1, {})).toMatchObject([
      { fieldId: "vehicleId", code: "required" },
      { fieldId: "maintenanceDate", code: "required" },
      { fieldId: "maintenanceType", code: "required" },
      { fieldId: "description", code: "required" },
      { fieldId: "itemsJson", code: "required" },
    ]);
    const visit = { vehicleId: "feature:vehicle:MH01AB1234", maintenanceDate: "2026-01-01",
      maintenanceType: "Service", description: "Oil change", itemsJson: "[]",
      odometerKm: 45000, nextServiceDate: "2026-07-01", nextServiceKm: 50000 };
    expect(validateFormValues(MAINTENANCE_VISIT_FORM_V1, visit)).toEqual([]);
    expect(validateFormValues(MAINTENANCE_VISIT_FORM_V1, { ...visit, maintenanceDate: "2026-02-30" }))
      .toMatchObject([{ fieldId: "maintenanceDate", code: "date" }]);

    expect(MAINTENANCE_EXPENSE_FORM_V1).toMatchObject({
      id: "admin.maintenance-expense", version: 1, owner: "maintenance", primaryAction: "save",
    });
    expect(validateFormValues(MAINTENANCE_EXPENSE_FORM_V1, {
      vehicleId: "feature:vehicle:MH01AB1234", expenseDate: "2026-01-01",
      expenseName: "Towing", description: "Roadside assistance", amountPaise: 0,
    })).toEqual([]);
    expect(validateFormValues(MAINTENANCE_EXPENSE_FORM_V1, { amountPaise: "0" }))
      .toEqual(expect.arrayContaining([{ fieldId: "amountPaise", code: "type", message: "Amount in paise must be a valid number." }]));

    expect(MAINTENANCE_RATE_FORM_V1).toMatchObject({
      id: "admin.maintenance-rate", version: 1, owner: "maintenance", primaryAction: "save",
    });
    expect(validateFormValues(MAINTENANCE_RATE_FORM_V1, {
      vehicleId: "feature:vehicle:MH01AB1234", ratePaisePerKm: 250,
    })).toEqual([]);
  });

  it("validates the canonical Loan details form and permits historical dates", () => {
    expect(LOAN_DETAILS_FORM_V1).toMatchObject({
      id: "admin.loan-details", version: 1, owner: "finance-loans", primaryAction: "save",
    });
    expect(validateFormValues(LOAN_DETAILS_FORM_V1, {})).toMatchObject([
      { fieldId: "vehicleId", code: "required" },
      { fieldId: "loanName", code: "required" },
      { fieldId: "lenderName", code: "required" },
      { fieldId: "principalPaise", code: "required" },
      { fieldId: "annualInterestRateBasisPoints", code: "required" },
      { fieldId: "loanStartDate", code: "required" },
      { fieldId: "tenureMonths", code: "required" },
      { fieldId: "firstEmiDate", code: "required" },
    ]);
    const valid = {
      vehicleId: "feature:vehicle:MH01AB1234", loanName: "Vehicle loan", lenderName: "Bank",
      principalPaise: 12500000, annualInterestRateBasisPoints: 950, loanStartDate: "2020-01-01",
      tenureMonths: 60, firstEmiDate: "2020-02-01", _recordRevision: 3,
    };
    expect(validateFormValues(LOAN_DETAILS_FORM_V1, valid)).toEqual([]);
    expect(validateFormValues(LOAN_DETAILS_FORM_V1, { ...valid, loanStartDate: "2020-02-30" }))
      .toMatchObject([{ fieldId: "loanStartDate", code: "date" }]);
    expect(validateFormValues(LOAN_DETAILS_FORM_V1, { ...valid, principalPaise: "12500000" }))
      .toMatchObject([{ fieldId: "principalPaise", code: "type" }]);
  });

  it("validates declared field mechanics without inventing feature business rules", () => {
    expect(validateFormValues(definition, {})).toEqual([
      { fieldId: "farePaise", code: "required", message: "Fare is required." },
      { fieldId: "tripDate", code: "required", message: "Trip date is required." },
    ]);
    expect(validateFormValues(definition, { farePaise: 0, tripDate: "2026-11-10", payer: "Customer" })).toEqual([]);
    expect(validateFormValues(definition, { farePaise: -10, tripDate: "2026-11-10" })).toEqual([]);
    expect(validateFormValues(definition, { farePaise: 10, tripDate: "2026-02-31" })).toMatchObject([{ fieldId: "tripDate", code: "date" }]);
  });

  it("restores an in-progress working copy without treating it as submitted", async () => {
    const copies = new MemoryCopies();
    const runtime = new SharedFormRuntime(copies, { submit: async () => ({ ok: true }) }, () => "2026-11-10T00:00:00.000Z", () => "operation-1");
    const opened = await runtime.open(definition, "trip-123");
    const edited = await runtime.update(definition, opened, "farePaise", 0);
    const reopened = await runtime.open(definition, "trip-123");
    expect(reopened).toMatchObject({ status: "in_progress", revision: 1, values: { farePaise: 0 }, operationId: "operation-1" });
    expect(reopened).toEqual(edited);
  });

  it("discovers only in-progress drafts for the requested form definition", async () => {
    const copies = new MemoryCopies();
    const runtime = new SharedFormRuntime(copies, { submit: async () => undefined }, undefined, () => "draft-operation");
    const first = await runtime.open(definition, "trip-draft-1");
    await runtime.update(definition, first, "farePaise", 0);
    await runtime.open(definition, "trip-draft-2");
    const other = { ...definition, id: "work.trip-toll" };
    await runtime.open(other, "trip-draft-3");
    const drafts = await runtime.listDrafts(definition);
    expect(drafts.map(copy => copy.instanceId)).toEqual(["trip-draft-1", "trip-draft-2"]);
    expect(drafts[0]).toMatchObject({ status: "in_progress", values: { farePaise: 0 } });
  });

  it("submits once and marks the working copy submitted only after durable success", async () => {
    const copies = new MemoryCopies();
    let submissions = 0;
    const runtime = new SharedFormRuntime(copies, {
      submit: async command => { submissions += 1; expect(command.action).toBe("submit"); expect(command.instanceId).toBe("trip-456"); return { operationId: command.operationId }; },
    }, () => "2026-11-10T00:00:00.000Z", () => "operation-2");
    let copy = await runtime.open(definition, "trip-456");
    copy = await runtime.update(definition, copy, "farePaise", 0);
    copy = await runtime.update(definition, copy, "tripDate", "2026-11-10");
    const result = await runtime.submit(definition, copy);
    expect(result).toEqual({ operationId: "operation-2" });
    expect(submissions).toBe(1);
    expect(await copies.get(definition.id, "trip-456")).toMatchObject({ status: "submitted", revision: 3 });
    await expect(runtime.submit(definition, copy)).rejects.toThrow("form_copy_revision_conflict");
    expect(submissions).toBe(1);
  });

  it("saves incomplete drafts, allows edits, and marks them saved only after Save succeeds", async () => {
    const copies = new MemoryCopies();
    const actions: string[] = [];
    const saveDefinition = { ...definition, id: "admin.vehicle", primaryAction: "save" as const };
    const runtime = new SharedFormRuntime(copies, { submit: async command => { actions.push(command.action); return "saved"; } },
      () => "2026-11-10T00:00:00.000Z", () => "operation-save");
    let copy = await runtime.open(saveDefinition, "vehicle-1");
    await runtime.save(saveDefinition, copy);
    copy = (await copies.get(saveDefinition.id, "vehicle-1"))!;
    expect(copy).toMatchObject({ status: "saved", revision: 1, values: {} });
    copy = await runtime.update(saveDefinition, copy, "farePaise", 0);
    expect(copy.status).toBe("in_progress");
    await runtime.save(saveDefinition, copy);
    expect(actions).toEqual(["save", "save"]);
    expect(await copies.get(saveDefinition.id, "vehicle-1")).toMatchObject({ status: "saved", revision: 3 });
  });

  it("does not submit invalid data or permit Submit on Save-only forms", async () => {
    let submissions = 0;
    const runtime = new SharedFormRuntime(new MemoryCopies(), { submit: async () => { submissions += 1; } }, undefined, () => "operation-3");
    const copy = await runtime.open(definition, "trip-789");
    await expect(runtime.submit(definition, copy)).rejects.toThrow("form_validation_failed");
    const saveOnly = { ...definition, id: "admin.vehicle", primaryAction: "save" as const };
    const draft = await runtime.open(saveOnly, "vehicle-1");
    await expect(runtime.submit(saveOnly, draft)).rejects.toThrow("form_primary_action_is_save");
    expect(submissions).toBe(0);
  });

  it("rejects stale working-copy revisions rather than overwriting newer values", async () => {
    const copies = new MemoryCopies();
    const runtime = new SharedFormRuntime(copies, { submit: async () => undefined }, undefined, () => "operation-4");
    const opened = await runtime.open(definition, "trip-conflict");
    await runtime.update(definition, opened, "farePaise", 12500);
    await expect(runtime.update(definition, opened, "farePaise", 999)).rejects.toThrow("form_copy_revision_conflict");
    expect(await copies.get(definition.id, "trip-conflict")).toMatchObject({ values: { farePaise: 12500 }, revision: 1 });
  });
});
