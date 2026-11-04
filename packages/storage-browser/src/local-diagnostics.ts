import { browserDatabase } from "./database";

export type BrowserDiagnosticInput = {
  subsystem: string;
  operation: string;
  failureCategory: string;
  recoveryResult: string;
};

const MAX_ENTRIES = 300;
const MAX_FIELD_LENGTH = 64;
const APP_VERSION = "web";
const SCHEMA_VERSION = 5;

function safeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, MAX_FIELD_LENGTH) || "unknown";
}

/** Bounded local failure telemetry only: no user payloads, GPS, names, or auto-upload. */
export async function recordBrowserDiagnostic(input: BrowserDiagnosticInput): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const id = timestamp + ":" + safeToken(input.subsystem) + ":" + safeToken(input.operation) + ":" + crypto.randomUUID();
    await browserDatabase.diagnostics.add({
      id,
      timestamp,
      subsystem: safeToken(input.subsystem),
      operation: safeToken(input.operation),
      outcome: "failure",
      failureCategory: safeToken(input.failureCategory),
      recoveryResult: safeToken(input.recoveryResult),
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });
    const table = browserDatabase.diagnostics;
    const excess = await table.count() - MAX_ENTRIES;
    if (excess > 0) {
      const oldest = await table.orderBy("timestamp").limit(excess).primaryKeys();
      await table.bulkDelete(oldest);
    }
  } catch {
    // Diagnostics are best-effort and must never affect the business operation.
  }
}

/** Explicitly invoked by a local diagnostics UI/export flow; returns sanitized metadata only. */
export async function exportBrowserDiagnostics(): Promise<Array<{
  timestamp: string; subsystem: string; operation: string; outcome: string;
  failureCategory: string; recoveryResult: string; appVersion: string; schemaVersion: number;
}>> {
  try {
    return (await browserDatabase.diagnostics.orderBy("timestamp").toArray()).map(({timestamp,subsystem,operation,outcome,failureCategory,recoveryResult,appVersion,schemaVersion})=>({timestamp,subsystem,operation,outcome,failureCategory,recoveryResult,appVersion,schemaVersion}));
  } catch {
    return [];
  }
}
