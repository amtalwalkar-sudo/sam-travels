import type { CorrectionActorV1 } from "../../domain/src/historical-correction";
import {
  assertBusinessPersonV1,
  toCorrectionActorV1,
  type BusinessPersonV1,
  type BusinessRoleV1,
  type PersonActorSessionV1,
} from "../../domain/src/person-identity";

export interface BusinessPersonRepository {
  get(personId: string): Promise<BusinessPersonV1 | undefined>;
  save?(person: BusinessPersonV1): Promise<BusinessPersonV1>;
  list?(): Promise<BusinessPersonV1[]>;
}

/** Platform adapter must verify a PIN without exposing or persisting plaintext here. */
export interface AdminPinVerifier {
  isConfigured(): Promise<boolean>;
  configure(pin: string): Promise<void>;
  verify(pin: string): Promise<boolean>;
}

/**
 * Small role/session boundary for a single-business installation.
 * One person ID is retained when switching between Driver and Admin roles.
 * Admin authority exists only after the injected PIN verifier succeeds.
 */
const ADMIN_SESSION_TTL_MS = 5 * 60 * 1000;

export class PersonIdentityService {
  private activeActor?: CorrectionActorV1;

  constructor(
    private readonly people: BusinessPersonRepository,
    private readonly adminPin: AdminPinVerifier,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listPeople(): Promise<BusinessPersonV1[]> {
    if (!this.people.list) throw new Error("business_person_repository_list_unavailable");
    return this.people.list();
  }

  async registerPerson(person: BusinessPersonV1): Promise<BusinessPersonV1> {
    assertBusinessPersonV1(person);
    if (!this.people.save) throw new Error("business_person_repository_read_only");
    const existing = await this.people.get(person.personId);
    if (existing) throw new Error("business_person_already_exists");
    return this.people.save(person);
  }

  async updatePerson(person: BusinessPersonV1): Promise<BusinessPersonV1> {
    assertBusinessPersonV1(person);
    if (!this.people.save) throw new Error("business_person_repository_read_only");
    if (!await this.people.get(person.personId)) throw new Error("business_person_not_found");
    return this.people.save(person);
  }

  async isAdminPinConfigured(): Promise<boolean> { return this.adminPin.isConfigured(); }

  async configureInitialAdminPin(pin: string): Promise<void> {
    if (!/^\d{4,12}$/.test(pin)) throw new Error("business_admin_pin_invalid_format");
    if (await this.adminPin.isConfigured()) throw new Error("business_admin_pin_already_configured");
    await this.adminPin.configure(pin);
  }

  async activate(personId: string, role: BusinessRoleV1, pin?: string): Promise<CorrectionActorV1> {
    this.activeActor = undefined;
    const person = await this.people.get(personId);
    if (!person) throw new Error("business_person_not_found");
    assertBusinessPersonV1(person);

    const session: PersonActorSessionV1 = role === "admin"
      ? await this.verifyAdmin(personId, pin)
      : { personId, role };

    const actor = toCorrectionActorV1(person, session);
    this.activeActor = actor;
    return actor;
  }

  async currentActor(): Promise<CorrectionActorV1> {
    if (!this.activeActor) throw new Error("business_actor_not_active");
    if (this.activeActor.role === "admin") {
      const verifiedAt = Date.parse(this.activeActor.adminPinVerifiedAt ?? "");
      const age = Date.parse(this.now()) - verifiedAt;
      if (!Number.isFinite(verifiedAt) || age < 0 || age > ADMIN_SESSION_TTL_MS) {
        this.activeActor = undefined;
        throw new Error("business_admin_session_expired");
      }
    }
    return this.activeActor;
  }

  clear(): void {
    this.activeActor = undefined;
  }

  private async verifyAdmin(personId: string, pin?: string): Promise<PersonActorSessionV1> {
    if (!await this.adminPin.isConfigured()) throw new Error("business_admin_pin_not_configured");
    if (typeof pin !== "string" || pin.length < 4 || pin.length > 12 || !/^\d+$/.test(pin)) {
      throw new Error("business_admin_pin_required");
    }
    if (!await this.adminPin.verify(pin)) throw new Error("business_admin_pin_invalid");
    return { personId, role: "admin", adminPinVerifiedAt: this.now() };
  }
}
