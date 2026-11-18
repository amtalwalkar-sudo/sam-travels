import initialProfileJson from "./data/initial-admin-profile-v1.json";
import type {
  ComplianceService,
  DriverRecordsService,
  FeatureRecordSource,
  FinanceLoanService,
  VehicleService,
} from "../../../packages/application/src";

type InitialAdminProfileV1 = {
  schemaVersion: 1;
  vehicle: {
    registrationNumber: string; make: string; model: string; vehicleType: string;
    fuelType: string; yearOfManufacture: number; ownership: string; lifecycleState: "active";
  };
  driver: {
    driverId: string; name: string; mobileNumber: string;
    lifecycleState: "active"; selectedForWork: boolean;
  };
  compliance: Array<{
    id: string; complianceName: string; validFrom: string; validTo: string; totalCostPaise: number;
  }>;
  loan: {
    id: string; loanName: string; lenderName: string; principalPaise: number;
    annualInterestRateBasisPoints: number; loanStartDate: string; tenureMonths: number; firstEmiDate: string;
  };
};

const profile = initialProfileJson as InitialAdminProfileV1;

/**
 * Apply the user-supplied first-run Admin profile as ordinary persisted feature records.
 * Existing records are never overwritten, so subsequent launches preserve Admin edits.
 * A partial run is safe to retry: every record has a stable identity and is checked first.
 */
export async function seedInitialAdminProfile(input: Readonly<{
  vehicles: VehicleService;
  drivers: DriverRecordsService;
  compliance: ComplianceService;
  financeLoans: FinanceLoanService;
  source: FeatureRecordSource;
}>): Promise<void> {
  const vehicleId = "feature:vehicle:" + profile.vehicle.registrationNumber;
  const vehicle = await input.vehicles.getByRegistrationNumber(profile.vehicle.registrationNumber);
  if (!vehicle) {
    await input.vehicles.create({
      schemaVersion: 1,
      ...profile.vehicle,
    }, input.source);
  }

  const driver = await input.drivers.get(profile.driver.driverId);
  if (!driver) {
    await input.drivers.create({
      schemaVersion: 1,
      ...profile.driver,
    }, input.source);
  }

  for (const item of profile.compliance) {
    const existing = await input.compliance.get(item.id);
    if (!existing) {
      await input.compliance.create({
        uuid: item.id.slice("feature:compliance:".length),
        data: {
          schemaVersion: 1,
          vehicleId,
          complianceName: item.complianceName,
          validFrom: item.validFrom,
          validTo: item.validTo,
          totalCostPaise: item.totalCostPaise,
        },
        source: input.source,
        businessDate: item.validFrom,
      });
    }
  }

  const loan = await input.financeLoans.get(profile.loan.id);
  if (!loan) {
    await input.financeLoans.create({
      uuid: profile.loan.id.slice("feature:finance:loan:".length),
      details: {
        loanName: profile.loan.loanName,
        lenderName: profile.loan.lenderName,
        vehicleId,
        principalPaise: profile.loan.principalPaise,
        annualInterestRateBasisPoints: profile.loan.annualInterestRateBasisPoints,
        loanStartDate: profile.loan.loanStartDate,
        tenureMonths: profile.loan.tenureMonths,
        firstEmiDate: profile.loan.firstEmiDate,
      },
      source: input.source,
    });
  }
}
