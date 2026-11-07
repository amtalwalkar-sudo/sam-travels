import {
  createSafeDiagnosticEvent,
  executeFeatureDataQuery,
  executeRegisteredCalculation,
  validateFeatureDataQueryContext,
  type AvailableFeatureDataQueryResult,
  type CalculationExecutionResult,
  type FeatureDataQueryContext,
  type FeatureDataQueryResult,
  type SafeDiagnosticEvent,
} from "../../core/src/index";
import type { RuntimeRegistry } from "../../core/src/runtime-registry";

export type DataSourceCollectionItem =
  | FeatureDataQueryResult
  | Readonly<{ queryId: string; status: "unavailable"; reason: string }>;

export type CalculationTrace = Readonly<{
  schemaVersion: 1;
  traceId: string;
  outcome: "calculated" | "blocked" | "invalid";
  stages: readonly Readonly<{ sequence: number; stage: "source_query" | "data_validation" | "calculation" | "result"; outcome: string }>[];
  sources: readonly Readonly<{
    queryId: string; ownerFeatureId?: string; version?: number; outputSchemaVersion?: number;
    status: string; observedAt?: string; freshness?: string; complete?: boolean; consistency?: string;
  }>[];
  calculation?: Readonly<{
    calculationId: string; ownerFeatureId: string; version: number;
    inputSchemaVersion: number; outputSchemaVersion: number; effectiveDate: string;
  }>;
}>;

export type OrchestratedCalculationResult<Output = unknown> =
  | Readonly<{
      status: "calculated";
      calculation: CalculationExecutionResult<Output>;
      sources: readonly AvailableFeatureDataQueryResult[];
      consistency: "shared_snapshot" | "best_effort";
      trace: CalculationTrace;
    }>
  | Readonly<{
      status: "blocked" | "invalid";
      reason: string;
      sources: readonly DataSourceCollectionItem[];
      trace: CalculationTrace;
    }>;

export type CoordinatorDiagnostics = Readonly<{
  createTraceId?: () => string;
  record?: (event: SafeDiagnosticEvent) => void | Promise<void>;
}>;

/** Coordinates feature-owned queries and registered calculations in the single application runtime. */
export class CrossFeatureDataCoordinator {
  constructor(
    private readonly runtime: RuntimeRegistry,
    private readonly diagnostics: CoordinatorDiagnostics = {},
  ) {}

  async collect(queryIds: readonly string[], context: FeatureDataQueryContext): Promise<readonly DataSourceCollectionItem[]> {
    validateFeatureDataQueryContext(context);
    if (new Set(queryIds).size !== queryIds.length) throw new Error("Duplicate feature data query requested");
    const items = await Promise.all(queryIds.map(async queryId => {
      const contract = this.runtime.dataQueries.get(queryId);
      if (!contract) return Object.freeze({ queryId, status: "unavailable" as const, reason: "query_not_registered" });
      try {
        return await executeFeatureDataQuery(contract, context);
      } catch {
        return Object.freeze({
          queryId, ownerFeatureId: contract.ownerFeatureId, version: contract.version,
          outputSchemaVersion: contract.outputSchemaVersion, status: "unavailable" as const,
          reason: "source_query_failed",
        });
      }
    }));
    const tokens = items.filter((item): item is AvailableFeatureDataQueryResult => item.status === "available")
      .map(item => item.snapshotToken).filter((token): token is string => !!token);
    if (new Set(tokens).size > 1) {
      return Object.freeze(items.map(item => item.status === "available"
        ? Object.freeze({
            queryId: item.queryId, ownerFeatureId: item.ownerFeatureId, version: item.version,
            outputSchemaVersion: item.outputSchemaVersion, status: "invalid" as const,
            reason: "cross_source_snapshot_mismatch",
          })
        : item));
    }
    return Object.freeze(items);
  }

  private async recordFailure(stage: "source_query" | "data_validation" | "calculation", code: "source_query_failed" | "source_validation_failed" | "calculation_failed", traceId: string): Promise<void> {
    if (!this.diagnostics.record) return;
    const event = createSafeDiagnosticEvent({
      traceId, stage, code, outcome: "failure", occurredAt: new Date().toISOString(),
    });
    try { await this.diagnostics.record(event); } catch { /* diagnostics never alter the operation result */ }
  }

  async calculate<Input, Output, Record = any>(request: {
    queryIds: readonly string[];
    context: FeatureDataQueryContext;
    calculationId: string;
    expected: { version: number; inputSchemaVersion: number; outputSchemaVersion: number };
    buildInput(sources: readonly AvailableFeatureDataQueryResult<Record>[]): Input;
    allowStale?: boolean;
    allowIncomplete?: boolean;
  }): Promise<OrchestratedCalculationResult<Output>> {
    const generatedId = this.diagnostics.createTraceId?.() ??
      (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : "trace-" + Date.now().toString(36));
    const traceId = /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(generatedId) ? generatedId : "trace-invalid";
    const collected = await this.collect(request.queryIds, request.context);
    const traceSources = collected.map(item => Object.freeze({
      queryId: item.queryId,
      ...("ownerFeatureId" in item ? { ownerFeatureId: item.ownerFeatureId } : {}),
      ...("version" in item ? { version: item.version } : {}),
      ...("outputSchemaVersion" in item ? { outputSchemaVersion: item.outputSchemaVersion } : {}),
      status: item.status,
      ...(item.status === "available" ? {
        observedAt: item.observedAt, freshness: item.freshness,
        complete: item.complete, consistency: item.consistency,
      } : {}),
    }));
    const stages: Array<{ sequence: number; stage: "source_query" | "data_validation" | "calculation" | "result"; outcome: string }> = [];
    collected.forEach((item, index) => stages.push({ sequence: index + 1, stage: "source_query", outcome: item.status }));
    stages.push({ sequence: stages.length + 1, stage: "data_validation", outcome: collected.some(item => item.status === "invalid") ? "invalid" : collected.some(item => item.status !== "available") ? "incomplete" : "valid" });
    const failures = collected.filter(item => item.status !== "available");
    const finishBlocked = async (status: "blocked" | "invalid", reason: string): Promise<OrchestratedCalculationResult<Output>> => {
      stages.push({ sequence: stages.length + 1, stage: "result", outcome: status });
      if (failures.some(item => item.status === "unavailable" || item.status === "pending")) await this.recordFailure("source_query", "source_query_failed", traceId);
      if (failures.some(item => item.status === "invalid")) await this.recordFailure("data_validation", "source_validation_failed", traceId);
      const trace: CalculationTrace = Object.freeze({ schemaVersion: 1, traceId, outcome: status, stages: Object.freeze(stages), sources: Object.freeze(traceSources) });
      return Object.freeze({ status, reason, sources: collected, trace });
    };
    if (failures.length) return finishBlocked(failures.some(item => item.status === "invalid") ? "invalid" : "blocked", failures[0].reason);

    const sources = collected as readonly AvailableFeatureDataQueryResult<Record>[];
    if (!request.allowIncomplete && sources.some(source => !source.complete)) return finishBlocked("blocked", "source_incomplete");
    if (!request.allowStale && sources.some(source => source.freshness !== "fresh")) return finishBlocked("blocked", "source_not_fresh");

    try {
      const calculation = executeRegisteredCalculation<Input, Output>(
        this.runtime.calculations, request.calculationId, request.buildInput(sources), request.expected,
      );
      stages.push({ sequence: stages.length + 1, stage: "calculation", outcome: "success" });
      stages.push({ sequence: stages.length + 1, stage: "result", outcome: "calculated" });
      const trace: CalculationTrace = Object.freeze({
        schemaVersion: 1, traceId, outcome: "calculated", stages: Object.freeze(stages),
        sources: Object.freeze(traceSources),
        calculation: Object.freeze({
          calculationId: calculation.calculationId, ownerFeatureId: calculation.ownerFeatureId,
          version: calculation.version, inputSchemaVersion: calculation.inputSchemaVersion,
          outputSchemaVersion: calculation.outputSchemaVersion, effectiveDate: calculation.effectiveDate,
        }),
      });
      return Object.freeze({
        status: "calculated", calculation, sources,
        consistency: sources.length > 0 && sources.every(source => source.consistency === "shared_snapshot") ? "shared_snapshot" : "best_effort",
        trace,
      });
    } catch {
      await this.recordFailure("calculation", "calculation_failed", traceId);
      stages.push({ sequence: stages.length + 1, stage: "calculation", outcome: "failure" });
      stages.push({ sequence: stages.length + 1, stage: "result", outcome: "invalid" });
      const trace: CalculationTrace = Object.freeze({ schemaVersion: 1, traceId, outcome: "invalid", stages: Object.freeze(stages), sources: Object.freeze(traceSources) });
      return Object.freeze({ status: "invalid", reason: "calculation_execution_failed", sources, trace });
    }
  }
}
