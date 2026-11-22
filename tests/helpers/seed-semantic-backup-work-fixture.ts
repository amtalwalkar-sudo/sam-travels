import { createDriverCommand, createDriverCommandV2 } from "../../packages/features/work-shift";
import { createTripFinancialFormRuntimeV1 } from "../../packages/application/src/trip-financial-form-runtime";
import { browserDatabase } from "../../packages/storage-browser/src/database";
import type { AtomicRecordRepository } from "../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../packages/core/src/types";
import type { DexieDriverWorkflowRepository } from "../../packages/storage-browser/src/driver-workflow";

type SemanticBackupWorkFixture = {
  committedTransitions: Array<{
    type: string; id: string; at: string; workflowVersion?: 2;
    odometer?: { schemaVersion: 1; readingKm: number };
    driverContext?: { schemaVersion: 1; driverId: string; assignmentId: string; vehicleId: string };
    tripContext?: { schemaVersion: 1; shiftId: string; driverId: string; assignmentId: string; vehicleId: string; operationalDate: string };
  }>;
  outboxStates: Array<{ eventId: string; delivered: boolean }>;
  intentStates: Array<{ eventId: string; eventType: string; transitionAt: string; status: string; reason?: string }>;
  tripFinancial: {
    tripId: string; operationId: string; submittedAt: string;
    author: { personId: string; role: "driver" };
    values: { farePaise: number; tollPaise: number; tollPayer: "driver" | "customer"; parkingPaise: number; parkingPayer: "driver" | "customer" };
    draftEdits: Array<{ field: string; before: number; after: number }>;
  };
};

export async function seedSemanticBackupWorkFixture(workflow: DexieDriverWorkflowRepository, work: SemanticBackupWorkFixture) {
  const transitions = work.committedTransitions;
  for (const transition of transitions) {
    const snapshot = await workflow.getSnapshot();
    const command = transition.workflowVersion === 2
      ? {
          ...createDriverCommandV2(snapshot, transition.type as never, "pwa", transition.id, transition.at, transition.odometer),
          ...(transition.driverContext ? { driverContext: transition.driverContext } : {}),
          ...(transition.tripContext ? { tripContext: transition.tripContext } : {}),
        }
      : createDriverCommand(snapshot, transition.type as never, "pwa", transition.id, transition.at);
    const gps = { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: transition.at, provider: "browser-geolocation" };
    await workflow.queueIntent({ command, status: "pending_location", createdAt: transition.at, updatedAt: transition.at });
    await workflow.completeIntent(command.eventId, gps, transition.at);
    if (work.outboxStates.find(item => item.eventId === transition.id)?.delivered) await workflow.markEventDelivered(transition.id);
  }
  const replay = transitions[transitions.length - 1];
  await workflow.completeIntent(replay.id, { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: replay.at, provider: "browser-geolocation" }, replay.at);
  for (const scenario of work.intentStates.filter(item => item.status !== "recorded")) {
    const command = createDriverCommand(await workflow.getSnapshot(), scenario.eventType as never, "pwa", scenario.eventId, scenario.transitionAt);
    const intent = { command, status: "pending_location" as const, createdAt: scenario.transitionAt, updatedAt: scenario.transitionAt };
    await workflow.queueIntent(intent);
    await workflow.queueIntent(intent);
    if (scenario.status === "needs_attention") {
      await workflow.markNeedsAttention(scenario.eventId, scenario.reason ?? "gps_recovery_window_expired");
      await workflow.reactivateIntent(scenario.eventId);
      await workflow.markNeedsAttention(scenario.eventId, scenario.reason ?? "gps_recovery_window_expired");
    }
  }

  const financial = work.tripFinancial;
  const records: AtomicRecordRepository = {
    get: async <T>(id: string) => await browserDatabase.records.get(id) as RecordEnvelope<T> | undefined,
    put: async <T>(row: RecordEnvelope<T>) => { await browserDatabase.records.put(row as RecordEnvelope<unknown>); },
    list: async <T>() => await browserDatabase.records.toArray() as RecordEnvelope<T>[],
    remove: async (id: string) => { await browserDatabase.records.delete(id); },
    compareAndSet: async <T>(id: string, expectedRevision: number | null, next: RecordEnvelope<T>) =>
      browserDatabase.transaction("rw", browserDatabase.records, async () => {
        const current = await browserDatabase.records.get(id);
        if ((current?.revision ?? null) !== expectedRevision) return false;
        await browserDatabase.records.put(next as RecordEnvelope<unknown>);
        return true;
      }),
  };
  const tripFinancialForms = createTripFinancialFormRuntimeV1(records, "integration", async () => financial.author);
  await tripFinancialForms.openCompletedTripFinancialDraft(financial.tripId);
  const draftId = "__sam_travels_form_working_copy__:work.trip-completed-financials:" + financial.tripId;
  const draftRow = await browserDatabase.records.get(draftId);
  if (!draftRow) throw new Error("fixture_trip_financial_draft_missing");
  const draftData = draftRow.data as Record<string, unknown>;
  await browserDatabase.records.put({
    ...draftRow,
    data: { ...draftData, operationId: financial.operationId },
  });
  for (const edit of financial.draftEdits) {
    await tripFinancialForms.updateCompletedTripFinancialDraft(financial.tripId, edit.field, edit.before);
    await tripFinancialForms.updateCompletedTripFinancialDraft(financial.tripId, edit.field, edit.after);
  }
  for (const [field, value] of Object.entries(financial.values)) {
    if (!financial.draftEdits.some(edit => edit.field === field)) {
      await tripFinancialForms.updateCompletedTripFinancialDraft(financial.tripId, field, value);
    }
  }
  await tripFinancialForms.submitCompletedTripFinancialDraft(financial.tripId, financial.values);
  return transitions;
}
