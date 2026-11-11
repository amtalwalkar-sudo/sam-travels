import { describe, expect, it } from "vitest";
import {
  TRIP_CANCELLATION_FEE_FORM_V1,
  validateCancellationFeeSubmission,
} from "../packages/application/src/driver-form-definitions";
import { validateFormValues } from "../packages/application/src/shared-form-runtime";

describe("Work cancellation-fee form contract", () => {
  it("declares a required submit action separate from Fare", () => {
    expect(TRIP_CANCELLATION_FEE_FORM_V1).toMatchObject({
      id: "work.trip-cancellation-fee",
      version: 1,
      owner: "work-trip-finance",
      primaryAction: "submit",
    });
    expect(TRIP_CANCELLATION_FEE_FORM_V1.fields.map(field => field.id)).toEqual([
      "tripId",
      "cancellationFeePaise",
    ]);
  });

  it("treats an explicitly entered zero fee as valid", () => {
    const values = { tripId: "trip_123", cancellationFeePaise: 0 };
    expect(validateFormValues(TRIP_CANCELLATION_FEE_FORM_V1, values)).toEqual([]);
    expect(validateCancellationFeeSubmission(values)).toEqual([]);
  });

  it("rejects a missing fee, negative fee, fractional paise and invalid trip identity", () => {
    expect(validateFormValues(TRIP_CANCELLATION_FEE_FORM_V1, { tripId: "trip_123" }))
      .toMatchObject([{ fieldId: "cancellationFeePaise", code: "required" }]);
    expect(validateCancellationFeeSubmission({ tripId: "trip_123", cancellationFeePaise: -1 }))
      .toContain("cancellation_fee_must_be_non_negative_integer_paise");
    expect(validateCancellationFeeSubmission({ tripId: "trip_123", cancellationFeePaise: 1.5 }))
      .toContain("cancellation_fee_must_be_non_negative_integer_paise");
    expect(validateCancellationFeeSubmission({ tripId: "", cancellationFeePaise: 0 }))
      .toContain("trip_id_invalid");
  });
});
