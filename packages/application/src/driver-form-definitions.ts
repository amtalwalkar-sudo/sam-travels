import type { FormDefinition } from "./shared-form-runtime";

/**
 * Cancellation is a separate trip closeout form, not a Fare entry.
 * The amount is stored as integer paise; zero is a valid, explicit fee.
 */
export const TRIP_CANCELLATION_FEE_FORM_V1 = Object.freeze<FormDefinition>({
  id: "work.trip-cancellation-fee",
  version: 1,
  owner: "work-trip-finance",
  purpose: "Record the mandatory cancellation fee for a cancelled pickup-stage trip",
  primaryAction: "submit",
  fields: [
    { id: "tripId", label: "Trip identity", type: "text", required: true, maxLength: 128 },
    { id: "cancellationFeePaise", label: "Cancellation fee in paise", type: "number", required: true },
  ],
});

/** Validate the financial rule that generic form field validation cannot express. */
export function validateCancellationFeeSubmission(values: Readonly<Record<string, unknown>>): string[] {
  const issues: string[] = [];
  if (typeof values.tripId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(values.tripId)) {
    issues.push("trip_id_invalid");
  }
  const amount = values.cancellationFeePaise;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
    issues.push("cancellation_fee_must_be_non_negative_integer_paise");
  }
  return issues;
}


/** Completed-ride financial closeout. Fare is required; Toll and Parking are optional. */
export const TRIP_COMPLETED_FINANCIALS_FORM_V1 = Object.freeze<FormDefinition>({
  id: "work.trip-completed-financials", version: 1, owner: "work-trip-finance",
  purpose: "Record Fare and any applicable Toll/Parking for a completed ride", primaryAction: "submit",
  fields: [
    { id: "tripId", label: "Trip identity", type: "text", required: true, maxLength: 128 },
    { id: "farePaise", label: "Fare in paise", type: "number", required: true },
    { id: "tollPaise", label: "Toll in paise", type: "number", required: false },
    { id: "tollPayer", label: "Toll payer", type: "text", required: false },
    { id: "parkingPaise", label: "Parking in paise", type: "number", required: false },
    { id: "parkingPayer", label: "Parking payer", type: "text", required: false },
  ],
});

export function validateCompletedTripFinancialSubmission(values: Readonly<Record<string, unknown>>): string[] {
  const issues: string[] = [];
  if (typeof values.tripId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(values.tripId)) issues.push("trip_id_invalid");
  const fare = values.farePaise;
  if (typeof fare !== "number" || !Number.isSafeInteger(fare) || fare < 0) issues.push("fare_required_non_negative_integer_paise");
  for (const kind of ["toll", "parking"] as const) {
    const amount = values[kind + "Paise"], payer = values[kind + "Payer"];
    if (amount !== undefined && (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0)) issues.push(kind + "_must_be_non_negative_integer_paise");
    if (amount !== undefined && payer !== "driver" && payer !== "customer") issues.push(kind + "_payer_required");
    if (amount === undefined && payer !== undefined) issues.push(kind + "_payer_without_amount");
  }
  return issues;
}

/** Driver-facing fuel purchase form; shared form runtime owns the durable draft lifecycle. */
export const FUEL_ENTRY_FORM_V1 = Object.freeze<FormDefinition>({
  id: "work.fuel-entry",
  version: 1,
  owner: "business-expenses",
  purpose: "Record a fuel purchase independently of shift or trip state",
  primaryAction: "submit",
  fields: [
    { id: "vehicleId", label: "Vehicle", type: "text", required: true, maxLength: 160 },
    { id: "odometerKm", label: "Odometer (km)", type: "number", required: true },
    { id: "priceRupeesPerKg", label: "Price per kg (₹)", type: "number", required: true },
    { id: "amountRupees", label: "Amount paid (₹)", type: "number", required: true },
    { id: "partialRefill", label: "Partial refill", type: "checkbox", required: true },
    { id: "locationEvidenceJson", label: "Location evidence", type: "text", maxLength: 1000 },
  ],
});
