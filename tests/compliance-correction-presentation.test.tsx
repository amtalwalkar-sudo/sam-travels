import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RecordEnvelope } from "../packages/core/src/types";
import type { ComplianceRecordV1 } from "../packages/application/src/compliance-service";
import { ComplianceHistoricalCorrection } from "../apps/web/src/ui/ComplianceHistoricalCorrection";

const record: RecordEnvelope<ComplianceRecordV1> = {
  id: "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
  schemaVersion: 1, revision: 1, createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", source: "web",
  createdBy: { personId: "admin-1", role: "admin" },
  data: {
    schemaVersion: 1, vehicleId: "feature:vehicle:MH01AB1234", complianceName: "Insurance",
    validFrom: "2026-01-01", validTo: "2026-12-31", totalCostPaise: 365000,
    supportingDocumentRef: "insurance-receipt-1",
  },
};

describe("Compliance correction presentation", () => {
  it("renders an append-only correction entry point for the projected Compliance record", () => {
    const service = { async listForTarget() { return []; }, async submit() { throw new Error("not_expected"); } };
    const markup = renderToStaticMarkup(createElement(ComplianceHistoricalCorrection, {
      record, service: service as never, onCorrected: async () => undefined,
    }));
    expect(markup).toContain("Correct details / history");
    expect(markup).not.toContain("Edit record");
    expect(markup).not.toContain("Delete record");
  });
});
