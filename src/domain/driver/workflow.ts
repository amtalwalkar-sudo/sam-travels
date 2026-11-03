/**
 * Platform-neutral single-driver workflow transition planner.
 *
 * A planned transition is only an intent. Callers must durably persist the
 * intent before requesting one event-scoped GPS fix. The state changes only
 * when completeTransition receives compliant evidence and the caller commits
 * the resulting state + event atomically in the authoritative repository.
 */

export type DriverCommandType =
  | "START_SHIFT"
  | "END_SHIFT"
  | "START_RIDE"
  | "END_RIDE"
  | "CANCEL_RIDE";

export type DriverWorkflowState = {
  revision: number;
  shift: "OFF" | "ON";
  ride: "NONE" | "IN_PROGRESS";
  activeShiftStartedAt: string | null;
  activeRideStartedAt: string | null;
  lastEventId: string | null;
};

export type DriverTransitionCommand = {
  id: string;
  type: DriverCommandType;
  occurredAt: string;
  expectedRevision: number;
};

export type GpsEvidence = {
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number;
  fixTimestamp: string;
  policyVersion: "gps-event-fix-v1";
};

export type PendingDriverIntent = {
  command: DriverTransitionCommand;
  fromRevision: number;
  requiresGps: true;
  status: "PENDING_GPS";
};

export type TransitionError =
  | "INVALID_COMMAND"
  | "STALE_REVISION"
  | "INVALID_TRANSITION"
  | "DUPLICATE_COMMAND"
  | "GPS_REQUIRED"
  | "GPS_POLICY_MISMATCH"
  | "GPS_OUT_OF_RANGE"
  | "GPS_INACCURATE"
  | "GPS_STALE"
  | "INVALID_TIMESTAMP";

export type TransitionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: TransitionError };

export const initialDriverWorkflowState: DriverWorkflowState = {
  revision: 0,
  shift: "OFF",
  ride: "NONE",
  activeShiftStartedAt: null,
  activeRideStartedAt: null,
  lastEventId: null,
};

const GPS_MAX_ACCURACY_M = 50;
const GPS_MAX_AGE_MS = 30_000;

function validInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidCommand(command: DriverTransitionCommand): boolean {
  return Boolean(command.id.trim())
    && validInstant(command.occurredAt) !== null
    && Number.isInteger(command.expectedRevision)
    && command.expectedRevision >= 0;
}

/** Validate legal state transitions without changing the durable projection. */
export function planDriverTransition(
  state: DriverWorkflowState,
  command: DriverTransitionCommand,
): TransitionResult<PendingDriverIntent> {
  if (!command || !isValidCommand(command)) {
    return { ok: false, error: "INVALID_COMMAND" };
  }
  if (state.lastEventId === command.id) {
    return { ok: false, error: "DUPLICATE_COMMAND" };
  }
  if (command.expectedRevision !== state.revision) {
    return { ok: false, error: "STALE_REVISION" };
  }

  const legal =
    (command.type === "START_SHIFT" && state.shift === "OFF" && state.ride === "NONE")
    || (command.type === "END_SHIFT" && state.shift === "ON" && state.ride === "NONE")
    || (command.type === "START_RIDE" && state.shift === "ON" && state.ride === "NONE")
    || (command.type === "END_RIDE" && state.shift === "ON" && state.ride === "IN_PROGRESS")
    || (command.type === "CANCEL_RIDE" && state.shift === "ON" && state.ride === "IN_PROGRESS");

  if (!legal) return { ok: false, error: "INVALID_TRANSITION" };

  return {
    ok: true,
    value: {
      command,
      fromRevision: state.revision,
      requiresGps: true,
      status: "PENDING_GPS",
    },
  };
}

/**
 * Complete a previously persisted intent. The caller must atomically commit
 * this projection and its immutable event record in Room/IndexedDB.
 */
export function completeDriverTransition(
  state: DriverWorkflowState,
  intent: PendingDriverIntent,
  evidence: GpsEvidence | null,
): TransitionResult<DriverWorkflowState> {
  if (!evidence) return { ok: false, error: "GPS_REQUIRED" };
  if (intent.fromRevision !== state.revision
      || intent.command.expectedRevision !== state.revision) {
    return { ok: false, error: "STALE_REVISION" };
  }
  if (state.lastEventId === intent.command.id) {
    return { ok: false, error: "DUPLICATE_COMMAND" };
  }
  if (evidence.policyVersion !== "gps-event-fix-v1") {
    return { ok: false, error: "GPS_POLICY_MISMATCH" };
  }
  if (!Number.isFinite(evidence.latitude) || !Number.isFinite(evidence.longitude)
      || evidence.latitude < -90 || evidence.latitude > 90
      || evidence.longitude < -180 || evidence.longitude > 180) {
    return { ok: false, error: "GPS_OUT_OF_RANGE" };
  }
  if (!Number.isFinite(evidence.horizontalAccuracyM)
      || evidence.horizontalAccuracyM < 0
      || evidence.horizontalAccuracyM > GPS_MAX_ACCURACY_M) {
    return { ok: false, error: "GPS_INACCURATE" };
  }

  const occurredAt = validInstant(intent.command.occurredAt);
  const fixAt = validInstant(evidence.fixTimestamp);
  if (occurredAt === null || fixAt === null) {
    return { ok: false, error: "INVALID_TIMESTAMP" };
  }
  if (Math.abs(fixAt - occurredAt) > GPS_MAX_AGE_MS) {
    return { ok: false, error: "GPS_STALE" };
  }

  const next: DriverWorkflowState = {
    ...state,
    revision: state.revision + 1,
    lastEventId: intent.command.id,
  };

  switch (intent.command.type) {
    case "START_SHIFT":
      next.shift = "ON";
      next.activeShiftStartedAt = intent.command.occurredAt;
      break;
    case "END_SHIFT":
      next.shift = "OFF";
      next.activeShiftStartedAt = null;
      break;
    case "START_RIDE":
      next.ride = "IN_PROGRESS";
      next.activeRideStartedAt = intent.command.occurredAt;
      break;
    case "END_RIDE":
    case "CANCEL_RIDE":
      next.ride = "NONE";
      next.activeRideStartedAt = null;
      break;
  }

  return { ok: true, value: next };
}
