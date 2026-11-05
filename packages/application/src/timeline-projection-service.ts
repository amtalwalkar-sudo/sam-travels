import {
  buildTimelineProjection,
  type TimelineFinancialRecord,
  type TimelineOdometerReading,
  type TimelinePickupInterval,
  type TimelineProjection,
  type TimelineSourceSnapshot,
} from "../domain/src/timeline";
import type { DriverEvent } from "../domain/src/driver-workflow";

/** Public application read port; platform adapters must return the owning event log. */
export interface TimelineEventSource {
  listEvents(): Promise<DriverEvent[]>;
}

/** Optional source-owned evidence ports. No adapter means an explicit unavailable metric. */
export interface TimelineEvidenceSource {
  listPickupIntervals?(): Promise<TimelineSourceSnapshot<TimelinePickupInterval>>;
  listFinancialRecords?(): Promise<TimelineSourceSnapshot<TimelineFinancialRecord>>;
  listOdometerReadings?(): Promise<TimelineSourceSnapshot<TimelineOdometerReading>>;
}

/**
 * Rebuild the same headless projection from whichever platform event source is
 * injected (PWA/IndexedDB or Android/Room). Projection state is never persisted.
 */
export class TimelineProjectionService {
  constructor(
    private readonly events: TimelineEventSource,
    private readonly evidence?: TimelineEvidenceSource,
  ) {}

  async project(asOf?: string): Promise<TimelineProjection> {
    const [events, pickupIntervals, financial, odometer] = await Promise.all([
      this.events.listEvents(),
      this.evidence?.listPickupIntervals?.(),
      this.evidence?.listFinancialRecords?.(),
      this.evidence?.listOdometerReadings?.(),
    ]);
    return buildTimelineProjection({ events, asOf, pickupIntervals, financial, odometer });
  }
}
