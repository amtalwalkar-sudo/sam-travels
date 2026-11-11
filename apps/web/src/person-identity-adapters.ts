import type { AtomicRecordRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import type { CredentialVault } from "../../../packages/core/src/credentials";
import { assertBusinessPersonV1, type BusinessPersonV1 } from "../../../packages/domain/src/person-identity";
import type { BusinessPersonRepository, AdminPinVerifier } from "../../../packages/application/src/person-identity-service";

const PERSON_PREFIX = "identity:person:";
const ADMIN_PIN_KEY = "sam-travels-admin-pin-v1";

/** Person profiles share the existing versioned record store on both PWA and Android. */
export class PersistentBusinessPersonRepository implements BusinessPersonRepository {
  constructor(
    private readonly records: AtomicRecordRepository,
    private readonly source: RecordEnvelope<unknown>["source"],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async get(personId: string): Promise<BusinessPersonV1 | undefined> {
    const row = await this.records.get<BusinessPersonV1>(PERSON_PREFIX + personId);
    if (!row) return undefined;
    try { assertBusinessPersonV1(row.data); }
    catch { throw new Error("business_person_record_invalid"); }
    if (row.data.personId !== personId) throw new Error("business_person_record_invalid");
    return row.data;
  }

  async list(): Promise<BusinessPersonV1[]> {
    const rows = await this.records.list<BusinessPersonV1>();
    return rows.filter(row => row.id.startsWith(PERSON_PREFIX)).map(row => {
      try { assertBusinessPersonV1(row.data); }
      catch { throw new Error("business_person_record_invalid"); }
      if (row.id !== PERSON_PREFIX + row.data.personId) throw new Error("business_person_record_invalid");
      return row.data;
    });
  }

  async save(person: BusinessPersonV1): Promise<BusinessPersonV1> {
    assertBusinessPersonV1(person);
    const id = PERSON_PREFIX + person.personId;
    const current = await this.records.get<BusinessPersonV1>(id);
    const timestamp = this.now();
    const next: RecordEnvelope<BusinessPersonV1> = {
      id, schemaVersion: 1, createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp, source: this.source, revision: (current?.revision ?? 0) + 1,
      data: person,
    };
    const committed = await this.records.compareAndSet(id, current?.revision ?? null, next);
    if (!committed) throw new Error("business_person_revision_conflict");
    return person;
  }
}

type PinVerifierRecordV1 = Readonly<{ schemaVersion: 1; algorithm: "PBKDF2-SHA256"; iterations: 310000; salt: string; digest: string }>;
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

/** Salted PBKDF2 verifier stored only through the platform credential vault. */
export class SecureAdminPinVerifier implements AdminPinVerifier {
  constructor(private readonly vault: CredentialVault) {}

  async isConfigured(): Promise<boolean> {
    return (await this.vault.get(ADMIN_PIN_KEY)) !== undefined;
  }

  async configure(pin: string): Promise<void> {
    if (!/^\d{4,12}$/.test(pin)) throw new Error("business_admin_pin_invalid_format");
    if (await this.isConfigured()) throw new Error("business_admin_pin_already_configured");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const record: PinVerifierRecordV1 = {
      schemaVersion: 1, algorithm: "PBKDF2-SHA256", iterations: 310000,
      salt: encode(salt), digest: await this.derive(pin, salt, 310000),
    };
    await this.vault.set(ADMIN_PIN_KEY, JSON.stringify(record));
  }

  async verify(pin: string): Promise<boolean> {
    if (!/^\d{4,12}$/.test(pin)) return false;
    const raw = await this.vault.get(ADMIN_PIN_KEY);
    if (!raw) return false;
    try {
      const record = JSON.parse(raw) as PinVerifierRecordV1;
      if (record.schemaVersion !== 1 || record.algorithm !== "PBKDF2-SHA256" ||
          record.iterations !== 310000 || typeof record.salt !== "string" ||
          typeof record.digest !== "string") return false;
      const candidate = decode(await this.derive(pin, decode(record.salt), record.iterations));
      const expected = decode(record.digest);
      if (candidate.length !== expected.length) {
        candidate.fill(0); expected.fill(0);
        return false;
      }
      let difference = 0;
      for (let index = 0; index < candidate.length; index++) difference |= candidate[index] ^ expected[index];
      candidate.fill(0);
      expected.fill(0);
      return difference === 0;
    } catch { return false; }
  }

  private async derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
    const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256,
    ));
    const encoded = encode(bits);
    bits.fill(0);
    return encoded;
  }
}
