import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RecordEnvelope } from "../packages/core/src/types";
import type { FuelPurchaseV1 } from "../packages/application/src/business-expenses-service";
import { FuelPurchaseCorrection } from "../apps/web/src/ui/FuelPurchaseCorrection";

const purchase: RecordEnvelope<FuelPurchaseV1> = {
  id: "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000",
  schemaVersion: 1, revision: 1, createdAt: "2026-11-14T20:00:00.000Z",
  updatedAt: "2026-11-14T20:00:00.000Z", source: "web",
  data: {
    schemaVersion: 1, kind: "fuel_purchase", id: "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174000",
    revision: 1, vehicleId: "feature:vehicle:MH01AB1234", odometerKm: 45000,
    pricePaisePerKg: 9000, amountPaise: 18000, partialRefill: false,
    occurredAt: "2026-11-14T20:00:00.000Z", businessDate: "2026-11-14",
  },
};

describe("Fuel purchase correction presentation", () => {
  it("renders an append-only correction entry point for amount and price", () => {
    const service = {
      async listCorrectionHistory() { return []; },
      async correctSource() { throw new Error("not_expected"); },
    };
    const markup = renderToStaticMarkup(createElement(FuelPurchaseCorrection, {
      purchase, service: service as never, onCorrected: async () => undefined,
    }));
    expect(markup).toContain("Correct amount / price");
    expect(markup).toContain("Current amount:");
    expect(markup).toContain("Current price:");
    expect(markup).not.toContain("Edit record");
    expect(markup).not.toContain("Delete record");
  });
});
