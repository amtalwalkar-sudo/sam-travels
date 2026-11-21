import { describe, expect, it } from "vitest";
import type { AtomicRecordBatchRepository, AtomicRecordMutation } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  SharedFormRuntime, RecordFormWorkingCopyRepository,
  type FormWorkingCopy, type FormWorkingCopyRepository,
} from "../packages/application/src";
import { BusinessExpensesService } from "../packages/application/src/business-expenses-service";
import { createBusinessExpenseFormSubmissionHandler } from "../apps/web/src/business-expense-form-submission";
import { PLATFORM_FEE_FORM_V1 } from "../packages/application/src";
import {
  assertBusinessExpenseRecordV1, assertFuelPurchaseV1, assertBusinessExpenseEntryV1,
  calculateDailyBusinessExpenses, calculateFuelIntervals, calculateFuelCostRateHistory,
} from "../packages/features/business-expenses";

class MemoryRepository implements AtomicRecordBatchRepository {
  private readonly rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async list<T>() { return [...this.rows.values()] as Array<RecordEnvelope<T>>; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
  async compareAndSetMany(mutations: readonly AtomicRecordMutation[]) {
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
}

class InterruptCompletionOnce implements FormWorkingCopyRepository {
  private fail = true;
  constructor(private readonly inner: FormWorkingCopyRepository) {}
  get(formId: string, instanceId: string) { return this.inner.get(formId, instanceId); }
  list(formId: string) { return this.inner.list(formId); }
  remove(formId: string, instanceId: string) { return this.inner.remove(formId, instanceId); }
  async put(copy: FormWorkingCopy, expectedRevision?: number) {
    if (copy.status === "saved" && this.fail) {
      this.fail = false;
      throw new Error("simulated_process_death_after_domain_commit");
    }
    return this.inner.put(copy, expectedRevision);
  }
}

describe("Admin form durable submission across commit/completion interruption", () => {
  it("replays the original Platform Fee receipt after domain commit and working-copy interruption", async () => {
    const repository = new MemoryRepository();
    const vehicleId = "feature:vehicle:MH01AB1234";
    await repository.put({
      id: vehicleId, schemaVersion: 1, createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z", source: "web", revision: 1,
      data: { lifecycleState: "active" },
    });
    const service = new BusinessExpensesService(repository, {
      validateRecord: assertBusinessExpenseRecordV1,
      validateFuelPurchase: assertFuelPurchaseV1,
      validateExpenseEntry: assertBusinessExpenseEntryV1,
      calculateDailyExpenses: calculateDailyBusinessExpenses,
      calculateFuelIntervals,
      calculateFuelCostRateHistory,
    }, { async getById(id) { return id === vehicleId ? await repository.get(id) as RecordEnvelope<{ lifecycleState: string }> : undefined; } });
    const handler = createBusinessExpenseFormSubmissionHandler(service, "web");
    const copies = new InterruptCompletionOnce(new RecordFormWorkingCopyRepository(repository, "web"));
    const makeRuntime = () => new SharedFormRuntime(copies, {
      submit: async command => {
        const result = await handler(command);
        if (result === undefined) throw new Error("admin_form_handler_not_found");
        return result;
      },
    }, () => "2026-11-19T06:30:00.000Z", () => "platform-fee-operation-1");

    const instanceId = "123e4567-e89b-42d3-a456-426614174099";
    const firstRuntime = makeRuntime();
    let copy = await firstRuntime.open(PLATFORM_FEE_FORM_V1, instanceId);
    copy = await firstRuntime.update(PLATFORM_FEE_FORM_V1, copy, "businessDate", "2026-11-19");
    copy = await firstRuntime.update(PLATFORM_FEE_FORM_V1, copy, "vehicleId", vehicleId);
    copy = await firstRuntime.update(PLATFORM_FEE_FORM_V1, copy, "amountRupees", 125.5);
    copy = await firstRuntime.update(PLATFORM_FEE_FORM_V1, copy, "reference", "trip-99");

    await expect(firstRuntime.save(PLATFORM_FEE_FORM_V1, copy))
      .rejects.toThrow("simulated_process_death_after_domain_commit");

    const pending = await copies.get(PLATFORM_FEE_FORM_V1.id, instanceId);
    expect(pending).toMatchObject({
      status: "pending", operationId: "platform-fee-operation-1",
      submission: { action: "save", submittedAt: "2026-11-19T06:30:00.000Z" },
    });
    const committedBeforeRetry = (await service.listAll()).filter(record => record.id.includes(instanceId));
    expect(committedBeforeRetry).toHaveLength(1);
    const original = committedBeforeRetry[0];

    const retryRuntime = makeRuntime();
    const reopened = await retryRuntime.open(PLATFORM_FEE_FORM_V1, instanceId);
    const replay = await retryRuntime.save(PLATFORM_FEE_FORM_V1, reopened);

    expect(replay).toEqual(original);
    expect(await copies.get(PLATFORM_FEE_FORM_V1.id, instanceId)).toMatchObject({
      status: "saved", operationId: "platform-fee-operation-1",
    });
    const committedAfterRetry = (await service.listAll()).filter(record => record.id.includes(instanceId));
    expect(committedAfterRetry).toEqual([original]);
    expect((await repository.list()).filter(record => record.id.startsWith("__sam_travels_feature_operation__:")))
      .toHaveLength(1);
    expect(original.createdAt).toBe("2026-11-19T06:30:00.000Z");
  });
});
