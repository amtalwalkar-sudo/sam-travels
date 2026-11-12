import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerComplianceBrowserBackupParticipant } from "../apps/web/src/compliance-backup";

describe("Compliance browser backup participant", () => {
  let unregisterVehicle: (() => void) | undefined;
  let unregisterCompliance: (() => void) | undefined;

  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    unregisterCompliance = registerComplianceBrowserBackupParticipant();
  });
  afterEach(() => {
    unregisterCompliance?.();
    unregisterCompliance = undefined;
    unregisterVehicle?.();
    unregisterVehicle = undefined;
  });

  async function seedValidRecords() {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:vehicle:MH01AB1234", schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: {
        schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata",
        model: "Ace", vehicleType: "LCV", fuelType: "Diesel",
        yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
      },
    });
    await browserDatabase.records.put({
      id: "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, vehicleId: "feature:vehicle:MH01AB1234",
        complianceName: "Insurance", validFrom: "2026-01-01",
        validTo: "2026-12-31", totalCostPaise: 365000,
      },
    });
  }

  it("exports and restores the required participant with its Vehicle relationship", async () => {
    await seedValidRecords();
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.manifest.participants).toContainEqual({
      id: "compliance-records", featureId: "compliance",
      snapshotVersion: 1, restoreValidatorId: "compliance-records-v1",
    });
    expect(snapshot.data.records).toHaveLength(2);
    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({
      data: snapshot.data, manifest: snapshot.manifest as never, confirmed: true,
    });
    expect(await browserDatabase.records.get(
      "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
    )).toBeDefined();
  });

  it("restores a pre-Compliance backup when it contains no Compliance records", async () => {
    const snapshot = await exportBrowserSnapshot("0.1.0");
    const legacyManifest = {
      ...snapshot.manifest,
      participants: snapshot.manifest.participants?.filter(item => item.id !== "compliance-records"),
    };
    await expect(restoreBrowserSnapshot({
      data: snapshot.data, manifest: legacyManifest as never, confirmed: true,
    })).resolves.toMatchObject({ restoredCounts: { records: 0 } });
  });

  it("rejects Compliance records whose Vehicle reference is missing", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, vehicleId: "feature:vehicle:UNKNOWN",
        complianceName: "Insurance", validFrom: "2026-01-01",
        validTo: "2026-12-31", totalCostPaise: 365000,
      },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("compliance_vehicle_not_found");
  });

  it("rejects a renewal whose predecessor is absent from the backup", async () => {
    const timestamp = "2026-11-07T00:00:00.000Z";
    await browserDatabase.records.put({
      id: "feature:vehicle:MH01AB1234", schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp, source: "web", revision: 1,
      data: {
        schemaVersion: 1, registrationNumber: "MH01AB1234", make: "Tata",
        model: "Ace", vehicleType: "LCV", fuelType: "Diesel",
        yearOfManufacture: 2022, ownership: "Owned", lifecycleState: "active",
      },
    });
    await browserDatabase.records.put({
      id: "feature:compliance:123e4567-e89b-42d3-a456-426614174001",
      schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
      source: "web", revision: 1,
      data: {
        schemaVersion: 1, vehicleId: "feature:vehicle:MH01AB1234",
        complianceName: "Insurance", validFrom: "2026-01-01",
        validTo: "2026-12-31", totalCostPaise: 365000,
        renewedFromRecordId: "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
      },
    });
    await expect(exportBrowserSnapshot("0.1.0")).rejects.toThrow("compliance_renewal_source_not_found");
  });
  it("exports an early renewal with its actual overlapping validity dates", async () => {
    await seedValidRecords();
    await browserDatabase.records.put({
      id: "feature:compliance:123e4567-e89b-42d3-a456-426614174001",
      schemaVersion: 1, createdAt: "2026-11-07T00:00:00.000Z",
      updatedAt: "2026-11-07T00:00:00.000Z", source: "web", revision: 1,
      data: {
        schemaVersion: 1, vehicleId: "feature:vehicle:MH01AB1234",
        complianceName: "Insurance", validFrom: "2026-12-01",
        validTo: "2027-11-30", totalCostPaise: 400000,
        renewedFromRecordId: "feature:compliance:123e4567-e89b-42d3-a456-426614174000",
      },
    });
    const snapshot = await exportBrowserSnapshot("0.1.0");
    expect(snapshot.data.records.filter(row => row.id.startsWith("feature:compliance:"))).toHaveLength(2);
  });
});
