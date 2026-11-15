import type { AtomicRecordRepository } from "../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../packages/core/src/types";
import type { BusinessPersonV1, BusinessRoleV1 } from "../../../packages/domain/src/person-identity";
import type { CorrectionActorV1 } from "../../../packages/domain/src/historical-correction";
import type { PersonIdentityService } from "../../../packages/application/src/person-identity-service";
import type { AdminPresentationServices } from "../../../packages/application/src/admin-presentation-services";
import { getDriverPersonLink, removeDriverPersonLink, saveDriverPersonLink } from "./person-identity-adapters";

export type AdminIdentitySnapshot = Readonly<{
  people: readonly BusinessPersonV1[];
  drivers: readonly Readonly<{ driverId: string; name: string }>[];
  links: Readonly<Record<string, string>>;
  pinConfigured: boolean;
}>;

export interface AdminIdentityPresentationAdapter {
  load(): Promise<AdminIdentitySnapshot>;
  enroll(input: Readonly<{ displayName: string; roles: readonly BusinessRoleV1[]; initialAdminPin?: string }>): Promise<void>;
  linkDriver(input: Readonly<{ driverId: string; personId: string }>): Promise<void>;
  activate(input: Readonly<{ personId: string; role: BusinessRoleV1; pin?: string }>): Promise<CorrectionActorV1>;
  clear(): void;
}

/** Composition-boundary adapter. Identity persistence, PIN policy and actor authority stay outside React. */
export function createAdminIdentityPresentationAdapter(input: {
  identity: PersonIdentityService;
  records: AtomicRecordRepository;
  source: RecordEnvelope<unknown>["source"];
  driverRecords: AdminPresentationServices["driverRecords"];
}): AdminIdentityPresentationAdapter {
  const { identity, records, source, driverRecords } = input;

  const loadSnapshot = async (): Promise<AdminIdentitySnapshot> => {
      const [people, driverRows, pinConfigured] = await Promise.all([
        identity.listPeople(), driverRecords.list(), identity.isAdminPinConfigured(),
      ]);
      const pairs = await Promise.all(driverRows.map(async row =>
        [row.data.driverId, (await getDriverPersonLink(records, row.data.driverId))?.personId ?? ""] as const));
      return Object.freeze({
        people,
        drivers: driverRows.map(row => ({ driverId: row.data.driverId, name: row.data.name })),
        links: Object.freeze(Object.fromEntries(pairs)),
        pinConfigured,
      });
  };

  return Object.freeze<AdminIdentityPresentationAdapter>({
    load: loadSnapshot,
    async enroll(enrollment) {
      const personId = crypto.randomUUID().replaceAll("-", "");
      await identity.registerPerson({
        schemaVersion: 1, personId, displayName: enrollment.displayName.trim(),
        roles: [...enrollment.roles], status: "active",
      }, enrollment.initialAdminPin);
    },

    async linkDriver({ driverId, personId }) {
      if (await identity.isAdminPinConfigured()) {
        const actor = await identity.currentActor();
        if (actor.role !== "admin" || !actor.adminPinVerifiedAt) {
          throw new Error("An active PIN-verified Admin session is required to link Driver profiles.");
        }
      }
      if (personId) {
        const person = (await identity.listPeople()).find(item => item.personId === personId);
        if (!person || person.status !== "active" || !person.roles.includes("driver")) {
          throw new Error("Choose an active enrolled person with the Driver role.");
        }
        await saveDriverPersonLink(records, source, driverId, personId);
      } else {
        await removeDriverPersonLink(records, driverId);
      }
    },

    async activate({ personId, role, pin }) {
      if (role === "driver") {
        const snapshot = await loadSnapshot();
        if (!Object.values(snapshot.links).includes(personId)) {
          throw new Error("Link this person to a Driver profile before activating Driver role.");
        }
      }
      return identity.activate(personId, role, pin);
    },

    clear() { identity.clear(); },
  });
}
