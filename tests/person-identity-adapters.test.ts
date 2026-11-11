import { describe, expect, it } from "vitest";
import type { RecordEnvelope } from "../packages/core/src/types";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { CredentialVault } from "../packages/core/src/credentials";
import type { BusinessPersonV1 } from "../packages/domain/src/person-identity";
import { PersistentBusinessPersonRepository, SecureAdminPinVerifier } from "../apps/web/src/person-identity-adapters";

class MemoryRecords implements AtomicRecordRepository {
  rows = new Map<string, RecordEnvelope<unknown>>();
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

class MemoryVault implements CredentialVault {
  values = new Map<string, string>();
  async get(name: string) { return this.values.get(name); }
  async set(name: string, value: string) { this.values.set(name, value); }
  async remove(name: string) { this.values.delete(name); }
}

describe("persistent person identity adapters", () => {
  it("persists one person profile with multiple roles in the shared record repository", async () => {
    const records = new MemoryRecords();
    const people = new PersistentBusinessPersonRepository(records, "web", () => "2026-11-11T10:00:00.000Z");
    const person: BusinessPersonV1 = {
      schemaVersion: 1, personId: "person-owner", displayName: "Owner",
      roles: ["driver", "admin"], status: "active",
    };
    await people.save(person);
    expect(await people.get("person-owner")).toEqual(person);
    expect((await people.list())).toEqual([person]);
    expect(records.rows.get("identity:person:person-owner")).toMatchObject({
      source: "web", revision: 1, data: person,
    });
  });

  it("stores only a salted PIN verifier and verifies correct and incorrect PINs", async () => {
    const vault = new MemoryVault();
    const verifier = new SecureAdminPinVerifier(vault);
    expect(await verifier.isConfigured()).toBe(false);
    await verifier.configure("2468");
    expect(await verifier.isConfigured()).toBe(true);
    const stored = [...vault.values.values()][0];
    expect(stored).not.toContain("2468");
    expect(await verifier.verify("2468")).toBe(true);
    expect(await verifier.verify("1357")).toBe(false);
    await expect(verifier.configure("1357")).rejects.toThrow("business_admin_pin_already_configured");
  });
});
