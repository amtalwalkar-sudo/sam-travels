import type { RecordEnvelope } from "./types";

export interface RecordRepository {
  get<T>(id: string): Promise<RecordEnvelope<T> | undefined>;
  put<T>(record: RecordEnvelope<T>): Promise<void>;
  list<T>(): Promise<Array<RecordEnvelope<T>>>;
  remove(id: string): Promise<void>;
}

/** Atomic revision-checked replacement of one record. */
export interface AtomicRecordRepository extends RecordRepository {
  compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>): Promise<boolean>;
}

/**
 * Atomically compare revisions for every touched record and replace all of
 * them, or replace none. A null expected revision means the record is absent.
 * Implementations must use one native database transaction, never get()+put().
 */
export type AtomicRecordMutation<T = unknown> = Readonly<{
  id: string;
  expectedRevision: number | null;
  next: RecordEnvelope<T>;
}>;

export interface AtomicRecordBatchRepository extends AtomicRecordRepository {
  compareAndSetMany(mutations: readonly AtomicRecordMutation[]): Promise<boolean>;
}

export interface PolicyRepository {
  getNetworkEnabled(): Promise<boolean>;
  setNetworkEnabled(enabled: boolean): Promise<void>;
}
