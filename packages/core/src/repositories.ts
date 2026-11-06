import type { RecordEnvelope } from "./types";

export interface RecordRepository {
  get<T>(id: string): Promise<RecordEnvelope<T> | undefined>;
  put<T>(record: RecordEnvelope<T>): Promise<void>;
  list<T>(): Promise<Array<RecordEnvelope<T>>>;
  remove(id: string): Promise<void>;
}

/**
 * Atomic revision-checked replacement. expectedRevision=null means the key
 * must not exist. Implementations must commit the comparison and write as one
 * storage transaction; callers must never emulate this with get()+put().
 */
export interface AtomicRecordRepository extends RecordRepository {
  compareAndSet<T>(
    id: string,
    expectedRevision: number | null,
    next: RecordEnvelope<T>,
  ): Promise<boolean>;
}

export interface PolicyRepository {
  getNetworkEnabled(): Promise<boolean>;
  setNetworkEnabled(enabled: boolean): Promise<void>;
}
