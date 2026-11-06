import { registerPlugin } from "@capacitor/core";
import type { RecordRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import type { FeatureExtensionCompatibilitySnapshot } from "../../../packages/core/src/feature-compatibility";

type RoomStoreUpgradeApi = {
  list(): Promise<{ records: Array<RecordEnvelope<unknown>> }>;
  commitFeatureUpgradeBatch(input: {
    records: Array<RecordEnvelope<unknown>>;
    deletes: string[];
    expectedRevisions: Record<string, number>;
  }): Promise<{ committed: boolean }>;
};

const RoomStore = registerPlugin<RoomStoreUpgradeApi>("RoomStore");

class StagedRoomRecordRepository implements RecordRepository {
  private readonly original: Map<string, RecordEnvelope<unknown>>;
  private readonly working: Map<string, RecordEnvelope<unknown>>;
  private readonly touched = new Set<string>();

  constructor(records: Array<RecordEnvelope<unknown>>) {
    this.original = new Map(records.map(record => [record.id, record]));
    this.working = new Map(this.original);
  }

  async get<T>(id: string): Promise<RecordEnvelope<T> | undefined> {
    return this.working.get(id) as RecordEnvelope<T> | undefined;
  }

  async put<T>(record: RecordEnvelope<T>): Promise<void> {
    this.working.set(record.id, record as RecordEnvelope<unknown>);
    this.touched.add(record.id);
  }

  async list<T>(): Promise<Array<RecordEnvelope<T>>> {
    return [...this.working.values()] as Array<RecordEnvelope<T>>;
  }

  async remove(id: string): Promise<void> {
    this.working.delete(id);
    this.touched.add(id);
  }

  async commit(): Promise<void> {
    const records: Array<RecordEnvelope<unknown>> = [];
    const deletes: string[] = [];
    const expectedRevisions: Record<string, number> = {};
    for (const id of this.touched) {
      expectedRevisions[id] = this.original.get(id)?.revision ?? -1;
      const next = this.working.get(id);
      if (next) records.push(next);
      else deletes.push(id);
    }
    if (this.touched.size === 0) return;
    const result = await RoomStore.commitFeatureUpgradeBatch({ records, deletes, expectedRevisions });
    if (!result.committed) throw new Error("feature_upgrade_concurrent_record_change");
  }
}

/** Staged Room-backed repository; the native plugin applies all changes atomically. */
export class RoomFeatureExtensionUpgradeTransaction {
  async run<Result>(
    operation: (context: {
      migrationContext: { records: RecordRepository };
      persistInstalledExtension(snapshot: FeatureExtensionCompatibilitySnapshot): Promise<void>;
    }) => Promise<Result>,
  ): Promise<Result> {
    const initial = await RoomStore.list();
    const records = new StagedRoomRecordRepository(initial.records);
    const result = await operation({
      migrationContext: { records },
      persistInstalledExtension: async snapshot => {
        const id = "installed-extension:" + snapshot.extension.id;
        const previous = await records.get(id);
        const now = new Date().toISOString();
        await records.put({
          id,
          schemaVersion: 1,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
          source: "android",
          revision: (previous?.revision ?? 0) + 1,
          data: {
            extension: {
              id: snapshot.extension.id,
              version: snapshot.extension.version,
              featureId: snapshot.extension.featureId,
              publicEntryPoint: snapshot.extension.publicEntryPoint,
            },
            feature: snapshot.feature,
          },
        });
      },
    });
    await records.commit();
    return result;
  }
}
