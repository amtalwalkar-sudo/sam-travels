import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import {
  createInitialFeatureLifecycleStates,
  transitionFeatureLifecycle,
  type FeatureLifecycleAction,
  type FeatureLifecycleRecord,
} from "../../core/src/feature-lifecycle";
import type { FeatureDefinition, FeatureId } from "../../core/src/features";

const LIFECYCLE_RECORD_ID = "platform:feature-lifecycle";
const LIFECYCLE_RECORD_SCHEMA = 1;
const MAX_COMPARE_AND_SET_ATTEMPTS = 8;

type LifecyclePayload = {
  contractVersion: 1;
  states: FeatureLifecycleRecord[];
};

function decodeStates(
  record: RecordEnvelope<LifecyclePayload> | undefined,
  features: ReadonlyMap<FeatureId, FeatureDefinition>,
): ReadonlyMap<FeatureId, FeatureLifecycleRecord> {
  if (!record) return createInitialFeatureLifecycleStates(features);
  if (record.schemaVersion !== LIFECYCLE_RECORD_SCHEMA ||
      record.data?.contractVersion !== 1 || !Array.isArray(record.data.states)) {
    throw new Error("feature_lifecycle_persistence_contract_invalid");
  }
  const states = new Map<FeatureId, FeatureLifecycleRecord>();
  for (const state of record.data.states) {
    if (!state || typeof state.featureId !== "string" || states.has(state.featureId)) {
      throw new Error("feature_lifecycle_persistence_duplicate_or_invalid_state");
    }
    states.set(state.featureId, state);
  }
  for (const featureId of features.keys()) {
    const state = states.get(featureId);
    if (!state) continue; // New features are initialized by the policy's enabled default.
    if (state.contractVersion !== features.get(featureId)!.contractVersion) {
      throw new Error("Stale feature lifecycle contract: " + featureId);
    }
  }
  return states;
}

function encodeStates(states: ReadonlyMap<FeatureId, FeatureLifecycleRecord>): FeatureLifecycleRecord[] {
  return [...states.values()].sort((a, b) => a.featureId.localeCompare(b.featureId));
}

/**
 * Authoritative application coordinator. A single revisioned record stores the
 * complete lifecycle map; compare-and-set makes validation + replacement safe
 * against concurrent tabs and native callers. No feature data or backup
 * participant registration is modified by lifecycle transitions.
 */
export class FeatureLifecycleCoordinator {
  constructor(
    private readonly repository: AtomicRecordRepository,
    private readonly features: ReadonlyMap<FeatureId, FeatureDefinition>,
  ) {}

  async list(): Promise<ReadonlyMap<FeatureId, FeatureLifecycleRecord>> {
    const stored = await this.repository.get<LifecyclePayload>(LIFECYCLE_RECORD_ID);
    return decodeStates(stored, this.features);
  }

  async transition(featureId: FeatureId, action: FeatureLifecycleAction): Promise<FeatureLifecycleRecord> {
    for (let attempt = 0; attempt < MAX_COMPARE_AND_SET_ATTEMPTS; attempt += 1) {
      const stored = await this.repository.get<LifecyclePayload>(LIFECYCLE_RECORD_ID);
      const states = decodeStates(stored, this.features);
      const nextState = transitionFeatureLifecycle(featureId, action, {
        features: this.features,
        states,
      });
      const nextStates = new Map(states);
      nextStates.set(featureId, nextState);
      const now = new Date().toISOString();
      const next: RecordEnvelope<LifecyclePayload> = {
        id: LIFECYCLE_RECORD_ID,
        schemaVersion: LIFECYCLE_RECORD_SCHEMA,
        createdAt: stored?.createdAt ?? now,
        updatedAt: now,
        source: "integration",
        revision: (stored?.revision ?? 0) + 1,
        data: { contractVersion: 1, states: encodeStates(nextStates) },
      };
      const committed = await this.repository.compareAndSet(
        LIFECYCLE_RECORD_ID,
        stored?.revision ?? null,
        next,
      );
      if (committed) return nextState;
    }
    throw new Error("feature_lifecycle_concurrent_update_retry_exhausted");
  }
}
