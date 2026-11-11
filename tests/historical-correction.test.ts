import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { DexieRecordRepository, browserDatabase } from "../packages/storage-browser/src/index";
import type { AtomicRecordBatchRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertCorrectionAuthority,
  assertHistoricalCorrectionV1,
  projectHistoricalCorrectionsV1,
  type CorrectionActorV1,
  type HistoricalCorrectionV1,
} from "../packages/domain/src/historical-correction";
import { HistoricalCorrectionService } from "../packages/application/src/historical-correction-service";
import { MaintenanceService } from "../packages/application/src/maintenance-service";
import { FeatureRecordService } from "../packages/application/src/feature-record-service";
import { assertMaintenanceRecordV1 } from "../packages/features/maintenance";
import { PersonIdentityService } from "../packages/application/src/person-identity-service";
import type { BusinessPersonV1 } from "../packages/domain/src/person-identity";

type Sample = { createdBy: string; amountPaise: number; note: string };

class MemoryRecords implements AtomicRecordBatchRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as RecordEnvelope<T>[]; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    return this.compareAndSetMany([{ id, expectedRevision, next: next as RecordEnvelope<unknown> }]);
  }
  async compareAndSetMany(mutations: readonly { id: string; expectedRevision: number | null; next: RecordEnvelope<unknown> }[]) {
    if (!mutations.length || new Set(mutations.map(item => item.id)).size !== mutations.length) return false;
    for (const item of mutations) {
      const current = this.rows.get(item.id);
      if (item.next.id !== item.id ||
          (item.expectedRevision === null ? current !== undefined : current?.revision !== item.expectedRevision) ||
          item.next.revision !== (item.expectedRevision ?? 0) + 1) return false;
    }
    mutations.forEach(item => this.rows.set(item.id, item.next));
    return true;
  }
}

const NOW = "2026-11-11T10:00:00.000Z";
const ADMIN_VERIFIED_AT = NOW;
function original(): RecordEnvelope<Sample> {
  return {
    id: "feature:sample:record-1", schemaVersion: 1, createdAt: NOW, updatedAt: NOW,
    source: "web", revision: 1,
    data: { createdBy: "driver-1", amountPaise: 10000, note: "original note" },
  };
}
function makeService(records: MemoryRecords, actor: CorrectionActorV1) {
  return new HistoricalCorrectionService(
    records,
    { currentActor: async () => actor },
    { resolve: async () => ({
      featureId: "sample",
      originalAuthorId: "driver-1",
      allowedFieldPaths: ["amountPaise", "note"],
      validateProjectedData: (value: unknown) => {
        const row = value as Sample;
        if (!Number.isSafeInteger(row.amountPaise) || row.amountPaise < 0 || typeof row.note !== "string") {
          throw new Error("sample_projection_invalid");
        }
      },
    }) },
    "web",
    () => NOW,
  );
}

describe("person identity service", () => {
  it("keeps one person ID while switching Driver and PIN-verified Admin roles", async () => {
    const person: BusinessPersonV1 = {
      schemaVersion: 1, personId: "person-1", displayName: "Business owner",
      roles: ["driver", "admin"], status: "active",
    };
    let configuredPin: string | undefined;
    let currentNow = NOW;
    const identity = new PersonIdentityService(
      { get: async id => id === person.personId ? person : undefined },
      {
        isConfigured: async () => configuredPin !== undefined,
        configure: async pin => { configuredPin = pin; },
        verify: async pin => configuredPin === pin,
      },
      () => currentNow,
    );
    await expect(identity.activate("person-1", "admin", "2468"))
      .rejects.toThrow("business_admin_pin_not_configured");
    await identity.configureInitialAdminPin("2468");
    await expect(identity.configureInitialAdminPin("1357"))
      .rejects.toThrow("business_admin_pin_already_configured");
    const driver = await identity.activate("person-1", "driver");
    const admin = await identity.activate("person-1", "admin", "2468");
    expect(driver.actorId).toBe(admin.actorId);
    expect(driver.role).toBe("driver");
    expect(admin).toMatchObject({ role: "admin", actorId: "person-1", adminPinVerifiedAt: NOW });
    currentNow = "2026-11-11T10:06:00.000Z";
    await expect(identity.currentActor()).rejects.toThrow("business_admin_session_expired");
    await expect(identity.activate("person-1", "admin", "1111")).rejects.toThrow("business_admin_pin_invalid");
    identity.clear();
    await expect(identity.currentActor()).rejects.toThrow("business_actor_not_active");
  });
});

describe("historical correction policy", () => {
  it("allows driver self-correction and admin correction of another actor's entry", () => {
    expect(() => assertCorrectionAuthority({ role: "driver", actorId: "driver-1" }, "driver-1")).not.toThrow();
    expect(() => assertCorrectionAuthority({ role: "admin", actorId: "admin-1", adminPinVerifiedAt: ADMIN_VERIFIED_AT }, "driver-1")).not.toThrow();
  });

  it("rejects a driver correcting another driver's entry", () => {
    expect(() => assertCorrectionAuthority({ role: "driver", actorId: "driver-2" }, "driver-1"))
      .toThrow("historical_correction_forbidden");
  });

  it("rejects malformed or unattributed correction events", () => {
    expect(() => assertHistoricalCorrectionV1({
      schemaVersion: 1, correctionId: "c1", targetRecordId: "r1", targetRecordRevision: 1,
      featureId: "sample", chainRevision: 1, fieldPath: "__proto__.x",
      beforeValue: 1, afterValue: 2, reason: "fix", actor: { role: "driver", actorId: "d1" }, recordedAt: NOW,
    })).toThrow("historical_correction_invalid");
    expect(() => assertCorrectionAuthority({ role: "driver", actorId: "" }, "driver-1"))
      .toThrow("historical_correction_actor_unattributed");
  });

  it("projects a valid correction chain once and retains the original payload", () => {
    const source = original().data;
    const first: HistoricalCorrectionV1 = {
      schemaVersion: 1, correctionId: "c1", targetRecordId: "feature:sample:record-1",
      targetRecordRevision: 1, featureId: "sample", chainRevision: 1,
      fieldPath: "amountPaise", beforeValue: 10000, afterValue: 12500,
      reason: "Amount was entered incorrectly", actor: { role: "driver", actorId: "driver-1" }, recordedAt: NOW,
    };
    const second: HistoricalCorrectionV1 = {
      ...first, correctionId: "c2", chainRevision: 2, supersedesCorrectionId: "c1",
      beforeValue: 12500, afterValue: 13000, reason: "Second correction",
    };
    const projection = projectHistoricalCorrectionsV1(source, [second, first]);
    expect(projection).toMatchObject({ status: "valid", chainRevision: 2, headCorrectionId: "c2" });
    expect(projection.data).toMatchObject({ amountPaise: 13000 });
    expect(source.amountPaise).toBe(10000);
  });

  it("marks forks and stale before-values for attention instead of last-write-wins", () => {
    const first: HistoricalCorrectionV1 = {
      schemaVersion: 1, correctionId: "c1", targetRecordId: "r1", targetRecordRevision: 1,
      featureId: "sample", chainRevision: 1, fieldPath: "amountPaise",
      beforeValue: 10000, afterValue: 12000, reason: "fix", actor: { role: "driver", actorId: "driver-1" }, recordedAt: NOW,
    };
    const fork = { ...first, correctionId: "c2", afterValue: 14000 };
    expect(projectHistoricalCorrectionsV1({ amountPaise: 10000 }, [first, fork]).reason)
      .toBe("correction_chain_fork");
    expect(projectHistoricalCorrectionsV1({ amountPaise: 9000 }, [first]).reason)
      .toBe("correction_before_value_mismatch");
  });
});

describe("HistoricalCorrectionService", () => {
  it("appends a correction without mutating the original and replays idempotently", async () => {
    const records = new MemoryRecords();
    await records.put(original());
    const service = makeService(records, { role: "driver", actorId: "driver-1" });
    const input = {
      correctionId: "correction-1", targetRecordId: "feature:sample:record-1",
      expectedTargetRevision: 1, expectedChainRevision: 0,
      fieldPath: "amountPaise", afterValue: 12500, reason: "Incorrect amount",
    } as const;
    const first = await service.submit(input);
    const replay = await service.submit(input);
    expect(first).toMatchObject({ chainRevision: 1, currentData: { amountPaise: 12500 } });
    expect(replay.correction.correctionId).toBe(first.correction.correctionId);
    expect((await records.get<Sample>("feature:sample:record-1"))?.data.amountPaise).toBe(10000);
    expect(await service.listForTarget("feature:sample:record-1")).toHaveLength(1);
  });

  it("allows Admin to correct any author's record, but denies a different Driver", async () => {
    const records = new MemoryRecords();
    await records.put(original());
    await expect(makeService(records, { role: "driver", actorId: "driver-2" }).submit({
      correctionId: "denied", targetRecordId: "feature:sample:record-1",
      expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "amountPaise",
      afterValue: 11000, reason: "attempt",
    })).rejects.toThrow("historical_correction_forbidden");
    const result = await makeService(records, { role: "admin", actorId: "admin-1", adminPinVerifiedAt: ADMIN_VERIFIED_AT }).submit({
      correctionId: "admin-fix", targetRecordId: "feature:sample:record-1",
      expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "amountPaise",
      afterValue: 11000, reason: "Admin correction",
    });
    expect(result.currentData).toMatchObject({ amountPaise: 11000 });
  });


  it("runs the Maintenance Expense correction pilot end to end without changing the original", async () => {
    const records = new MemoryRecords();
    const vehicleId = "feature:vehicle:vehicle-1";
    const maintenance = new MaintenanceService(
      records,
      assertMaintenanceRecordV1,
      { getById: async id => id === vehicleId ? {
        id, schemaVersion: 1, createdAt: NOW, updatedAt: NOW, source: "web", revision: 1,
        data: { lifecycleState: "active" },
      } : undefined },
      () => 0,
      instant => instant.slice(0, 10),
      () => NOW,
    );
    const expense = await maintenance.createExpense({
      uuid: "00000000-0000-4000-8000-000000000001",
      source: "web",
      data: {
        vehicleId, expenseDate: "2026-11-10", expenseName: "Tyre replacement",
        description: "Incorrect amount entered", amountPaise: 10000,
      },
    });
    const service = new HistoricalCorrectionService(
      records,
      { currentActor: async () => ({ role: "admin", actorId: "admin-1", adminPinVerifiedAt: ADMIN_VERIFIED_AT }) },
      { resolve: async target => {
        const row = target.data as Record<string, unknown>;
        if (target.id !== expense.id || row.kind !== "expense" || row.schemaVersion !== 1) {
          throw new Error("maintenance_expense_correction_target_invalid");
        }
        return {
          featureId: "maintenance",
          allowedFieldPaths: ["amountPaise"],
          validateProjectedData: (value: unknown) => {
            const projected = value as Record<string, unknown>;
            if (projected.kind !== "expense" || !Number.isSafeInteger(projected.amountPaise) ||
                (projected.amountPaise as number) < 0) throw new Error("maintenance_expense_correction_value_invalid");
          },
        };
      } },
      "web",
      () => NOW,
    );
    const input = {
      correctionId: "maintenance-correction-1", targetRecordId: expense.id,
      expectedTargetRevision: expense.revision, expectedChainRevision: 0,
      fieldPath: "amountPaise", afterValue: 12500, reason: "Receipt total was entered incorrectly",
      businessEffectiveDate: expense.data.expenseDate,
    } as const;
    const first = await service.submit(input);
    const replay = await service.submit(input);
    const originalRecord = await records.get<typeof expense.data>(expense.id);
    const chain = await service.listForTarget(expense.id);
    expect(first).toMatchObject({ chainRevision: 1, currentData: { amountPaise: 12500 } });
    expect(replay.correction.correctionId).toBe(first.correction.correctionId);
    expect(originalRecord?.data.amountPaise).toBe(10000);
    expect(chain).toHaveLength(1);
    expect(projectHistoricalCorrectionsV1(originalRecord?.data, chain)).toMatchObject({
      status: "valid", chainRevision: 1, data: { amountPaise: 12500 },
    });
  });

  it("attributes Maintenance Expense and enforces Driver self-correction and Admin authority", async () => {
    await browserDatabase.records.clear();
    const records = new DexieRecordRepository();
    const vehicleId = "feature:vehicle:vehicle-actor";
    const maintenance = new MaintenanceService(
      records, assertMaintenanceRecordV1,
      { getById: async id => id === vehicleId ? {
        id, schemaVersion: 1, createdAt: NOW, updatedAt: NOW, source: "web", revision: 1,
        data: { lifecycleState: "active" },
      } : undefined },
      () => 0, instant => instant.slice(0, 10), () => NOW,
    );
    FeatureRecordService.setAuthorResolver(async () => ({ personId: "person-driver", role: "driver" }));
    const expense = await maintenance.createExpense({
      uuid: "00000000-0000-4000-8000-000000000099", source: "web",
      data: { vehicleId, expenseDate: "2026-11-10", expenseName: "Repair",
        description: "Test attribution", amountPaise: 9000 },
    });
    expect(expense.createdBy).toEqual({ personId: "person-driver", role: "driver" });
    const resolveTarget = async (target: RecordEnvelope<unknown>) => {
      if (target.id !== expense.id || (target.data as Record<string, unknown>).kind !== "expense") {
        throw new Error("maintenance_expense_correction_target_invalid");
      }
      return { featureId: "maintenance", allowedFieldPaths: ["amountPaise"], validateProjectedData: (value: unknown) => {
        const data = value as Record<string, unknown>;
        if (!Number.isSafeInteger(data.amountPaise) || (data.amountPaise as number) < 0) {
          throw new Error("maintenance_expense_correction_value_invalid");
        }
      } };
    };
    const own = new HistoricalCorrectionService(
      records, { currentActor: async () => ({ role: "driver", actorId: "person-driver" }) },
      { resolve: resolveTarget }, "web", () => NOW,
    );
    const first = await own.submit({
      correctionId: "expense-self-correction", targetRecordId: expense.id,
      expectedTargetRevision: expense.revision, expectedChainRevision: 0,
      fieldPath: "amountPaise", afterValue: 9500, reason: "Corrected receipt total",
    });
    expect(first.currentData).toMatchObject({ amountPaise: 9500 });
    const otherDriver = new HistoricalCorrectionService(
      records, { currentActor: async () => ({ role: "driver", actorId: "person-other" }) },
      { resolve: resolveTarget }, "web", () => NOW,
    );
    await expect(otherDriver.submit({
      correctionId: "expense-other-driver", targetRecordId: expense.id,
      expectedTargetRevision: expense.revision, expectedChainRevision: 1,
      fieldPath: "amountPaise", afterValue: 9700, reason: "Not my record",
    })).rejects.toThrow("historical_correction_forbidden");
    const admin = new HistoricalCorrectionService(
      records, { currentActor: async () => ({ role: "admin", actorId: "person-admin", adminPinVerifiedAt: ADMIN_VERIFIED_AT }) },
      { resolve: resolveTarget }, "web", () => NOW,
    );
    const second = await admin.submit({
      correctionId: "expense-admin-correction", targetRecordId: expense.id,
      expectedTargetRevision: expense.revision, expectedChainRevision: 1,
      fieldPath: "amountPaise", afterValue: 9700, reason: "Admin verified receipt",
    });
    expect(second.currentData).toMatchObject({ amountPaise: 9700 });
    expect((await records.get<typeof expense.data>(expense.id))?.data.amountPaise).toBe(9000);
    expect(await admin.listForTarget(expense.id)).toHaveLength(2);
    await browserDatabase.records.clear();
  });

  it("serializes concurrent corrections to the same target chain", async () => {
    const records = new MemoryRecords();
    await records.put(original());
    const first = makeService(records, { role: "admin", actorId: "admin-1", adminPinVerifiedAt: ADMIN_VERIFIED_AT });
    const second = makeService(records, { role: "admin", actorId: "admin-2", adminPinVerifiedAt: ADMIN_VERIFIED_AT });
    const results = await Promise.allSettled([
      first.submit({ correctionId: "parallel-a", targetRecordId: "feature:sample:record-1",
        expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "amountPaise", afterValue: 12000, reason: "first" }),
      second.submit({ correctionId: "parallel-b", targetRecordId: "feature:sample:record-1",
        expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "amountPaise", afterValue: 13000, reason: "second" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const chain = await first.listForTarget("feature:sample:record-1");
    expect(chain).toHaveLength(1);
    expect(projectHistoricalCorrectionsV1(original().data, chain).status).toBe("valid");
  });

  it("fails closed when author attribution or target revision is unavailable", async () => {
    const records = new MemoryRecords();
    await records.put(original());
    const noAuthor = new HistoricalCorrectionService(
      records, { currentActor: async () => ({ role: "driver", actorId: "driver-1" }) },
      { resolve: async () => ({ featureId: "sample", originalAuthorId: "",
        allowedFieldPaths: ["amountPaise"], validateProjectedData: () => undefined }) },
      "web", () => NOW,
    );
    await expect(noAuthor.submit({
      correctionId: "unattributed", targetRecordId: "feature:sample:record-1",
      expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "amountPaise",
      afterValue: 11000, reason: "not attributed",
    })).rejects.toThrow("historical_correction_target_author_unattributed");
    const adminWithoutOriginalAuthor = new HistoricalCorrectionService(
      records, { currentActor: async () => ({ role: "admin", actorId: "admin-1", adminPinVerifiedAt: ADMIN_VERIFIED_AT }) },
      { resolve: async () => ({ featureId: "sample", allowedFieldPaths: ["amountPaise"],
        validateProjectedData: () => undefined }) },
      "web", () => NOW,
    );
    const legacyAdminCorrection = await adminWithoutOriginalAuthor.submit({
      correctionId: "legacy-admin-fix", targetRecordId: "feature:sample:record-1",
      expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "amountPaise",
      afterValue: 10500, reason: "Admin corrected legacy entry",
    });
    expect(legacyAdminCorrection.currentData).toMatchObject({ amountPaise: 10500 });
    const service = makeService(records, { role: "admin", actorId: "admin-1", adminPinVerifiedAt: ADMIN_VERIFIED_AT });
    await expect(service.submit({
      correctionId: "stale", targetRecordId: "feature:sample:record-1",
      expectedTargetRevision: 2, expectedChainRevision: 0, fieldPath: "amountPaise",
      afterValue: 11000, reason: "stale",
    })).rejects.toThrow("historical_correction_target_revision_changed");
  });

  it("rejects stale chains, disallowed fields and correction-id payload reuse", async () => {
    const records = new MemoryRecords();
    await records.put(original());
    const service = makeService(records, { role: "admin", actorId: "admin-1", adminPinVerifiedAt: ADMIN_VERIFIED_AT });
    const input = {
      correctionId: "reuse-id", targetRecordId: "feature:sample:record-1",
      expectedTargetRevision: 1, expectedChainRevision: 0, fieldPath: "amountPaise",
      afterValue: 11000, reason: "fix",
    } as const;
    await service.submit(input);
    await expect(service.submit({ ...input, afterValue: 12000 }))
      .rejects.toThrow("historical_correction_id_reused");
    await expect(service.submit({
      ...input, correctionId: "stale-chain", expectedChainRevision: 0, afterValue: 13000,
    })).rejects.toThrow("historical_correction_stale_chain");
    await expect(service.submit({
      ...input, correctionId: "not-allowed", expectedChainRevision: 1,
      fieldPath: "createdBy", afterValue: "driver-2",
    })).rejects.toThrow("historical_correction_field_not_allowed");
  });
});
