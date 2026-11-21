import type { FormSubmissionCommand } from "../../../packages/application/src/form-submission-port";
import type { AdminPresentationServices } from "../../../packages/application/src/admin-presentation-services";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import {
  FUEL_ENTRY_FORM_V1,
  PLATFORM_FEE_FORM_V1,
  MISC_BUSINESS_EXPENSE_FORM_V1,
  TRAFFIC_CHALLAN_FORM_V1,
} from "../../../packages/application/src";
import { maintenanceBusinessDateFromInstant } from "../../../packages/features/maintenance";

function positiveRupeesToPaise(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(code);
  const decimal = String(value);
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(decimal)) throw new Error(code);
  const [whole, fraction = ""] = decimal.split(".");
  const paise = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(code);
  return Number(paise);
}
function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}
function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}


/** Creates a feature-owned form adapter with explicit application dependencies. */
export function createBusinessExpenseFormSubmissionHandler(
  service: AdminPresentationServices["businessExpenses"],
  source: RecordEnvelope<unknown>["source"],
): (command: FormSubmissionCommand) => Promise<unknown | undefined> {
  return async (command: FormSubmissionCommand): Promise<unknown | undefined> => {
    const values = command.values;

  if (command.formId === FUEL_ENTRY_FORM_V1.id) {
    if (command.action !== "submit") throw new Error("fuel_entry_requires_submit");
    const occurredAt = command.submittedAt;
    return service.createFuelPurchase({
      uuid: command.instanceId, source,
      operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
      now: command.submittedAt,
      data: {
        vehicleId: requiredString(values.vehicleId, "fuel_vehicle_required"),
        odometerKm: positiveInteger(values.odometerKm, "fuel_odometer_invalid"),
        pricePaisePerKg: positiveRupeesToPaise(values.priceRupeesPerKg, "fuel_price_invalid"),
        amountPaise: positiveRupeesToPaise(values.amountRupees, "fuel_amount_invalid"),
        partialRefill: values.partialRefill === true,
        occurredAt,
        businessDate: maintenanceBusinessDateFromInstant(occurredAt),
      },
    });
  }

  if (![PLATFORM_FEE_FORM_V1.id, MISC_BUSINESS_EXPENSE_FORM_V1.id, TRAFFIC_CHALLAN_FORM_V1.id].includes(command.formId as never)) {
    return undefined;
  }
  if (command.action !== "save") throw new Error("business_expense_admin_form_requires_save");
  const businessDate = requiredString(values.businessDate, "business_expense_date_required");
  const amountPaise = positiveRupeesToPaise(values.amountRupees, "business_expense_amount_invalid");

  if (command.formId === PLATFORM_FEE_FORM_V1.id) {
    return service.createExpenseEntry({
      uuid: command.instanceId, source,
      operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
      now: command.submittedAt,
      data: {
        sourceKind: "platform_fee", businessDate, amountPaise, currencyCode: "INR", effect: "charge",
        vehicleId: requiredString(values.vehicleId, "platform_fee_vehicle_required"),
        reference: requiredString(values.reference, "platform_fee_source_reference_required"),
        ...(optionalString(values.description) ? { description: optionalString(values.description) } : {}),
      },
    });
  }
  if (command.formId === MISC_BUSINESS_EXPENSE_FORM_V1.id) {
    const category = requiredString(values.category, "miscellaneous_expense_category_required");
    const tripTreatment = optionalString(values.tripExpenseTreatment);
    const hasTripLink = !!optionalString(values.tripFinancialSourceId) || !!optionalString(values.tripFinancialComponent);
    const tollOrParking = /\b(tolls?|parking)\b/i.test(category);
    if (tollOrParking && tripTreatment !== "standalone" && tripTreatment !== "already-in-trip-closeout") {
      throw new Error("business_expense_toll_parking_treatment_required");
    }
    if (tripTreatment === "already-in-trip-closeout" &&
        (!optionalString(values.tripFinancialSourceId) || !optionalString(values.tripFinancialComponent))) {
      throw new Error("business_expense_trip_financial_source_required");
    }
    if (tripTreatment === "standalone" && hasTripLink) {
      throw new Error("business_expense_standalone_must_not_link_trip_source");
    }
    if (tripTreatment && !["standalone", "already-in-trip-closeout"].includes(tripTreatment)) {
      throw new Error("business_expense_toll_parking_treatment_invalid");
    }
    if (tripTreatment === "already-in-trip-closeout" && !tollOrParking) {
      throw new Error("business_expense_trip_link_requires_toll_or_parking");
    }
    return service.createExpenseEntry({
      uuid: command.instanceId, source,
      operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
      now: command.submittedAt,
      data: {
        sourceKind: "miscellaneous", businessDate, amountPaise, currencyCode: "INR", effect: "charge",
        category,
        ...(tollOrParking
          ? { tripExpenseTreatment: tripTreatment as "standalone" | "already-in-trip-closeout" }
          : {}),
        ...(optionalString(values.vehicleId) ? { vehicleId: optionalString(values.vehicleId) } : {}),
        ...(optionalString(values.driverId) ? { driverId: optionalString(values.driverId) } : {}),
        ...(optionalString(values.description) ? { description: optionalString(values.description) } : {}),
        ...(optionalString(values.reference) ? { reference: optionalString(values.reference) } : {}),
        ...(tripTreatment === "already-in-trip-closeout"
          ? {
              tripFinancialSourceId: requiredString(values.tripFinancialSourceId,
                "business_expense_trip_financial_source_required"),
              tripFinancialComponent: requiredString(values.tripFinancialComponent,
                "business_expense_trip_financial_component_required") as "toll" | "parking" | "combined",
            }
          : {}),
      },
    });
  }
  const paymentStatus = values.paymentStatus;
  if (paymentStatus !== "unpaid" && paymentStatus !== "paid") throw new Error("traffic_challan_payment_status_required");
  return service.createExpenseEntry({
    uuid: command.instanceId, source,
    operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
    now: command.submittedAt,
    data: {
      sourceKind: "traffic_challan", businessDate, amountPaise, currencyCode: "INR", effect: "charge",
      vehicleId: requiredString(values.vehicleId, "traffic_challan_vehicle_required"),
      paymentStatus,
      description: requiredString(values.description, "traffic_challan_reason_required"),
      ...(optionalString(values.driverId) ? { driverId: optionalString(values.driverId) } : {}),
      ...(optionalString(values.reference) ? { reference: optionalString(values.reference) } : {}),
    },
  });
  };
}
