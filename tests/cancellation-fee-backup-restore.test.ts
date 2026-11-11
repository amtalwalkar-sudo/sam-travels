import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";

describe("cancellation fee backup and restore", () => {
  let unregisterVehicle: (() => void) | undefined;
  beforeEach(async () => {
    unregisterVehicle = registerVehicleBrowserBackupParticipant();
    await browserDatabase.delete();
    await browserDatabase.open();
  });
  afterEach(() => { unregisterVehicle?.(); unregisterVehicle = undefined; });

  it("restores the pending cancellation-fee obligation and its zero-valid working copy", async () => {
    const timestamp = "2026-11-10T04:00:00.000Z";
    const tripId = "cancelled-trip-1";
    const obligationId = `work:trip-financial-obligation:${tripId}`;
    const draftId = `__sam_travels_form_working_copy__:work.trip-cancellation-fee:${tripId}`;
    await browserDatabase.records.bulkPut([
      {
        id: obligationId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
        source: "web", revision: 1,
        data: { schemaVersion: 1, tripId, kind: "cancellation_fee", status: "pending",
          cancellationEventId: "cancel-event-1", createdAt: timestamp },
      },
      {
        id: draftId, schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp,
        source: "web", revision: 2,
        data: { formId: "work.trip-cancellation-fee", formVersion: 1, instanceId: tripId,
          revision: 1, status: "in_progress", values: { tripId, cancellationFeePaise: 0 },
          operationId: "cancel-fee-op-1", updatedAt: timestamp },
      },
    ]);
    const snapshot = await exportBrowserSnapshot("0.1.0");
    await browserDatabase.records.clear();
    await restoreBrowserSnapshot({ data: snapshot.data, manifest: snapshot.manifest, confirmed: true });

    expect((await browserDatabase.records.get(obligationId))?.data).toMatchObject({
      kind: "cancellation_fee", status: "pending", cancellationEventId: "cancel-event-1",
    });
    expect((await browserDatabase.records.get(draftId))?.data).toMatchObject({
      formId: "work.trip-cancellation-fee", status: "in_progress",
      values: { tripId, cancellationFeePaise: 0 },
    });
  });

});
