import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { FeatureRecordService } from "../packages/application/src/feature-record-service";

type SampleData = { label: string; amountPaise: number };

function validateSample(value: unknown): asserts value is SampleData {
  if (!value || typeof value !== "object" ||
      typeof (value as SampleData).label !== "string" ||
      !(value as SampleData).label.trim() ||
      !Number.isSafeInteger((value as SampleData).amountPaise) ||
      (value as SampleData).amountPaise < 0) {
    throw new Error("sample_payload_invalid");
  }
}

class MemoryAtomicRepository implements AtomicRecordBatchRepository {
  private readonly rows = new Map<string, RecordEnvelope<unknown>>();

  async get<T>(id: string): Promise<RecordEnvelope<T> | undefined> {
    return this.rows.get(id) as RecordEnvelope<T> | undefined;
  }

  async put<T>(record: RecordEnvelope<T>): Promise<void> {
    this.rows.set(record.id, record as RecordEnvelope<unknown>);
  }

  async list<T>(): Promise<Array<RecordEnvelope<T>>> {
    return [...this.rows.values()] as Array<RecordEnvelope<T>>;
  }

  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]): Promise<boolean> {
    if (!mutations.length || new Set(mutations.map(item => item.id)).size !== mutations.length) {
      throw new Error("atomic_record_batch_invalid");
    }
    for (const item of mutations) {
      const current = this.rows.get(item.id);
      if (item.expectedRevision === null ? current !== undefined : current?.revision !== item.expectedRevision) return false;
      if (item.next.revision !== (item.expectedRevision ?? 0) + 1) throw new Error("atomic_record_batch_revision_invalid");
    }
    mutations.forEach(item => this.rows.set(item.id, item.next as RecordEnvelope<unknown>));
    return true;
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async compareAndSet<T>(
    id: string,
    expectedRevision: number | null,
    next: RecordEnvelope<T>,
  ): Promise<boolean> {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

function setup() {
  const repository = new MemoryAtomicRepository();
  let tick = 0;
  const service = new FeatureRecordService<SampleData>(
    repository,
    { featureId: "sample", recordIdPrefix: "feature:sample:", validate: validateSample },
    () => `2026-11-07T00:00:0${tick++}.000Z`,
  );
  return { repository, service };
}

describe("atomic feature-owned record service", () => {
  it("creates namespaced records with the shared envelope and rejects duplicate creation", async () => {
    const { service } = setup();
    const created = await service.create({
      id: "feature:sample:one",
      data: { label: "Fuel", amountPaise: 12500 },
      source: "web",
      businessDate: "2026-11-01",
    });
    expect(created).toMatchObject({
      id: "feature:sample:one",
      schemaVersion: 1,
      revision: 1,
      createdAt: "2026-11-07T00:00:00.000Z",
      updatedAt: "2026-11-07T00:00:00.000Z",
    });
    await expect(service.create({
      id: "feature:sample:one",
      data: { label: "Fuel", amountPaise: 12500 },
      source: "web",
    })).rejects.toThrow("feature_record_already_exists");
  });

  it("stores stable person ID and action role as immutable creation provenance", async () => {
    const { service } = setup();
    const created = await service.create({
      id: "feature:sample:attributed",
      data: { label: "Maintenance", amountPaise: 5000 },
      source: "web",
      createdBy: { personId: "person-owner", role: "admin" },
    });
    expect(created.createdBy).toEqual({ personId: "person-owner", role: "admin" });
    const updated = await service.update({
      id: created.id, expectedRevision: 1,
      data: { label: "Maintenance corrected", amountPaise: 5500 },
    });
    expect(updated.createdBy).toEqual({ personId: "person-owner", role: "admin" });
  });

  it("updates only at the expected revision and preserves immutable creation metadata", async () => {
    const { service } = setup();
    const created = await service.create({
      id: "feature:sample:one",
      data: { label: "Fuel", amountPaise: 12500 },
      source: "android",
      businessDate: "2026-11-01",
    });
    const updated = await service.update({
      id: created.id,
      expectedRevision: 1,
      data: { label: "Fuel and toll", amountPaise: 18000 },
    });
    expect(updated).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      source: "android",
      businessDate: "2026-11-01",
      updatedAt: "2026-11-07T00:00:01.000Z",
      revision: 2,
      data: { label: "Fuel and toll", amountPaise: 18000 },
    });
    await expect(service.update({
      id: created.id,
      expectedRevision: 1,
      data: { label: "Stale", amountPaise: 1 },
    })).rejects.toThrow("feature_record_stale_revision");
  });

  it("allows only one concurrent update to commit at a given revision", async () => {
    const { service } = setup();
    const created = await service.create({
      id: "feature:sample:one",
      data: { label: "Fuel", amountPaise: 100 },
      source: "web",
    });
    const results = await Promise.allSettled([
      service.update({ id: created.id, expectedRevision: 1, data: { label: "A", amountPaise: 200 } }),
      service.update({ id: created.id, expectedRevision: 1, data: { label: "B", amountPaise: 300 } }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await service.get(created.id))?.revision).toBe(2);
  });

  it("rejects foreign namespaces and invalid payloads at every ingress", async () => {
    const { service, repository } = setup();
    await expect(service.create({
      id: "feature:other:one",
      data: { label: "Fuel", amountPaise: 1 },
      source: "web",
    })).rejects.toThrow("feature_record_namespace_mismatch");
    await expect(service.create({
      id: "feature:sample:bad",
      data: { label: "", amountPaise: -1 },
      source: "web",
    })).rejects.toThrow("sample_payload_invalid");

    await repository.put({
      id: "feature:sample:corrupt",
      schemaVersion: 1,
      createdAt: "2026-11-07T00:00:00.000Z",
      updatedAt: "2026-11-07T00:00:00.000Z",
      source: "web",
      revision: 1,
      data: { label: "", amountPaise: -1 },
    });
    await expect(service.get("feature:sample:corrupt")).rejects.toThrow("sample_payload_invalid");
    await expect(service.list()).rejects.toThrow("sample_payload_invalid");
  });

  it("replays an operation receipt after create commit and rejects changed payload reuse", async () => {
    const { service, repository } = setup();
    const operation = { operationId: "form-op-create", payloadFingerprint: '{"amount":12500}' };
    const input = {
      id: "feature:sample:once", data: { label: "Fuel", amountPaise: 12500 },
      source: "web" as const, now: "2026-11-10T10:00:00.000Z", operation,
    };
    const first = await service.create(input);
    const replay = await service.create({ ...input, now: "2026-11-10T11:00:00.000Z" });
    expect(replay).toEqual(first);
    expect((await repository.list()).filter(row => row.id === first.id)).toHaveLength(1);
    await expect(service.create({
      ...input, data: { label: "Changed", amountPaise: 13000 },
    })).rejects.toThrow("feature_record_operation_payload_conflict");
  });

  it("returns the original update revision and receipt when retry follows a committed update", async () => {
    const { service, repository } = setup();
    const created = await service.create({
      id: "feature:sample:update-replay", data: { label: "Original", amountPaise: 100 },
      source: "web",
    });
    const operation = { operationId: "form-op-update", payloadFingerprint: '{"amount":200}' };
    const input = {
      id: created.id, expectedRevision: 1, data: { label: "Corrected", amountPaise: 200 },
      now: "2026-11-10T12:00:00.000Z", operation,
    };
    const first = await service.update(input);
    const replay = await service.update(input);
    expect(replay).toEqual(first);
    expect(replay.revision).toBe(2);
    expect((await service.get(created.id))?.revision).toBe(2);
    await expect(service.update({
      ...input, data: { label: "Different", amountPaise: 300 },
    })).rejects.toThrow("feature_record_operation_payload_conflict");
    expect((await repository.list()).filter(row => row.id === created.id)).toHaveLength(1);
  });

  it("deduplicates concurrent create attempts with the same durable operation", async () => {
    const { service, repository } = setup();
    const input = {
      id: "feature:sample:concurrent", data: { label: "Fuel", amountPaise: 500 },
      source: "web" as const,
      operation: { operationId: "form-op-concurrent", payloadFingerprint: '{"amount":500}' },
    };
    const results = await Promise.all([service.create(input), service.create(input)]);
    expect(results[0]).toEqual(results[1]);
    expect((await repository.list()).filter(row => row.id === input.id)).toHaveLength(1);
  });

  it("requires a non-empty suffix and a canonical feature namespace", () => {
    const repository = new MemoryAtomicRepository();
    expect(() => new FeatureRecordService(repository, {
      featureId: "sample",
      recordIdPrefix: "feature:sample",
      validate: validateSample,
    })).toThrow("feature_record_definition_invalid");
  });
});
