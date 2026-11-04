/** Runtime-independent metadata describing one consistent authoritative-store snapshot. */
export interface SnapshotManifest {
  applicationVersion: string;
  schemaVersion: number;
  createdAt: string;
  businessTimezone: string;
  snapshotRevision: number;
  recordCounts: Record<string, number>;
}
