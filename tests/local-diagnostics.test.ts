import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserDiagnostics, recordBrowserDiagnostic, recordBrowserDiagnosticEvent } from "../packages/storage-browser/src/local-diagnostics";
import { createSafeDiagnosticEvent } from "../packages/core/src/diagnostics";

describe("bounded privacy-safe local diagnostics", () => {
  afterEach(async () => { await browserDatabase.diagnostics.clear(); });

  it("bounds retained records and exports only sanitized failure metadata", async () => {
    for (let index = 0; index < 305; index += 1) {
      await recordBrowserDiagnostic({
        subsystem: "recovery",
        operation: "restore_snapshot",
        failureCategory: "backup",
        recoveryResult: "rolled_back",
      });
    }
    const rows = await exportBrowserDiagnostics();
    expect(rows.length).toBeLessThanOrEqual(300);
    expect(rows.every(row => row.outcome === "failure" && row.schemaVersion === 5 && row.failureCategory === "backup")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/latitude|longitude|payload|businessName|userName/i);
  });

  it("stores the shared Stage 5 event contract with bounded safe metadata", async () => {
    const event = createSafeDiagnosticEvent({
      traceId: "trace-abc", stage: "calculation", code: "calculation_failed",
      outcome: "failure", ownerFeatureId: "performance",
      contributionId: "performance.total.v1", contractVersion: 2,
      occurredAt: "2026-11-07T00:00:00.000Z", durationMs: 12,
    });
    await recordBrowserDiagnosticEvent(event);
    const rows = await exportBrowserDiagnostics();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      traceId: "trace-abc", stage: "calculation", code: "calculation_failed",
      ownerFeatureId: "performance", contributionId: "performance.total.v1",
      contractVersion: 2, durationMs: 12, schemaVersion: 1,
    });
    expect(JSON.stringify(rows)).not.toMatch(/snapshotToken|credentials|latitude|longitude/i);
  });

  it("normalizes tokens rather than retaining user-provided details", async () => {
    await recordBrowserDiagnostic({
      subsystem: "gps coordinates 19.076,72.877",
      operation: "restore with private payload",
      failureCategory: "internal failure",
      recoveryResult: "retry failed",
    });
    const [row] = await exportBrowserDiagnostics();
    expect(row.subsystem).toBe("unknown");
    expect(row.operation).toBe("unknown");
    expect(row.failureCategory).toBe("unknown");
  });
});
