import type { RecordEnvelope } from "../../core/src/types";
import type { RecordRepository } from "../../core/src/repositories";

export type PerformanceRepositorySnapshotV1 = Readonly<{
  /** Exact canonical revision vector; compared directly, never by its digest. */
  identity: string;
  /** Compact provenance label; correctness checks use identity above. */
  fingerprint: string;
}>;

/**
 * Optimistic read fence over the one authoritative application record store.
 * Capture before any Performance source adapter prepares its read model and
 * again after every source has been consumed. A changed record set invalidates
 * the calculation instead of publishing a mixed-revision result.
 *
 * Allocation provenance rows are excluded because getReport() appends its
 * own immutable audit row while preparing the read-only allocation projection;
 * those rows describe the calculation inputs but are not calculation inputs.
 */
export class PerformanceCalculationSnapshotBoundaryV1 {
  constructor(private readonly records: Pick<RecordRepository, "list">) {}

  async capture(): Promise<PerformanceRepositorySnapshotV1> {
    const rows = await this.records.list<unknown>();
    const canonicalRows = rows
      .filter(row => !row.id.startsWith("reporting:business-start-date-cost-allocation:provenance:"))
      .map((row: RecordEnvelope<unknown>) => [
        row.id, row.revision, row.updatedAt, row.deletedAt ?? null,
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    const identity = JSON.stringify(canonicalRows);
    let hash = 0xcbf29ce484222325n;
    for (let index = 0; index < identity.length; index++) {
      hash ^= BigInt(identity.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return Object.freeze({
      identity,
      fingerprint: hash.toString(16).padStart(16, "0") + ":" + canonicalRows.length,
    });
  }
}
