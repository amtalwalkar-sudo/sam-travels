import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserDiagnostics, recordBrowserDiagnostic } from "../packages/storage-browser/src/local-diagnostics";

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
