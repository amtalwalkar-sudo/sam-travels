import type { DriverStateProjection, DriverTransitionCommand } from "../../core/src/commands";
import type { GpsFix } from "../../core/src/types";
import {
  isWithinGpsRecoveryWindow,
  validateDriverCommand,
  validateDriverCompletion,
  type DriverEvent,
  type DriverIntent,
} from "../../domain/src/driver-workflow";

export interface DriverWorkflowRepository {
  getSnapshot(): Promise<DriverStateProjection>;
  queueIntent(intent: DriverIntent): Promise<DriverIntent>;
  getIntent(eventId: string): Promise<DriverIntent | undefined>;
  reactivateIntent(eventId: string): Promise<DriverIntent>;
  listPending(): Promise<DriverIntent[]>;
  completeIntent(eventId: string, gps: GpsFix, now?: string): Promise<DriverStateProjection>;
  markNeedsAttention(eventId: string, reason: string): Promise<void>;
  listEvents(): Promise<DriverEvent[]>;
  subscribe(listener: (snapshot: DriverStateProjection) => void): () => void;
}

export interface EventLocationProvider {
  capture(): Promise<GpsFix>;
}

/** Consumer delivery is at-least-once; the immutable event log is the replay source. */
export type DriverEventPublisher = (event: DriverEvent) => Promise<void>;

export class DriverWorkflowService {
  private readonly pendingIntegrationEventIds = new Set<string>();
  private readonly deliveredIntegrationEventIds = new Set<string>();

  constructor(
    private readonly repository: DriverWorkflowRepository,
    private readonly location: EventLocationProvider,
    private readonly publishEvent?: DriverEventPublisher,
  ) {}

  snapshot() { return this.repository.getSnapshot(); }
  pending() { return this.repository.listPending(); }
  events() { return this.repository.listEvents(); }

  async reconcilePending(nowMs = Date.now()) {
    const pending = await this.repository.listPending();
    for (const intent of pending) {
      if (
        !isWithinGpsRecoveryWindow(intent.command.transitionAt, nowMs) &&
        !(intent.status === "needs_attention" && intent.reason === "gps_recovery_window_expired")
      ) {
        await this.repository.markNeedsAttention(intent.command.eventId, "gps_recovery_window_expired");
      }
    }
    return this.repository.listPending();
  }

  subscribe(listener: (snapshot: DriverStateProjection) => void) {
    return this.repository.subscribe(listener);
  }

  /** Replay committed events on startup so a process death cannot lose integration delivery. */
  async replayCommittedEvents(): Promise<{ delivered: number; pending: number }> {
    if (!this.publishEvent) return { delivered: 0, pending: 0 };
    const events = await this.repository.listEvents();
    let delivered = 0;
    for (const event of events) {
      if (this.deliveredIntegrationEventIds.has(event.eventId)) continue;
      if (await this.publishCommittedEvent(event)) delivered += 1;
    }
    return { delivered, pending: this.pendingIntegrationEventIds.size };
  }

  /** Retry only failed deliveries; successful event consumers need not be replayed on every poll. */
  async retryPendingIntegrations(): Promise<{ delivered: number; pending: number }> {
    if (!this.publishEvent || this.pendingIntegrationEventIds.size === 0) {
      return { delivered: 0, pending: this.pendingIntegrationEventIds.size };
    }
    const pendingIds = [...this.pendingIntegrationEventIds];
    const events = await this.repository.listEvents();
    let delivered = 0;
    for (const eventId of pendingIds) {
      const event = events.find((candidate) => candidate.eventId === eventId);
      if (event && await this.publishCommittedEvent(event)) delivered += 1;
    }
    return { delivered, pending: this.pendingIntegrationEventIds.size };
  }

  private async publishCommittedEvent(event: DriverEvent): Promise<boolean> {
    if (!this.publishEvent || this.deliveredIntegrationEventIds.has(event.eventId)) return true;
    try {
      await this.publishEvent(event);
      this.pendingIntegrationEventIds.delete(event.eventId);
      this.deliveredIntegrationEventIds.add(event.eventId);
      return true;
    } catch {
      // The source event is already durable. Keep its ID for retry and never
      // misclassify an integration failure as a failed GPS/business transition.
      this.pendingIntegrationEventIds.add(event.eventId);
      return false;
    }
  }

  private async publishById(eventId: string): Promise<boolean> {
    if (!this.publishEvent) return true;
    const event = (await this.repository.listEvents()).find((candidate) => candidate.eventId === eventId);
    if (!event) {
      this.pendingIntegrationEventIds.add(eventId);
      return false;
    }
    return this.publishCommittedEvent(event);
  }

  async retry(eventId: string): Promise<{
    status: "recorded" | "needs_attention";
    snapshot: DriverStateProjection;
    reason?: string;
    integrationPending?: boolean;
  }> {
    const existing = await this.repository.getIntent(eventId);
    if (!existing) throw new Error("intent_missing");
    if (existing.status === "recorded") {
      const integrationPending = !(await this.publishById(eventId));
      return {
        status: "recorded",
        snapshot: await this.snapshot(),
        integrationPending,
      };
    }
    if (!isWithinGpsRecoveryWindow(existing.command.transitionAt)) {
      const reason = "gps_recovery_window_expired";
      await this.repository.markNeedsAttention(eventId, reason);
      return { status: "needs_attention", snapshot: await this.snapshot(), reason };
    }

    const intent = await this.repository.reactivateIntent(eventId);
    let snapshot: DriverStateProjection;
    try {
      const gps = await this.location.capture();
      const current = await this.snapshot();
      const plan = validateDriverCompletion(current, intent, gps);
      if (!plan.ok) throw new Error(plan.error);
      snapshot = await this.repository.completeIntent(eventId, gps);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "location_unavailable";
      await this.repository.markNeedsAttention(eventId, reason);
      return { status: "needs_attention", snapshot: await this.snapshot(), reason };
    }

    const integrationPending = !(await this.publishById(eventId));
    return { status: "recorded", snapshot, integrationPending };
  }

  async dispatch(command: DriverTransitionCommand): Promise<{
    status: "pending_location" | "recorded" | "needs_attention";
    snapshot: DriverStateProjection;
    reason?: string;
    integrationPending?: boolean;
  }> {
    const checked = validateDriverCommand(command);
    if (!checked.ok) throw new Error(checked.error);
    const before = await this.repository.getSnapshot();
    if (command.expectedRevision !== before.revision || command.expectedPriorState !== before.state) {
      throw new Error("stale_revision");
    }

    const now = new Date().toISOString();
    const intent: DriverIntent = { command, status: "pending_location", createdAt: now, updatedAt: now };
    const queued = await this.repository.queueIntent(intent);
    if (queued.status === "recorded") {
      const integrationPending = !(await this.publishById(command.eventId));
      return { status: "recorded", snapshot: await this.snapshot(), integrationPending };
    }

    let snapshot: DriverStateProjection;
    try {
      const gps = await this.location.capture();
      const latest = await this.snapshot();
      const plan = validateDriverCompletion(latest, queued, gps);
      if (!plan.ok) throw new Error(plan.error);
      snapshot = await this.repository.completeIntent(command.eventId, gps);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "location_unavailable";
      await this.repository.markNeedsAttention(command.eventId, reason);
      return { status: "needs_attention", snapshot: await this.snapshot(), reason };
    }

    const integrationPending = !(await this.publishById(command.eventId));
    return { status: "recorded", snapshot, integrationPending };
  }
}

export function createDriverCommand(
  snapshot: DriverStateProjection,
  eventType: DriverTransitionCommand["eventType"],
  originSurface: DriverTransitionCommand["originSurface"],
  id: string,
  now = new Date().toISOString(),
): DriverTransitionCommand {
  return {
    schemaVersion: 1,
    commandId: id,
    eventId: id,
    eventType,
    originSurface,
    transitionAt: now,
    expectedPriorState: snapshot.state,
    expectedRevision: snapshot.revision,
    idempotencyKey: id,
  };
}

/** Versioned command constructor for the distinct pickup/ride lifecycle. */
export function createDriverCommandV2(
 snapshot:DriverStateProjection,eventType:DriverTransitionCommand["eventType"],
 originSurface:DriverTransitionCommand["originSurface"],id:string,now=new Date().toISOString(),
):DriverTransitionCommand {
 if(!["shift_start","shift_end","trip_create","start_ride","end_ride","cancel_ride"].includes(eventType))throw new Error("invalid_lifecycle_v2_event");
 return {schemaVersion:1,workflowVersion:2,commandId:id,eventId:id,eventType,originSurface,transitionAt:now,
  expectedPriorState:snapshot.state,expectedRevision:snapshot.revision,idempotencyKey:id};
}
