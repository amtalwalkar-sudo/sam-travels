import { NetworkGateway, type PolicyRepository, type RecordRepository } from "../../../packages/core/src";
import { GeoapifyProxyReverseGeocoder, TimelineEnrichmentQueue } from "../../../packages/application/src";

/** Shared durable queue for Fuel Entry locality enrichment, using the platform record store. */
export function createBusinessExpenseEnrichmentQueue(repository: RecordRepository & PolicyRepository): TimelineEnrichmentQueue {
  return new TimelineEnrichmentQueue(
    repository, new NetworkGateway(repository), new GeoapifyProxyReverseGeocoder(),
  );
}
