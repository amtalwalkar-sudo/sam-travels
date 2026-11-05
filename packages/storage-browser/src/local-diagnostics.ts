import { browserDatabase } from "./database";

export type BrowserDiagnosticInput = {
  subsystem: string;
  operation: string;
  failureCategory: string;
  recoveryResult: string;
};

const MAX_ENTRIES = 300;
const APP_VERSION = "web";
const SCHEMA_VERSION = 5;
const SUBSYSTEMS = new Set(["storage", "workflow", "recovery", "backup"]);
const OPERATIONS = new Set(["repository_startup", "workflow_startup", "retry_pending_action", "dispatch_transition", "queue_intent", "complete_intent", "retry_intent", "export_snapshot", "restore_snapshot"]);
const FAILURE_CATEGORIES = new Set(["storage", "workflow", "recovery", "backup", "permission", "location"]);
const RECOVERY_RESULTS = new Set(["startup_blocked", "retry_required", "retry_failed", "operation_failed", "export_failed", "restore_failed", "rolled_back"]);

function safeToken(value: string, allowed: Set<string>): string {
  return allowed.has(value) ? value : "unknown";
}

/** Bounded local failure telemetry: enum allowlists, no business payload/GPS, no upload. */
export async function recordBrowserDiagnostic(input: BrowserDiagnosticInput): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const id = timestamp + ":" + safeToken(input.subsystem, SUBSYSTEMS) + ":" + safeToken(input.operation, OPERATIONS) + ":" + crypto.randomUUID();
    await browserDatabase.diagnostics.add({
      id,
      timestamp,
      subsystem: safeToken(input.subsystem, SUBSYSTEMS),
      operation: safeToken(input.operation, OPERATIONS),
      outcome: "failure",
      failureCategory: safeToken(input.failureCategory, FAILURE_CATEGORIES),
      recoveryResult: safeToken(input.recoveryResult, RECOVERY_RESULTS),
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
