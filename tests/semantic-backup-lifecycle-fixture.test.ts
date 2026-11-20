import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { exportBrowserSnapshot, restoreBrowserSnapshot, markBrowserRestoreVerified, discardVerifiedBrowserCheckpoint, recoverBrowserRestoreTransactions } from "../packages/storage-browser/src";
import { DexieDriverWorkflowRepository } from "../packages/storage-browser/src/driver-workflow";
import { createDriverCommand } from "../packages/features/work-shift";
import { rebuildTripHistoryProjection, readTripHistoryProjection } from "../packages/features/logbook";
import type { GpsFix } from "../packages/core/src/types";
import { registerBusinessSettingsBrowserBackupParticipant } from "../apps/web/src/business-settings-backup";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { registerDriverRecordsBrowserBackupParticipant } from "../apps/web/src/driver-records-backup";
import { registerFinanceBrowserBackupParticipant } from "../apps/web/src/finance-backup";
import { registerComplianceBrowserBackupParticipant } from "../apps/web/src/compliance-backup";
import { registerMaintenanceBrowserBackupParticipant } from "../apps/web/src/maintenance-backup";
import { registerBusinessExpensesBrowserBackupParticipant } from "../apps/web/src/business-expenses-backup";
import { registerPerformanceBrowserBackupParticipant } from "../apps/web/src/performance-backup";
import { calculateFuelIntervals, calculateDailyBusinessExpenses } from "../packages/features/business-expenses";
import { toCanonicalBackupSnapshotV1, fromCanonicalBackupSnapshotV1 } from "../packages/storage-browser/src/canonical-backup-snapshot";

type Fixture = {
  schemaVersion: number;
  fixtureId: string;
  lifecycle: string[];
  comparison: string[];
  domains: Record<string, { requiredKinds: string[]; lineage: string[] }>;
  operatingConfiguration: {
    mode: string;
    vehicle: { cardinality: string; recordId: string };
    driver: { cardinality: string; profileRecordId: string; selectionRecordId: string };
    currentPairing: { cardinality: string; assignmentHistoryRecordId: string; vehicleId: string; driverId: string };
    referencePolicy: string;
    fleetExpansion: string;
    compatibility: string;
  };
  status: string;
  populatedGraph: { status: string; recordCount: number; records: Array<{ id: string; data: { kind?: string; registrationNumber?: string; vehicleId?: string; assignments?: Array<{ vehicleId: string }> } }>; lineage: { correctionChainHeads: Array<{ featureId: string; targetRecordId: string; chainRevision: number; headCorrectionId: string }>; reversalSourceIds: string[] }; work: { eventIds: string[]; driverId: string }; logBook: { events: Array<{ eventId: string; driverId: string; vehicleId: string }> } };
  emptyParticipantIds: string[];
  emptyParticipantPolicy: { required: string; restore: string; negative: string };
  canonicalSnapshotContract: { format: string; schemaVersion: number; recordShape: string[]; participantInventory: string; revisionSource: string; interchange: string };
  expectedBusinessResults: {
    fuelIntervals: Array<Record<string, unknown>>;
    dailyExpenses: Record<string, number>;
    maintenanceAccrual: Record<string, string | number>;
    finance: Record<string, number>;
  };
};

const fixture = JSON.parse(readFileSync(
  new URL("../fixtures/semantic-backup-lifecycle-v1.json", import.meta.url),
  "utf8",
)) as Fixture;

describe("shared cross-platform semantic backup fixture contract", () => {
  it("declares the complete restore lifecycle and normalized comparison dimensions", () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.fixtureId).toBe("sam-travels-cross-platform-semantic-restore-v1");
    expect(fixture.lifecycle).toEqual([
      "export", "restore", "database_reopen", "startup_recovery", "re_export",
    ]);
    expect(fixture.comparison).toEqual([
      "record_ids", "revisions", "references", "event_ordering", "correction_chain_heads",
      "pending_work_and_outbox_state", "calculation_outputs", "source_provenance",
    ]);
  });

  it("limits current end-to-end data to one configured vehicle and one configured driver", () => {
    expect(fixture.operatingConfiguration).toMatchObject({
      mode: "single_vehicle_single_driver",
      vehicle: { cardinality: "exactly_one_active", recordId: "feature:vehicle:SYNTHETICVEHICLE001" },
      driver: {
        cardinality: "exactly_one_active",
        profileRecordId: "feature:driver-records:driver:driver-001",
        selectionRecordId: "work:selected-driver",
      },
      currentPairing: {
        cardinality: "exactly_one_current_assignment",
        assignmentHistoryRecordId: "feature:driver-records:assignment:driver-001",
        vehicleId: "feature:vehicle:SYNTHETICVEHICLE001",
        driverId: "driver-001",
      },
      fleetExpansion: "deferred_until_separately_approved",
    });
    expect(fixture.operatingConfiguration.referencePolicy).toContain("configured vehicle ID");
    expect(fixture.operatingConfiguration.referencePolicy).toContain("configured driver ID");
    expect(fixture.domains.work.lineage).toEqual(
      expect.arrayContaining(["configuredDriverId", "configuredVehicleId"]),
    );
    expect(fixture.domains.businessExpenses.lineage).toEqual(
      expect.arrayContaining(["vehicleId", "driverId"]),
    );
  });

  it("covers every requested domain and its lineage requirements", () => {
    expect(Object.keys(fixture.domains).sort()).toEqual([
      "businessExpenses", "compliance", "finance", "logBook", "maintenance", "performance", "work",
    ]);
    for (const [domain, contract] of Object.entries(fixture.domains)) {
      expect(contract.requiredKinds.length, domain).toBeGreaterThan(0);
      expect(contract.lineage.length, domain).toBeGreaterThan(0);
    }
    expect(fixture.domains.finance.requiredKinds).toEqual(
      expect.arrayContaining(["loan_schedule", "payment_ledger", "prepayment", "settlement"]),
    );
    expect(fixture.domains.compliance.requiredKinds).toEqual(
      expect.arrayContaining(["renewal", "overlap_decision", "correction"]),
    );
    expect(fixture.domains.maintenance.requiredKinds).toEqual(
      expect.arrayContaining(["rate_history", "daily_accrual", "correction"]),
    );
    expect(fixture.domains.businessExpenses.requiredKinds).toEqual(
      expect.arrayContaining(["expense", "reversal", "correction"]),
    );
  });

  it("keeps the populated graph internally referentially consistent", () => {
    const records = fixture.populatedGraph.records;
    const byId = new Map(records.map(record => [record.id, record]));
    const vehicle = records.find(record => record.id.startsWith("feature:vehicle:"));
    expect(vehicle?.data.registrationNumber).toBe("SYNTHETICVEHICLE001");
    expect(fixture.operatingConfiguration.vehicle.recordId).toBe(vehicle?.id);
    expect(fixture.operatingConfiguration.currentPairing.vehicleId).toBe(vehicle?.id);
    const assignment = byId.get(fixture.operatingConfiguration.currentPairing.assignmentHistoryRecordId);
    expect(assignment?.data.assignments?.[0]?.vehicleId).toBe(vehicle?.id);
    const driverId = fixture.operatingConfiguration.currentPairing.driverId;
    expect(byId.has(fixture.operatingConfiguration.driver.profileRecordId)).toBe(true);
    expect(records.filter(record => record.id.startsWith("feature:maintenance:") ||
      record.id.startsWith("feature:compliance:") || record.id.startsWith("feature:business-expenses:"))
      .every(record => record.data.vehicleId === vehicle?.id)).toBe(true);
    expect(fixture.populatedGraph.work.driverId).toBe(driverId);
    expect(fixture.populatedGraph.logBook.events.every(event => event.driverId === driverId &&
      event.vehicleId === vehicle?.id)).toBe(true);
    expect(fixture.populatedGraph.work.eventIds.slice(1)).toEqual(
      fixture.populatedGraph.logBook.events.map(event => event.eventId),
    );
  });

  it("defines empty-participant and fail-closed owner semantics", () => {
    expect(fixture.emptyParticipantIds).toContain("business-settings-records");
    expect(fixture.emptyParticipantPolicy).toMatchObject({
      required: expect.stringContaining("zero records is valid"),
      restore: expect.stringContaining("clear stale rows"),
      negative: expect.stringContaining("Unknown participant IDs"),
    });
  });


  it("pins expected business calculations to the shared synthetic source graph", () => {
    const rows = fixture.populatedGraph.records as Array<{ id: string; data: any }>;
    const fuel = rows.filter(row => row.id.startsWith("feature:business-expenses:fuel:")).map(row => row.data);
    const expenses = rows.filter(row => row.id.startsWith("feature:business-expenses:entry:")).map(row => row.data);
    const interval = calculateFuelIntervals(fuel as never).find(item =>
      item.startCheckpointId === fixture.expectedBusinessResults.fuelIntervals[0].startCheckpointId);
    expect(interval).toMatchObject(fixture.expectedBusinessResults.fuelIntervals[0]);
    const dailyTotals = calculateDailyBusinessExpenses(fuel as never, expenses as never).reduce((total, row) => ({
      fuelPaise: total.fuelPaise + row.fuelPaise,
      platformFeesPaise: total.platformFeesPaise + row.platformFeesPaise,
      trafficChallansPaise: total.trafficChallansPaise + row.trafficChallansPaise,
      miscellaneousPaise: total.miscellaneousPaise + row.miscellaneousPaise,
      reportedSourceExpensePaise: total.reportedSourceExpensePaise + row.reportedSourceExpensePaise,
      normalOperatingExpensePaise: total.normalOperatingExpensePaise + row.normalOperatingExpensePaise,
      fullCostExpensePaise: total.fullCostExpensePaise + row.fullCostExpensePaise,
    }), { fuelPaise: 0, platformFeesPaise: 0, trafficChallansPaise: 0, miscellaneousPaise: 0,
      reportedSourceExpensePaise: 0, normalOperatingExpensePaise: 0, fullCostExpensePaise: 0 });
    expect(dailyTotals).toEqual(fixture.expectedBusinessResults.dailyExpenses);
    const accrual = rows.find(row => row.id.startsWith("feature:maintenance:daily-accrual:"))?.data;
    expect(accrual).toMatchObject(fixture.expectedBusinessResults.maintenanceAccrual);
    const loan = rows.find(row => row.id.startsWith("feature:finance:loan:"))?.data;
    expect(loan?.details.principalPaise).toBe(fixture.expectedBusinessResults.finance.loanPrincipalPaise);
    expect(loan?.scheduleVersions[0].output.regularEmiPaise).toBe(fixture.expectedBusinessResults.finance.regularEmiPaise);
    expect(loan?.scheduleVersions[0].output.rows).toHaveLength(fixture.expectedBusinessResults.finance.scheduledInstallments);
    const ledger = rows.find(row => row.id.startsWith("feature:finance:payments:"))?.data;
    expect(ledger.entries.reduce((sum: number, item: any) => sum + item.amountPaise, 0))
      .toBe(fixture.expectedBusinessResults.finance.committedPaymentPaise);
    expect(ledger.entries.reduce((sum: number, item: any) => sum + item.unallocatedCreditPaise, 0))
      .toBe(fixture.expectedBusinessResults.finance.unallocatedCreditPaise);
  });

  it("does not misrepresent the contract seed as completed parity evidence", () => {
    expect(fixture.status).toBe("populated_seed_pending_production_lifecycle");
    expect(fixture.populatedGraph.status).toBe("synthetic_seed_pending_production_lifecycle");
    expect(fixture.populatedGraph.recordCount).toBe(29);
    expect(fixture.populatedGraph.records).toHaveLength(29);
    const ids = fixture.populatedGraph.records.map(record => record.id);
    expect(ids.some(id => id.startsWith("feature:finance:"))).toBe(true);
    expect(ids.some(id => id.startsWith("feature:compliance:"))).toBe(true);
    expect(ids.some(id => id.startsWith("feature:maintenance:"))).toBe(true);
    expect(ids.some(id => id.startsWith("feature:business-expenses:"))).toBe(true);
    expect(ids.some(id => id.startsWith("feature:performance:"))).toBe(true);
    expect(fixture.populatedGraph.lineage.reversalSourceIds).toContain("feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174031");
    const paymentLedger = fixture.populatedGraph.records.find(record => record.id ===
      "feature:finance:payments:123e4567-e89b-42d3-a456-426614174000") as any;
    expect(paymentLedger.data.entries).toHaveLength(1);
    expect(paymentLedger.data.entries[0]).toMatchObject({ id: "fixture-payment-001", scheduleVersion: 1, amountPaise: 100000 });
    expect(ids).toEqual(expect.arrayContaining([
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174070",
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174071",
      "feature:business-expenses:fuel:123e4567-e89b-42d3-a456-426614174072",
      "feature:business-expenses:entry:123e4567-e89b-42d3-a456-426614174073",
      "historical-correction:fixture-fuel-amount-fix",
    ]));
    expect(ids).toEqual(expect.arrayContaining([
      "compliance-overlap-review:123e4567-e89b-42d3-a456-426614174060",
      "compliance-overlap-review-head:" + encodeURIComponent("feature:compliance:123e4567-e89b-42d3-a456-426614174010|feature:compliance:123e4567-e89b-42d3-a456-426614174011|2026-12-01|2026-12-31"),
      "historical-correction:compliance-fix-1",
      "historical-correction-chain:" + encodeURIComponent("feature:compliance:123e4567-e89b-42d3-a456-426614174010"),
    ]));
    expect(ids).toEqual(expect.arrayContaining([
      "feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174050",
      "historical-correction:maintenance-fix-1",
      "historical-correction:maintenance-fix-2",
      "historical-correction-chain:" + encodeURIComponent("feature:maintenance:expense:123e4567-e89b-42d3-a456-426614174050"),
    ]));
    expect(ids.some(id => id.startsWith("feature:driver-records:"))).toBe(true);
    expect(fixture.populatedGraph.work.eventIds).toHaveLength(3);
    expect(fixture.populatedGraph.logBook.events).toHaveLength(2);
  });

  it("runs the populated feature-record graph through production Browser export, restore and re-export", async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
    const unregister = [
      registerBusinessSettingsBrowserBackupParticipant(),
      registerVehicleBrowserBackupParticipant(),
      registerDriverRecordsBrowserBackupParticipant(),
      registerFinanceBrowserBackupParticipant(),
      registerComplianceBrowserBackupParticipant(),
      registerMaintenanceBrowserBackupParticipant(),
      registerBusinessExpensesBrowserBackupParticipant(),
      registerPerformanceBrowserBackupParticipant(),
    ];
    try {
      await browserDatabase.records.bulkPut(fixture.populatedGraph.records as never);

      // Exercise Work through its production command/repository boundary so the
      // same lifecycle snapshot includes durable intents, committed events and
      // outbox state rather than only feature-record envelopes.
      const workflow = new DexieDriverWorkflowRepository();
      const transitions = [
        { type: "shift_start" as const, id: "event-shift-start-001", at: "2026-11-01T04:45:00.000Z" },
        { type: "trip_start" as const, id: "event-trip-start-001", at: "2026-11-01T05:00:00.000Z" },
        { type: "trip_end" as const, id: "event-trip-end-001", at: "2026-11-01T05:30:00.000Z" },
      ];
      for (const transition of transitions) {
        const command = createDriverCommand(
          await workflow.getSnapshot(), transition.type, "pwa", transition.id, transition.at,
        );
        const gps: GpsFix = {
          latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8,
          fixAt: transition.at, provider: "browser-geolocation",
        };
        await workflow.queueIntent({
          command, status: "pending_location",
          createdAt: transition.at, updatedAt: transition.at,
        });
        await workflow.completeIntent(command.eventId, gps, transition.at);
      }
      const sourceEvents = await workflow.listEvents();
      rebuildTripHistoryProjection(sourceEvents);
      const expectedProjection = readTripHistoryProjection();

      const exported = await exportBrowserSnapshot("0.1.0");
      const canonical = toCanonicalBackupSnapshotV1(exported.data, exported.manifest as never);
      expect(canonical.format).toBe(fixture.canonicalSnapshotContract.format);
      for (const participantId of fixture.emptyParticipantIds) {
        expect(canonical.participants.map(item => item.id)).toContain(participantId);
        expect(canonical.records.filter(item => item.participantId === participantId)).toHaveLength(0);
      }
      const unknownOwner = JSON.parse(JSON.stringify(canonical)) as typeof canonical;
      unknownOwner.records[0].participantId = "unknown-participant";
      expect(() => fromCanonicalBackupSnapshotV1(unknownOwner, {
        applicationVersion: exported.manifest.applicationVersion,
        createdAt: exported.manifest.createdAt,
        businessTimezone: exported.manifest.businessTimezone,
      })).toThrow("backup_canonical_participant_unknown");
      const mismatchedOwner = JSON.parse(JSON.stringify(canonical)) as typeof canonical;
      const vehicleRecord = mismatchedOwner.records.find(item => item.id.startsWith("feature:vehicle:"))!;
      vehicleRecord.participantId = "platform-records";
      expect(() => fromCanonicalBackupSnapshotV1(mismatchedOwner, {
        applicationVersion: exported.manifest.applicationVersion,
        createdAt: exported.manifest.createdAt,
        businessTimezone: exported.manifest.businessTimezone,
      })).toThrow("backup_canonical_record_owner_mismatch");
      const missingEmptyParticipant = {
        ...canonical,
        participants: canonical.participants.filter(item => !fixture.emptyParticipantIds.includes(item.id)),
      };
      expect(() => fromCanonicalBackupSnapshotV1(missingEmptyParticipant, {
        applicationVersion: exported.manifest.applicationVersion,
        createdAt: exported.manifest.createdAt,
        businessTimezone: exported.manifest.businessTimezone,
      })).toThrow("backup_participant_manifest_mismatch");
      expect(canonical.records.length).toBeGreaterThan(fixture.populatedGraph.recordCount);
      const roundTrip = fromCanonicalBackupSnapshotV1(canonical, {
        applicationVersion: exported.manifest.applicationVersion,
        createdAt: exported.manifest.createdAt,
        businessTimezone: exported.manifest.businessTimezone,
      });
      expect(toCanonicalBackupSnapshotV1(roundTrip.data, roundTrip.manifest)).toEqual(canonical);
      const expectedIds = fixture.populatedGraph.records.map(record => record.id).sort();
      const byRecordId = (rows: Array<{ id: string }>) =>
        [...rows].sort((left, right) => left.id.localeCompare(right.id));
      expect(byRecordId(exported.data.records as Array<{ id: string }>))
        .toEqual(byRecordId(fixture.populatedGraph.records));
      expect(exported.data.records.map(record => (record as { id: string }).id).sort())
        .toEqual(expectedIds);
      expect([...exported.data.driverEvents]
        .sort((left: any, right: any) => left.command.transitionAt.localeCompare(right.command.transitionAt))
        .map((event: any) => event.eventId))
        .toEqual(transitions.map(transition => transition.id));
      expect(exported.data.driverIntents).toHaveLength(3);
      expect(exported.data.driverOutbox).toHaveLength(3);

      await browserDatabase.records.clear();
      const staleEmptyOwnerRecord = {
        id: "feature:business-settings:stale",
        schemaVersion: 1,
        createdAt: exported.manifest.createdAt,
        updatedAt: exported.manifest.createdAt,
        source: "integration" as const,
        revision: 1,
        data: { schemaVersion: 1, stale: true },
      };
      await browserDatabase.records.put(staleEmptyOwnerRecord as never);
      const restored = await restoreBrowserSnapshot({
        data: exported.data,
        manifest: exported.manifest as never,
        confirmed: true,
      });
      await markBrowserRestoreVerified(restored.checkpointId);
      expect(await browserDatabase.records.get("feature:business-settings:stale")).toBeUndefined();
      browserDatabase.close();
      await browserDatabase.open();
      // Startup recovery must leave a verified restore intact; an unverified
      // restore is separately covered by the interrupted-recovery suite.
      await expect(recoverBrowserRestoreTransactions()).resolves.toEqual({ recovered: 0 });
      const reopenedWorkflow = new DexieDriverWorkflowRepository();
      const restoredEvents = await reopenedWorkflow.listEvents();
      expect([...restoredEvents]
        .sort((left, right) => left.command.transitionAt.localeCompare(right.command.transitionAt))
        .map(event => event.eventId))
        .toEqual(transitions.map(transition => transition.id));
      rebuildTripHistoryProjection(restoredEvents);
      expect(readTripHistoryProjection()).toEqual(expectedProjection);

      const reopenedExport = await exportBrowserSnapshot("0.1.0");
      expect(reopenedExport.data.records.map(record => (record as { id: string }).id).sort())
        .toEqual(expectedIds);
      expect(reopenedExport.data).toEqual(exported.data);
      await discardVerifiedBrowserCheckpoint(restored.checkpointId);
    } finally {
      unregister.reverse().forEach(dispose => dispose());
      browserDatabase.close();
      await browserDatabase.delete();
    }
  });

});
