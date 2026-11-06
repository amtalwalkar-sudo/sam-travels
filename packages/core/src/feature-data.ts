import { createReadonlyRegistry } from "./readonly-registry";
import type { FeatureId } from "./features";

export type FeatureDataQueryContext = Readonly<{
  period?: Readonly<{ from: string; to: string }>;
  effectiveDate?: string;
  asOf?: string;
  /** Optional adapter-supported snapshot/revision token shared by all requested sources. */
  snapshotToken?: string;
}>;

export type FeatureDataSourceSnapshot<T> =
  | Readonly<{
      status: "available";
      records: readonly T[];
      observedAt: string;
      complete: boolean;
      freshness: "fresh" | "stale" | "unknown";
      snapshotToken?: string;
    }>
  | Readonly<{ status: "pending"; reason?: string }>
  | Readonly<{ status: "unavailable" | "invalid"; reason: string }>;

export type FeatureDataQueryContract<Record = unknown> = Readonly<{
  id: string;
  ownerFeatureId: FeatureId;
  version: number;
  outputSchemaVersion: number;
  query(context: FeatureDataQueryContext): Promise<FeatureDataSourceSnapshot<Record>>;
  validateRecord(record: unknown): record is Record;
}>;

export type FeatureDataQueryResult<Record = unknown> =
  | Readonly<{
      queryId: string;
      ownerFeatureId: FeatureId;
      version: number;
      outputSchemaVersion: number;
      status: "available";
      records: readonly Record[];
      observedAt: string;
      complete: boolean;
      freshness: "fresh" | "stale" | "unknown";
      consistency: "shared_snapshot" | "best_effort";
      snapshotToken?: string;
    }>
  | Readonly<{
      queryId: string;
      ownerFeatureId: FeatureId;
      version: number;
      outputSchemaVersion: number;
      status: "pending" | "unavailable" | "invalid";
      reason: string;
    }>;

function cloneFrozenSourceData<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Source records must contain finite numbers");
    return value;
  }
  if (typeof value !== "object") throw new Error("Source records must be JSON-compatible");
  const source = value as object;
  if (seen.has(source)) throw new Error("Source records cannot contain cycles");
  seen.add(source);
  let copy: object;
  if (Array.isArray(value)) {
    copy = value.map(item => cloneFrozenSourceData(item, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Source records must contain only plain objects and arrays");
    }
    const record: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      record[key] = cloneFrozenSourceData(item, seen);
    }
    copy = record;
  }
  seen.delete(source);
  return Object.freeze(copy) as T;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateFeatureDataQueryContext(context: FeatureDataQueryContext): void {
  if (context.period && (
    !validDate(context.period.from) ||
    !validDate(context.period.to) ||
    context.period.from > context.period.to
  )) throw new Error("Invalid feature data query period");
  if (context.effectiveDate !== undefined && !validDate(context.effectiveDate)) {
    throw new Error("Invalid feature data query effective date");
  }
  if (context.asOf !== undefined && (!context.asOf || !Number.isFinite(Date.parse(context.asOf)))) {
    throw new Error("Invalid feature data query as-of timestamp");
  }
  if (context.snapshotToken !== undefined && !context.snapshotToken.trim()) {
    throw new Error("Invalid feature data query snapshot token");
  }
}

export function registerFeatureDataQueries(
  activeFeatures: ReadonlyMap<FeatureId, { id: FeatureId }>,
  contracts: readonly FeatureDataQueryContract[],
): ReadonlyMap<string, FeatureDataQueryContract> {
  const registry = new Map<string, FeatureDataQueryContract>();
  for (const contract of contracts) {
    if (!contract.id?.trim() || registry.has(contract.id)) {
      throw new Error("Missing or duplicate feature data query: " + contract.id);
    }
    if (
      !activeFeatures.has(contract.ownerFeatureId) ||
      !Number.isSafeInteger(contract.version) || contract.version < 1 ||
      !Number.isSafeInteger(contract.outputSchemaVersion) || contract.outputSchemaVersion < 1 ||
      typeof contract.query !== "function" ||
      typeof contract.validateRecord !== "function"
    ) throw new Error("Invalid feature data query contract: " + contract.id);
    registry.set(contract.id, Object.freeze({ ...contract }));
  }
  return createReadonlyRegistry(registry);
}

/** Validate source-owned query output without converting missing or incomplete data into zero. */
export async function executeFeatureDataQuery<Record>(
  contract: FeatureDataQueryContract<Record>,
  context: FeatureDataQueryContext,
): Promise<FeatureDataQueryResult<Record>> {
  validateFeatureDataQueryContext(context);
  const base = {
    queryId: contract.id,
    ownerFeatureId: contract.ownerFeatureId,
    version: contract.version,
    outputSchemaVersion: contract.outputSchemaVersion,
  };
  const snapshot = await contract.query(Object.freeze({ ...context }));
  if (!snapshot || typeof snapshot !== "object" || !("status" in snapshot)) {
    return Object.freeze({ ...base, status: "invalid", reason: "source_returned_invalid_snapshot" });
  }
  if (snapshot.status !== "available") {
    if (snapshot.status === "pending") return Object.freeze({ ...base, status: "pending", reason: snapshot.reason ?? "source_pending" });
    if (snapshot.status === "unavailable" || snapshot.status === "invalid") {
      return Object.freeze({ ...base, status: snapshot.status, reason: snapshot.reason });
    }
    return Object.freeze({ ...base, status: "invalid", reason: "source_returned_unknown_status" });
  }
  if (
    !Array.isArray(snapshot.records) ||
    typeof snapshot.complete !== "boolean" ||
    !["fresh", "stale", "unknown"].includes(snapshot.freshness) ||
    !Number.isFinite(Date.parse(snapshot.observedAt)) ||\n    (snapshot.snapshotToken !== undefined && (typeof snapshot.snapshotToken !== "string" || !snapshot.snapshotToken.trim()))
  ) return Object.freeze({ ...base, status: "invalid", reason: "source_snapshot_metadata_invalid" });
  if (context.snapshotToken && snapshot.snapshotToken && snapshot.snapshotToken !== context.snapshotToken) {
    return Object.freeze({ ...base, status: "invalid", reason: "source_snapshot_token_mismatch" });
  }
  if (!snapshot.records.every(contract.validateRecord)) {
    return Object.freeze({ ...base, status: "invalid", reason: "source_record_validation_failed" });
  }
  const records = Object.freeze(snapshot.records.map(record => Object.freeze(record)));
  return Object.freeze({
    ...base,
    status: "available",
    records,
    observedAt: snapshot.observedAt,
    complete: snapshot.complete,
    freshness: snapshot.freshness,
    consistency: context.snapshotToken && snapshot.snapshotToken === context.snapshotToken ? "shared_snapshot" : "best_effort",
    ...(snapshot.snapshotToken ? { snapshotToken: snapshot.snapshotToken } : {}),
  });
}
