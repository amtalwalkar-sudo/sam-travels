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
