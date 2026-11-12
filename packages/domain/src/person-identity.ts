/**
 * One business person may hold several roles. The person ID is stable across
 * Driver/Admin actions; the selected role describes the authority used.
 */
export type BusinessRoleV1 = "driver" | "admin";

export type BusinessPersonV1 = Readonly<{
  schemaVersion: 1;
  personId: string;
  displayName: string;
  roles: readonly BusinessRoleV1[];
  status: "active" | "inactive";
}>;

export type PersonActorSessionV1 = Readonly<{
  personId: string;
  role: BusinessRoleV1;
  /** Set only by the trusted Admin PIN verifier; never accept from form input. */
  adminPinVerifiedAt?: string;
}>;

const PERSON_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function toCorrectionActorV1(person: BusinessPersonV1, session: PersonActorSessionV1) {
  assertPersonCanAct(person, session);
  return {
    role: session.role,
    actorId: person.personId,
    ...(session.role === "admin" ? { adminPinVerifiedAt: session.adminPinVerifiedAt } : {}),
  } as const;
}

export function assertBusinessPersonV1(value: unknown): asserts value is BusinessPersonV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("business_person_invalid");
  const person = value as Record<string, unknown>;
  if (person.schemaVersion !== 1 || typeof person.personId !== "string" || !PERSON_ID.test(person.personId) ||
      typeof person.displayName !== "string" || !person.displayName.trim() || person.displayName.trim().length > 120 ||
      !Array.isArray(person.roles) || person.roles.length === 0 ||
      person.roles.some(role => role !== "driver" && role !== "admin") ||
      new Set(person.roles).size !== person.roles.length ||
      (person.status !== "active" && person.status !== "inactive")) {
    throw new Error("business_person_invalid");
  }
}

export function assertPersonCanAct(person: BusinessPersonV1, session: PersonActorSessionV1): void {
  assertBusinessPersonV1(person);
  if (person.status !== "active" || session.personId !== person.personId || !person.roles.includes(session.role)) {
    throw new Error("business_person_role_forbidden");
  }
  if (session.role === "admin" &&
      (typeof session.adminPinVerifiedAt !== "string" || !Number.isFinite(Date.parse(session.adminPinVerifiedAt)))) {
    throw new Error("business_admin_pin_verification_required");
  }
}
