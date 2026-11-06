import {
  executeFeatureDataQuery,
  executeRegisteredCalculation,
  validateFeatureDataQueryContext,
  type AvailableFeatureDataQueryResult,
  type CalculationExecutionResult,
  type FeatureDataQueryContext,
  type FeatureDataQueryResult,
} from "../../core/src/index";
import type { RuntimeRegistry } from "../../core/src/runtime-registry";

export type DataSourceCollectionItem =
  | FeatureDataQueryResult
  | Readonly<{ queryId: string; status: "unavailable"; reason: string }>;

export type OrchestratedCalculationResult<Output = unknown> =
  | Readonly<{
      status: "calculated";
      calculation: CalculationExecutionResult<Output>;
      sources: readonly AvailableFeatureDataQueryResult[];
      consistency: "shared_snapshot" | "best_effort";
    }>
  | Readonly<{
      status: "blocked" | "invalid";
      reason: string;
      sources: readonly DataSourceCollectionItem[];
    }>;

/**
 * Coordinates feature-owned query contracts through the one application runtime.
 * It does not own source storage, feature business rules, or calculation formulas.
 */
export class CrossFeatureDataCoordinator {
  constructor(private readonly runtime: RuntimeRegistry) {}

  async collect(
    queryIds: readonly string[],
    context: FeatureDataQueryContext,
  ): Promise<readonly DataSourceCollectionItem[]> {
    validateFeatureDataQueryContext(context);
    if (new Set(queryIds).size !== queryIds.length) {
      throw new Error("Duplicate feature data query requested");
    }
    const items = await Promise.all(queryIds.map(async queryId => {
      const contract = this.runtime.dataQueries.get(queryId);
      if (!contract) return Object.freeze({
        queryId,
        status: "unavailable" as const,
        reason: "query_not_registered",
      });
      try {
        return await executeFeatureDataQuery(contract, context);
      } catch {
        return Object.freeze({
          queryId,
          ownerFeatureId: contract.ownerFeatureId,
          version: contract.version,
          outputSchemaVersion: contract.outputSchemaVersion,
          status: "unavailable" as const,
          reason: "source_query_failed",
        });
      }
    }));

    const tokens = items
      .filter((item): item is AvailableFeatureDataQueryResult => item.status === "available")
      .map(item => item.snapshotToken)
      .filter((token): token is string => !!token);
    if (new Set(tokens).size > 1) {
      return Object.freeze(items.map(item => item.status === "available"
        ? Object.freeze({
            queryId: item.queryId,
            ownerFeatureId: item.ownerFeatureId,
            version: item.version,
            outputSchemaVersion: item.outputSchemaVersion,
            status: "invalid" as const,
            reason: "cross_source_snapshot_mismatch",
          })
        : item));
    }
    return Object.freeze(items);
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
    const collected = await this.collect(request.queryIds, request.context);
    const failures = collected.filter(
      (item): item is Exclude<DataSourceCollectionItem, { status: "available" }> => item.status !== "available",
    );
    if (failures.length > 0) return Object.freeze({
      status: failures[0].status === "invalid" ? "invalid" : "blocked",
      reason: failures[0].reason,
      sources: collected,
    });

    const sources = collected.filter(
      (item): item is AvailableFeatureDataQueryResult => item.status === "available",
    ) as readonly AvailableFeatureDataQueryResult<Record>[];
    if (!request.allowIncomplete && sources.some(source => !source.complete)) {
      return Object.freeze({ status: "blocked", reason: "source_incomplete", sources });
    }
    if (!request.allowStale && sources.some(source => source.freshness !== "fresh")) {
      return Object.freeze({ status: "blocked", reason: "source_not_fresh", sources });
    }

    try {
      const calculation = executeRegisteredCalculation<Input, Output>(
        this.runtime.calculations,
        request.calculationId,
        request.buildInput(sources),
        request.expected,
      );
      return Object.freeze({
        status: "calculated",
        calculation,
        sources,
        consistency: sources.length > 0 && sources.every(source => source.consistency === "shared_snapshot")
          ? "shared_snapshot"
          : "best_effort",
      });
    } catch {
      return Object.freeze({ status: "invalid", reason: "calculation_execution_failed", sources });
    }
  }
}
