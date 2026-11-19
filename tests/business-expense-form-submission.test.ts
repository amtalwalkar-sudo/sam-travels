import { afterEach, describe, expect, it, vi } from "vitest";
import { createBusinessExpenseFormSubmissionHandler } from "../apps/web/src/business-expense-form-submission";
import {
  FUEL_ENTRY_FORM_V1,
  PLATFORM_FEE_FORM_V1, MISC_BUSINESS_EXPENSE_FORM_V1, TRAFFIC_CHALLAN_FORM_V1,
} from "../packages/application/src";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Admin business expense form submission mapping", () => {
  function setup() {
    const createExpenseEntry = vi.fn(async (input: unknown) => input);
    const source = { platform: "browser-test" };
    const submit = createBusinessExpenseFormSubmissionHandler(
      { createExpenseEntry } as never,
      source as never,
    );
    const command = (formId: string, values: Record<string, unknown>) => ({
      formId, action: "save", instanceId: "admin-entry-1", operationId: "operation-1", values,
    }) as never;
    return { createExpenseEntry, submit, command, source };
  }

  it("maps Platform Fee fields to the distinct fee record contract", async () => {
    const { createExpenseEntry, submit, command, source } = setup();
    await submit(command(PLATFORM_FEE_FORM_V1.id, {
      businessDate: "2026-11-14", vehicleId: "vehicle-1", amountRupees: 12.34, reference: "trip-42",
      description: "platform settlement",
    }));
    expect(createExpenseEntry).toHaveBeenCalledWith({
      uuid: "admin-entry-1", source,
      data: {
        sourceKind: "platform_fee", businessDate: "2026-11-14", amountPaise: 1234,
        currencyCode: "INR", effect: "charge", vehicleId: "vehicle-1", reference: "trip-42",
        description: "platform settlement",
      },
    });
  });

  it("maps Miscellaneous Expense fields without losing optional attribution", async () => {
    const { createExpenseEntry, submit, command, source } = setup();
    await submit(command(MISC_BUSINESS_EXPENSE_FORM_V1.id, {
      businessDate: "2026-11-13", category: "Parking", amountRupees: 50,
      tripExpenseTreatment: "standalone",
      vehicleId: "vehicle-1", driverId: "driver-1", description: "airport parking",
      reference: "receipt-7",
    }));
    expect(createExpenseEntry).toHaveBeenCalledWith({
      uuid: "admin-entry-1", source,
      data: {
        sourceKind: "miscellaneous", businessDate: "2026-11-13", amountPaise: 5000,
        currencyCode: "INR", effect: "charge", category: "Parking",
        tripExpenseTreatment: "standalone", vehicleId: "vehicle-1", driverId: "driver-1", description: "airport parking",
        reference: "receipt-7",
      },
    });
  });

  it("maps an explicit trip-closeout toll or parking identity for duplicate protection", async () => {
    const { createExpenseEntry, submit, command, source } = setup();
    await submit(command(MISC_BUSINESS_EXPENSE_FORM_V1.id, {
      businessDate: "2026-11-13", category: "Toll", amountRupees: 12,
      tripExpenseTreatment: "already-in-trip-closeout",
      tripFinancialSourceId: "work:trip-financial-obligation:trip-42",
      tripFinancialComponent: "toll",
    }));
    expect(createExpenseEntry).toHaveBeenCalledWith({
      uuid: "admin-entry-1", source,
      data: {
        sourceKind: "miscellaneous", businessDate: "2026-11-13", amountPaise: 1200,
        currencyCode: "INR", effect: "charge", category: "Toll",
        tripExpenseTreatment: "already-in-trip-closeout",
        tripFinancialSourceId: "work:trip-financial-obligation:trip-42",
        tripFinancialComponent: "toll",
      },
    });
    await expect(submit(command(MISC_BUSINESS_EXPENSE_FORM_V1.id, {
      businessDate: "2026-11-13", category: "Toll", amountRupees: 12,
      tripExpenseTreatment: "already-in-trip-closeout", tripFinancialComponent: "toll",
    }))).rejects.toThrow("business_expense_trip_financial_source_required");
  });

  it("maps Traffic Challan to its separate vehicle and payment-state record", async () => {
    const { createExpenseEntry, submit, command, source } = setup();
    await submit(command(TRAFFIC_CHALLAN_FORM_V1.id, {
      businessDate: "2026-11-12", vehicleId: "vehicle-2", driverId: "driver-2",
      amountRupees: 500, description: "Signal violation", reference: "challan-8",
      paymentStatus: "unpaid",
    }));
    expect(createExpenseEntry).toHaveBeenCalledWith({
      uuid: "admin-entry-1", source,
      data: {
        sourceKind: "traffic_challan", businessDate: "2026-11-12", amountPaise: 50000,
        currencyCode: "INR", effect: "charge", vehicleId: "vehicle-2",
        paymentStatus: "unpaid", description: "Signal violation",
        driverId: "driver-2", reference: "challan-8",
      },
    });
  });

  it("requires toll and parking entries to declare standalone or trip-closeout treatment", async () => {
    const { submit, command } = setup();
    await expect(submit(command(MISC_BUSINESS_EXPENSE_FORM_V1.id, {
      businessDate: "2026-11-13", category: "Parking", amountRupees: 50,
    }))).rejects.toThrow("business_expense_toll_parking_treatment_required");
    await expect(submit(command(MISC_BUSINESS_EXPENSE_FORM_V1.id, {
      businessDate: "2026-11-13", category: "Parking", amountRupees: 50,
      tripExpenseTreatment: "already-in-trip-closeout",
      tripFinancialSourceId: "work:trip-financial-obligation:trip-42",
    }))).rejects.toThrow("business_expense_trip_financial_source_required");
  });

  it("rejects invalid currency amounts and missing owner-required fields", async () => {
    const { submit, command } = setup();
    await expect(submit(command(PLATFORM_FEE_FORM_V1.id, {
      businessDate: "2026-11-14", vehicleId: "vehicle-1", amountRupees: 12.345, reference: "trip-1",
    }))).rejects.toThrow("business_expense_amount_invalid");
    await expect(submit(command(MISC_BUSINESS_EXPENSE_FORM_V1.id, {
      businessDate: "2026-11-14", amountRupees: 10,
    }))).rejects.toThrow("miscellaneous_expense_category_required");
    await expect(submit(command(TRAFFIC_CHALLAN_FORM_V1.id, {
      businessDate: "2026-11-14", amountRupees: 10, description: "Violation", paymentStatus: "unpaid",
    }))).rejects.toThrow("traffic_challan_vehicle_required");
  });
});


describe("Fuel Entry form submission mapping", () => {
  it("submits the authoritative purchase without requesting or persisting GPS", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T00:00:00.000Z"));
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    const createFuelPurchase = vi.fn(async (input: unknown) => ({ id: "purchase-1", input }));
    const source = { platform: "browser-test" };
    const submit = createBusinessExpenseFormSubmissionHandler(
      { createFuelPurchase } as never,
      source as never,
    );
    const result = await submit({
      formId: FUEL_ENTRY_FORM_V1.id,
      action: "submit",
      instanceId: "fuel-entry-instance-1",
      operationId: "fuel-entry-operation-1",
      submittedAt: "2026-11-18T00:00:00.000Z",
      payloadFingerprint: '{"fuel":"purchase-1"}',
      values: {
        vehicleId: "vehicle-1", odometerKm: 12345, priceRupeesPerKg: 95.5,
        amountRupees: 477.25, partialRefill: true,
      },
    } as never);
    expect(createFuelPurchase).toHaveBeenCalledWith({
      uuid: "fuel-entry-instance-1", source,
      operation: { operationId: "fuel-entry-operation-1", payloadFingerprint: '{"fuel":"purchase-1"}' },
      now: "2026-11-18T00:00:00.000Z",
      data: {
        vehicleId: "vehicle-1", odometerKm: 12345, pricePaisePerKg: 9550,
        amountPaise: 47725, partialRefill: true,
        occurredAt: "2026-11-18T00:00:00.000Z", businessDate: "2026-11-18",
      },
    });
    expect(result).toMatchObject({ id: "purchase-1" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
