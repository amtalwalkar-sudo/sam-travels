import { describe, expect, it } from "vitest";
import { FeatureLifecycleCoordinator } from "../packages/application/src/feature-lifecycle-coordinator";
import { registerFeatures } from "../packages/core/src/features";
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
    expect(stored?.revision).toBe(1);
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
});
