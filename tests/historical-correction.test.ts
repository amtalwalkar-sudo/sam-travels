import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import {
  assertCorrectionAuthority,
  assertHistoricalCorrectionV1,
  projectHistoricalCorrectionsV1,
  type CorrectionActorV1,
  type HistoricalCorrectionV1,
} from "../packages/domain/src/historical-correction";
import { HistoricalCorrectionService } from "../packages/application/src/historical-correction-service";
import { PersonIdentityService } from "../packages/application/src/person-identity-service";
import type { BusinessPersonV1 } from "../packages/domain/src/person-identity";

type Sample = { createdBy: string; amountPaise: number; note: string };

class MemoryRecords implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(record: RecordEnvelope<T>) { this.rows.set(record.id, record as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as RecordEnvelope<T>[]; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) {
    const current = this.rows.get(id);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
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
      validateProjectedData: value => {
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
