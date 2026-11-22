import { createDriverCommand } from "../../packages/features/work-shift";
import type { DexieDriverWorkflowRepository } from "../../packages/storage-browser/src/driver-workflow";

export async function seedSemanticBackupWorkFixture(workflow: DexieDriverWorkflowRepository, work: any) {
  const transitions = work.committedTransitions;
  for (const transition of transitions) {
    const command = createDriverCommand(await workflow.getSnapshot(), transition.type as never, "pwa", transition.id, transition.at);
    const gps = { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: transition.at, provider: "browser-geolocation" };
    await workflow.queueIntent({ command, status: "pending_location", createdAt: transition.at, updatedAt: transition.at });
    await workflow.completeIntent(command.eventId, gps, transition.at);
    if (work.outboxStates.find((item: any) => item.eventId === transition.id)?.delivered) await workflow.markEventDelivered(transition.id);
  }
  const replay = transitions[transitions.length - 1];
  await workflow.completeIntent(replay.id, { latitude: 19.076, longitude: 72.8777, horizontalAccuracyM: 8, fixAt: replay.at, provider: "browser-geolocation" }, replay.at);
  for (const scenario of work.intentStates.filter((item: any) => item.status !== "recorded")) {
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
  return transitions;
}
