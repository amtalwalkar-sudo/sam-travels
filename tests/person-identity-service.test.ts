import { describe, expect, it } from "vitest";
import { PersonIdentityService } from "../packages/application/src/person-identity-service";
import type { BusinessPersonV1 } from "../packages/domain/src/person-identity";

const NOW = "2026-11-11T10:00:00.000Z";

describe("person identity service", () => {
  it("keeps one person ID while switching Driver and PIN-verified Admin roles", async () => {
    const person: BusinessPersonV1 = {
      schemaVersion: 1, personId: "person-1", displayName: "Business owner",
      roles: ["driver", "admin"], status: "active",
    };
    let configuredPin: string | undefined;
    let currentNow = NOW;
    const people = new Map<string, BusinessPersonV1>();
    const identity = new PersonIdentityService(
      {
        get: async id => people.get(id),
        list: async () => [...people.values()],
        save: async value => { people.set(value.personId, value); return value; },
        remove: async id => { people.delete(id); },
      },
      {
        isConfigured: async () => configuredPin !== undefined,
        configure: async pin => {
          if (configuredPin !== undefined) throw new Error("business_admin_pin_already_configured");
          configuredPin = pin;
        },
        verify: async pin => configuredPin === pin,
      },
      () => currentNow,
    );
    await expect(identity.activate("person-1", "admin", "2468"))
      .rejects.toThrow("business_person_not_found");
    await identity.registerPerson(person, "2468");
    identity.clear();
    const secondPerson: BusinessPersonV1 = {
      schemaVersion: 1, personId: "person-2", displayName: "Second person", roles: ["driver"], status: "active",
    };
    await expect(identity.registerPerson(secondPerson)).rejects.toThrow("business_actor_not_active");
    await expect(identity.updatePerson({ ...person, displayName: "Unauthorised update" }))
      .rejects.toThrow("business_actor_not_active");
    const driver = await identity.activate("person-1", "driver");
    await expect(identity.registerPerson(secondPerson)).rejects.toThrow("business_admin_authority_required");
    await expect(identity.updatePerson({ ...person, displayName: "Driver update" }))
      .rejects.toThrow("business_admin_authority_required");
    const admin = await identity.activate("person-1", "admin", "2468");
    await identity.registerPerson(secondPerson);
    await identity.updatePerson({ ...secondPerson, displayName: "Updated second person" });
    expect(people.get("person-2")?.displayName).toBe("Updated second person");
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
