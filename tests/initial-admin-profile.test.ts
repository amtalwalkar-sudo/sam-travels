import { describe, expect, it, vi } from "vitest";
import { seedInitialAdminProfile } from "../apps/web/src/initial-admin-profile";

describe("initial Admin profile import", () => {
  it("creates the supplied vehicle, driver, compliance and loan records once", async () => {
    const created: string[] = [];
    const services = {
      vehicles: {
        getByRegistrationNumber: vi.fn(async () => undefined),
        create: vi.fn(async (data: { registrationNumber: string }) => { created.push("vehicle:" + data.registrationNumber); }),
      },
      drivers: {
        get: vi.fn(async () => undefined),
        create: vi.fn(async (data: { name: string; mobileNumber?: string }) => { created.push("driver:" + data.name + ":" + data.mobileNumber); }),
      },
      compliance: {
        get: vi.fn(async () => undefined),
        create: vi.fn(async (input: { data: { complianceName: string } }) => { created.push("compliance:" + input.data.complianceName); }),
      },
      financeLoans: {
        get: vi.fn(async () => undefined),
        create: vi.fn(async (input: { details: { lenderName: string; firstEmiDate: string } }) => { created.push("loan:" + input.details.lenderName + ":" + input.details.firstEmiDate); }),
      },
      source: "import" as const,
    };

    await seedInitialAdminProfile(services as never);

    expect(created).toEqual([
      "vehicle:MH01EM7360",
      "driver:Ashwinikumar Talwalkar:8097986191",
      "compliance:Insurance",
      "compliance:PUC",
      "compliance:Permit",
      "compliance:Fitness",
      "compliance:Road tax",
      "loan:Varsha Sharma:2026-09-30",
    ]);
  });

  it("does not overwrite existing Admin records on later launches", async () => {
    const services = {
      vehicles: { getByRegistrationNumber: vi.fn(async () => ({ revision: 2 })), create: vi.fn() },
      drivers: { get: vi.fn(async () => ({ revision: 2 })), create: vi.fn() },
      compliance: { get: vi.fn(async () => ({ revision: 2 })), create: vi.fn() },
      financeLoans: { get: vi.fn(async () => ({ revision: 2 })), create: vi.fn() },
      source: "import" as const,
    };

    await seedInitialAdminProfile(services as never);

    expect(services.vehicles.create).not.toHaveBeenCalled();
    expect(services.drivers.create).not.toHaveBeenCalled();
    expect(services.compliance.create).not.toHaveBeenCalled();
    expect(services.financeLoans.create).not.toHaveBeenCalled();
  });
});
