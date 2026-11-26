import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TripFinancialFormRuntimeV1 } from "../packages/application/src/trip-financial-form-runtime";
import { TripFinancialCorrectionSection } from "../apps/web/src/ui/TripFinancialCorrectionSection";
import { TripFinancialFormRuntimeProvider } from "../apps/web/src/ui/trip-financial-form-context";

describe("trip financial correction presentation", () => {
  it("submits an append-only correction with the displayed source and chain revisions", async () => {
    const record = {
      id: "trip-financial:trip-123", revision: 4, correctionChainRevision: 2,
      correctionRefs: [{ sourceId: "historical-correction:trip-1", revision: 2, chainRevision: 2 }],
      data: {
        kind: "completed_ride_financials", tripId: "trip-123",
        farePaise: 10000, tollPaise: 2000, tollPayer: "driver",
        parkingPaise: 500, parkingPayer: "customer",
      },
    };
    const submit = vi.fn().mockResolvedValue({ correction: { correctionId: "correction-new" } });
    const listSubmittedTripFinancialRecords = vi.fn().mockResolvedValue([record]);
    const runtime = {
      listSubmittedTripFinancialRecords,
      corrections: { submit },
    } as unknown as TripFinancialFormRuntimeV1;

    render(
      <TripFinancialFormRuntimeProvider value={runtime}>
        <TripFinancialCorrectionSection />
      </TripFinancialFormRuntimeProvider>,
    );

    expect(await screen.findByText(/Source revision 4 · correction chain 2/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Correct value"), { target: { value: "300.00" } });
    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "Verified against the original trip receipt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record correction" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      targetRecordId: "trip-financial:trip-123",
      expectedTargetRevision: 4,
      expectedChainRevision: 2,
      fieldPath: "farePaise",
      afterValue: 30000,
      reason: "Verified against the original trip receipt",
    })));
    await waitFor(() => expect(screen.getByRole("status").textContent)
      .toContain("Original Work and GPS events remain unchanged"));
    expect(listSubmittedTripFinancialRecords).toHaveBeenCalledTimes(2);
  });
});
