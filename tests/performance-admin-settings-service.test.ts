import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  PerformanceAdminSettingsServiceV1,
  PerformanceBusinessSettingsAdapterV1,
  PERFORMANCE_ADMIN_SETTINGS_RECORD_ID,
} from "../packages/application/src/performance-admin-settings-service";

class MemoryRepository implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

describe("Performance Admin source records v1", () => {
  it("stores the monthly Driver Target as one revisioned Admin setting", async () => {
    const repository = new MemoryRepository();
    let tick = 0;
    const service = new PerformanceAdminSettingsServiceV1(repository, () => `2026-11-16T00:00:0${tick++}.000Z`);
    await expect(service.getMonthlyTargetPaise()).rejects.toThrow("performance_driver_target_not_configured");
    const created = await service.setMonthlyDriverTargetPaise(4_500_000, "web");
    const updated = await service.setMonthlyDriverTargetPaise(5_000_000, "android");
    expect(created).toMatchObject({
      id: PERFORMANCE_ADMIN_SETTINGS_RECORD_ID, revision: 1,
      data: { kind: "settings", monthlyDriverTargetPaise: 4_500_000 },
    });
    expect(updated).toMatchObject({
      id: PERFORMANCE_ADMIN_SETTINGS_RECORD_ID, revision: 2,
      data: { kind: "settings", monthlyDriverTargetPaise: 5_000_000 },
    });
    await expect(service.getMonthlyTargetPaise()).resolves.toBe(5_000_000);
  });

  it("stores multiple pre-business costs independently and makes retries idempotent", async () => {
    const repository = new MemoryRepository();
    const service = new PerformanceAdminSettingsServiceV1(repository);
    const first = {
      commandId: "11111111-1111-4111-8111-111111111111",
      amountPaise: 12_345, note: "Initial vehicle setup", source: "web" as const,
    };
    const second = {
      commandId: "22222222-2222-4222-8222-222222222222",
      amountPaise: 67_890, note: "Pre-launch permits", source: "android" as const,
    };
    const createdFirst = await service.createPreBusinessCost(first);
    const retriedFirst = await service.createPreBusinessCost(first);
    await service.createPreBusinessCost(second);
    expect(retriedFirst.id).toBe(createdFirst.id);
    expect(await service.listEntries()).toEqual([
      { sourceId: createdFirst.id, revision: 1, amountPaise: 12_345,
        note: "Initial vehicle setup", origin: "manual" },
      { sourceId: "feature:performance:pre-business-cost:22222222-2222-4222-8222-222222222222",
        revision: 1, amountPaise: 67_890, note: "Pre-launch permits", origin: "manual" },
    ]);
    await expect(service.createPreBusinessCost({ ...first, amountPaise: 12_346 }))
      .rejects.toThrow("performance_pre_business_cost_idempotency_conflict");
  });

  it("makes concurrent retries of one pre-business cost command converge on one record", async () => {
    const repository = new MemoryRepository();
    const service = new PerformanceAdminSettingsServiceV1(repository);
    const input = {
      commandId: "33333333-3333-4333-8333-333333333333",
      amountPaise: 44_000, note: "Registration before launch", source: "web" as const,
    };
    const [first, retry] = await Promise.all([
      service.createPreBusinessCost(input),
      service.createPreBusinessCost(input),
    ]);
    expect(first.id).toBe(retry.id);
    expect(await service.listEntries()).toHaveLength(1);
  });

  it("recovers from a transient atomic-storage failure when the command is retried", async () => {
    class FailOnceRepository extends MemoryRepository {
      private failNext = true;
      async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
        if (this.failNext) {
          this.failNext = false;
          throw new Error("temporary_storage_failure");
        }
        return super.compareAndSet(id, expectedRevision, next);
      }
    }
    const repository = new FailOnceRepository();
    const service = new PerformanceAdminSettingsServiceV1(repository);
    const input = {
      commandId: "66666666-6666-4666-8666-666666666666",
      amountPaise: 23_450, note: "Recovery after storage retry", source: "android" as const,
    };
    await expect(service.createPreBusinessCost(input)).rejects.toThrow("temporary_storage_failure");
    const recovered = await service.createPreBusinessCost(input);
    const replay = await service.createPreBusinessCost(input);
    expect(recovered.id).toBe(replay.id);
    expect(recovered.revision).toBe(1);
    expect(await service.listEntries()).toHaveLength(1);
  });

  it("rejects invalid target and pre-business entries without persisting them", async () => {
    const repository = new MemoryRepository();
    const service = new PerformanceAdminSettingsServiceV1(repository);
    await expect(service.setMonthlyDriverTargetPaise(-1, "web"))
      .rejects.toThrow("performance_driver_target_invalid");
    await expect(service.createPreBusinessCost({
      commandId: "33333333-3333-4333-8333-333333333333",
      amountPaise: 0, note: "Invalid amount", source: "web",
    })).rejects.toThrow("performance_pre_business_cost_invalid");
    await expect(service.createPreBusinessCost({
      commandId: "44444444-4444-4444-8444-444444444444",
      amountPaise: 100, note: "   ", source: "web",
    })).rejects.toThrow("performance_pre_business_cost_invalid");
    expect(await repository.list()).toHaveLength(0);
  });

  it("adapts the authoritative Business Settings record without guessing a start date", async () => {
    const adapter = new PerformanceBusinessSettingsAdapterV1({
      get: async () => undefined,
    } as never);
    await expect(adapter.getBusinessStartDate()).rejects.toThrow("business_start_date_not_configured");
    const configured = new PerformanceBusinessSettingsAdapterV1({
      get: async () => ({
        id: "feature:business-settings:business", schemaVersion: 1, revision: 2,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
        source: "web", data: { schemaVersion: 1, businessStartDate: "2026-01-01" },
      }),
    } as never);
    await expect(configured.getBusinessStartDate()).resolves.toBe("2026-01-01");
  });
});
