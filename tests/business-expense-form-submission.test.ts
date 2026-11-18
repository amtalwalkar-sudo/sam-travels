import { afterEach, describe, expect, it, vi } from "vitest";
import { beginFuelLocationCapture, createBusinessExpenseFormSubmissionHandler } from "../apps/web/src/business-expense-form-submission";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

import {
  FUEL_ENTRY_FORM_V1,
  PLATFORM_FEE_FORM_V1, MISC_BUSINESS_EXPENSE_FORM_V1, TRAFFIC_CHALLAN_FORM_V1,
} from "../packages/application/src";

describe("Fuel Entry submit-time GPS acquisition", () => {
  it("requests a fresh device fix and resolves with its actual timestamp and accuracy", async () => {
    let success: ((position: GeolocationPosition) => void) | undefined;
    let options: PositionOptions | undefined;
    const geolocation = {
      getCurrentPosition(callback: (position: GeolocationPosition) => void, _error: unknown, requested?: PositionOptions) {
        success = callback;
        options = requested;
      },
    } as unknown as Geolocation;

    const capture = beginFuelLocationCapture(geolocation);
    expect(options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0, timeout: 6000 });
    expect(capture.completedAt()).toBeUndefined();

    success!({
      coords: {
        latitude: 19.076, longitude: 72.8777, accuracy: 12.5,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null,
      },
      timestamp: Date.parse("2026-11-14T20:00:02.000Z"),
    } as GeolocationPosition);

    await expect(capture.promise).resolves.toEqual({
      status: "captured", latitude: 19.076, longitude: 72.8777,
      accuracyMeters: 12.5, fixAt: "2026-11-14T20:00:02.000Z", gpsProvider: "device",
    });
    expect(capture.completedAt()).toEqual(expect.any(Number));
  });

  it("records permission denial as unavailable evidence instead of rejecting submission", async () => {
    let failure: ((error: GeolocationPositionError) => void) | undefined;
    const geolocation = {
      getCurrentPosition(_success: unknown, callback: (error: GeolocationPositionError) => void) {
        failure = callback;
      },
    } as unknown as Geolocation;
    const capture = beginFuelLocationCapture(geolocation);
    failure!({
      code: 1, message: "permission denied",
      PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
    } as GeolocationPositionError);
    await expect(capture.promise).resolves.toEqual({
      status: "permission_denied", reason: "permission_denied",
    });
    expect(capture.completedAt()).toEqual(expect.any(Number));
  });

  it("reports unsupported location without throwing", async () => {
    const capture = beginFuelLocationCapture(undefined);
    await expect(capture.promise).resolves.toEqual({
      status: "unavailable", reason: "geolocation_unsupported",
    });
  });
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
  it("commits the purchase fields before a delayed GPS fix and records late evidence separately", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T00:00:00.000Z"));
    let success: ((position: GeolocationPosition) => void) | undefined;
    const geolocation = {
      getCurrentPosition(callback: (position: GeolocationPosition) => void) {
        success = callback;
      },
    };
    vi.stubGlobal("navigator", { geolocation });

    const createFuelPurchase = vi.fn(async (input: unknown) => ({ id: "purchase-1", input }));
    const recordFuelLocationCapture = vi.fn(async (_input: unknown) => undefined);
    const source = { platform: "browser-test" };
    const submit = createBusinessExpenseFormSubmissionHandler(
      { createFuelPurchase } as never,
      source as never,
      { recordFuelLocationCapture } as never,
    );

    const result = await submit({
      formId: FUEL_ENTRY_FORM_V1.id,
      action: "submit",
      instanceId: "fuel-entry-instance-1",
      operationId: "fuel-entry-operation-1",
      values: {
        vehicleId: "vehicle-1",
        odometerKm: 12345,
        priceRupeesPerKg: 95.5,
        amountRupees: 477.25,
        partialRefill: true,
      },
    } as never);

    expect(createFuelPurchase).toHaveBeenCalledWith({
      uuid: "fuel-entry-instance-1",
      source,
      data: {
        vehicleId: "vehicle-1",
        odometerKm: 12345,
        pricePaisePerKg: 9550,
        amountPaise: 47725,
        partialRefill: true,
        occurredAt: "2026-11-18T00:00:00.000Z",
        businessDate: "2026-11-18",
      },
    });
    expect(result).toMatchObject({ id: "purchase-1" });
    expect(recordFuelLocationCapture).not.toHaveBeenCalled();

    success!({
      coords: {
        latitude: 19.076, longitude: 72.8777, accuracy: 8,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null,
      },
      timestamp: Date.parse("2026-11-18T00:00:02.000Z"),
    } as GeolocationPosition);

    await vi.waitFor(() => expect(recordFuelLocationCapture).toHaveBeenCalledWith({
      eventId: "fuel:purchase-1",
      outcome: {
        status: "captured",
        latitude: 19.076,
        longitude: 72.8777,
        accuracyMeters: 8,
        fixAt: "2026-11-18T00:00:02.000Z",
        gpsProvider: "device",
      },
      captureTiming: "late",
    }));
  });
});
