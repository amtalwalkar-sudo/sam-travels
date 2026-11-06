import { describe, expect, it } from "vitest";
import { FeatureLifecycleCoordinator } from "../packages/application/src/feature-lifecycle-coordinator";
import { registerFeatures } from "../packages/core/src/features";
import { initializeRuntimeRegistry } from "../packages/core/src/runtime-registry";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";

class MemoryAtomicRepository implements AtomicRecordRepository {
  private records = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.records.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.records.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.records.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.records.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.records.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.records.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

describe("application feature lifecycle coordinator", () => {
  it("persists a valid transition before returning success", async () => {
    const repository = new MemoryAtomicRepository();
    const coordinator = new FeatureLifecycleCoordinator(repository, registerFeatures());
    await coordinator.transition("performance", "disable");
    await coordinator.transition("logbook", "disable");
    const stored = await repository.get<{ states: Array<{ featureId: string; state: string }> }>("platform:feature-lifecycle");
    expect(stored?.revision).toBe(2);
    expect(stored?.data.states.find(state => state.featureId === "logbook")?.state).toBe("disabled");
  });

  it("does not write when policy rejects a transition", async () => {
    const repository = new MemoryAtomicRepository();
    const coordinator = new FeatureLifecycleCoordinator(repository, registerFeatures());
    await expect(coordinator.transition("work", "disable")).rejects.toThrow("active dependents");
    expect(await repository.get("platform:feature-lifecycle")).toBeUndefined();
  });

  it("uses compare-and-set and retries a concurrent update", async () => {
    class RacingRepository extends MemoryAtomicRepository {
      private raced = false;
      override async compareAndSet<T>(id: string, expected: number | null, next: RecordEnvelope<T>) {
        if (!this.raced) {
          this.raced = true;
          await super.put({
            id, schemaVersion: 1, createdAt: next.createdAt, updatedAt: next.updatedAt,
            source: "integration", revision: 1,
            data: { contractVersion: 1, states: [] },
          });
          return false;
        }
        return super.compareAndSet(id, expected, next);
      }
    }
    const repository = new RacingRepository();
    const coordinator = new FeatureLifecycleCoordinator(repository, registerFeatures());
    const result = await coordinator.transition("admin", "disable");
    expect(result.state).toBe("disabled");
    expect((await repository.get("platform:feature-lifecycle"))?.revision).toBe(2);
  });

  it("fails closed for stale lifecycle contracts and unknown persisted feature ids", async () => {
    const repository = new MemoryAtomicRepository();
    const timestamp = "2026-11-06T00:00:00.000Z";
    await repository.put({
      id: "platform:feature-lifecycle", schemaVersion: 1, createdAt: timestamp,
      updatedAt: timestamp, source: "integration", revision: 1,
      data: { contractVersion: 1, states: [{ featureId: "logbook", contractVersion: 99, state: "enabled" }] },
    });
    const coordinator = new FeatureLifecycleCoordinator(repository, registerFeatures());
    await expect(coordinator.list()).rejects.toThrow("Stale or invalid feature lifecycle contract: logbook");
    await expect(coordinator.transition("logbook", "disable")).rejects.toThrow("Stale or invalid feature lifecycle contract: logbook");
    expect((await repository.get("platform:feature-lifecycle"))?.revision).toBe(1);
  });

  it("fails closed when persisted state refers to an unregistered feature", async () => {
    const repository = new MemoryAtomicRepository();
    const timestamp = "2026-11-06T00:00:00.000Z";
    await repository.put({
      id: "platform:feature-lifecycle", schemaVersion: 1, createdAt: timestamp,
      updatedAt: timestamp, source: "integration", revision: 1,
      data: { contractVersion: 1, states: [{ featureId: "removed-feature", contractVersion: 1, state: "disabled" }] },
    });
    const coordinator = new FeatureLifecycleCoordinator(repository, registerFeatures());
    await expect(coordinator.list()).rejects.toThrow("feature_lifecycle_unknown_persisted_feature: removed-feature");
  });

  it("defaults newly registered features to enabled without mutating persistence during reads", async () => {
    const repository = new MemoryAtomicRepository();
    const coordinator = new FeatureLifecycleCoordinator(repository, registerFeatures());
    const states = await coordinator.list();
    expect(states.get("logbook")?.state).toBe("enabled");
    expect(states.get("performance")?.state).toBe("enabled");
    expect(await repository.get("platform:feature-lifecycle")).toBeUndefined();
  });
  it("retains backup ownership for persistent features after disable and retirement", async () => {
    const persistentFeature = {
      id: "backup-retained-addon",
      label: "Backup Retained Add-on",
      dataPolicy: "persistent" as const,
      contractVersion: 1,
      dependencies: [{ id: "platform", contractVersion: 1 }],
      persistence: {
        schemaVersion: 1,
        migrations: [],
        backup: { participantId: "backup-retained-addon-records", snapshotVersion: 1, required: true as const },
        restore: { validatorId: "backup-retained-addon-v1", required: true as const },
        lifecycle: { disableRetainsData: true as const, removalRequiresMigration: true as const },
      },
    };
    const runtime = initializeRuntimeRegistry({ features: [persistentFeature] });
    const repository = new MemoryAtomicRepository();
    const coordinator = new FeatureLifecycleCoordinator(repository, runtime.features);
    await coordinator.transition("backup-retained-addon", "disable");
    expect(runtime.backupParticipants.get("backup-retained-addon-records")?.featureId)
      .toBe("backup-retained-addon");
    await coordinator.transition("backup-retained-addon", "retire");
    expect(runtime.backupParticipants.get("backup-retained-addon-records")?.required).toBe(true);
    expect((await coordinator.list()).get("backup-retained-addon")?.state).toBe("retired");
  });

  it("retains feature-owned records after disable and retirement", async () => {
    const repository = new MemoryAtomicRepository();
    const feature = {
      id: "retained-addon", label: "Retained Add-on", dataPolicy: "persistent" as const,
      contractVersion: 1, dependencies: [{ id: "platform", contractVersion: 1 }],
      persistence: {
        schemaVersion: 1, migrations: [],
        backup: { participantId: "retained-addon-records", snapshotVersion: 1, required: true as const },
        restore: { validatorId: "retained-addon-v1", required: true as const },
        lifecycle: { disableRetainsData: true as const, removalRequiresMigration: true as const },
      },
    };
    const timestamp = "2026-11-06T00:00:00.000Z";
    await repository.put({
      id: "feature:retained-addon:business-row", schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: { value: "must-survive" },
    });
    const coordinator = new FeatureLifecycleCoordinator(repository, registerFeatures([feature]));
    await coordinator.transition("retained-addon", "disable");
    await coordinator.transition("retained-addon", "retire");
    expect((await repository.get<{ value: string }>("feature:retained-addon:business-row"))?.data)
      .toEqual({ value: "must-survive" });
    expect((await coordinator.list()).get("retained-addon")?.state).toBe("retired");
  });

});
