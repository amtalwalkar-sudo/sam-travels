import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { assertBusinessSettingsRecordV1 } from "../packages/features/business-settings";
import {
  getApplicationBusinessSettingsService,
  initializeApplicationBusinessSettingsService,
} from "../packages/application/src/business-settings-runtime";

class RuntimeMemoryRepository implements AtomicRecordRepository {
  private readonly rows = new Map<string, RecordEnvelope<unknown>>();

  async get<T>(id: string) {
    return this.rows.get(id) as RecordEnvelope<T> | undefined;
  }

  async put<T>(record: RecordEnvelope<T>) {
    this.rows.set(record.id, record as RecordEnvelope<unknown>);
  }

  async list<T>() {
    return [...this.rows.values()] as Array<RecordEnvelope<T>>;
  }

  async remove(id: string) {
    this.rows.delete(id);
  }

  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

describe("Application Business Settings runtime binding", () => {
  it("binds the service to the authoritative repository before consumers access it", async () => {
    const repository = new RuntimeMemoryRepository();
    const service = initializeApplicationBusinessSettingsService(
      repository,
      assertBusinessSettingsRecordV1,
      () => "2026-11-07T10:00:00.000Z",
    );

    expect(getApplicationBusinessSettingsService()).toBe(service);
    const record = await getApplicationBusinessSettingsService().setBusinessStartDate("2020-02-29", "web");
    expect(await repository.get(record.id)).toEqual(record);
    expect(await getApplicationBusinessSettingsService().get()).toEqual(record);
  });
});
