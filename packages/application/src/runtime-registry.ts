import {
  dispatchFeatureIntegration,
  initializeRuntimeRegistry,
  type FeatureIntegrationContract,
  type FeatureIntegrationHandler,
  type RuntimeContractDefinitions,
  type RuntimeRegistry,
} from "../../core/src/index";

/** Pure registry factory for isolated tests and explicit application composition. */
export function createApplicationRuntimeRegistry(definitions: RuntimeContractDefinitions = {}): RuntimeRegistry {
  return initializeRuntimeRegistry(definitions);
}

let applicationRuntimeRegistry: RuntimeRegistry | undefined;

/** Initialize the one application-wide registry before mounting presentation. */
export function initializeApplicationRuntimeRegistry(definitions: RuntimeContractDefinitions = {}): RuntimeRegistry {
  if (applicationRuntimeRegistry) throw new Error("Application runtime registry is already initialized");
  applicationRuntimeRegistry = createApplicationRuntimeRegistry(definitions);
  return applicationRuntimeRegistry;
}

/** Retrieve the registry initialized by the outer application composition root. */
export function getApplicationRuntimeRegistry(): RuntimeRegistry {
  if (!applicationRuntimeRegistry) throw new Error("Application runtime registry has not been initialized");
  return applicationRuntimeRegistry;
}

/** Coordinate a committed event through its registered public integration contract. */
export async function dispatchCommittedFeatureEvent<Payload extends { eventId: string; committedAt: string }>(
  registry: RuntimeRegistry,
  integration: FeatureIntegrationContract,
  event: Payload,
  consumer: FeatureIntegrationHandler<Payload>,
): Promise<void> {
  await dispatchFeatureIntegration(registry.integrations, {
    integrationId: integration.id,
    contractVersion: integration.version,
    eventName: integration.eventName,
    payloadVersion: integration.payloadVersion,
    eventId: event.eventId,
    occurredAt: event.committedAt,
    payload: event,
  }, { [integration.id]: consumer });
}
