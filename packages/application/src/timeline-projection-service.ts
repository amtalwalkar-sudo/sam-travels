import {
  buildTimelineProjection,
  type TimelineFinancialRecord,
  type TimelineOdometerReading,
  type TimelinePickupInterval,
  type TimelineProjection,
  type TimelineSourceSnapshot,
} from "../../domain/src/timeline";
import type { DriverEvent } from "../../domain/src/driver-workflow";

export type TimelineReadModel = Readonly<{
  events: DriverEvent[];
  projection: TimelineProjection;
}>;

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

  async read(asOf?: string): Promise<TimelineReadModel> {
    const [events, pickupIntervals, financial, odometer] = await Promise.all([
      this.events.listEvents(),
      this.evidence?.listPickupIntervals?.(),
      this.evidence?.listFinancialRecords?.(),
      this.evidence?.listOdometerReadings?.(),
    ]);
    return {
      events,
      projection: buildTimelineProjection({ events, asOf, pickupIntervals, financial, odometer }),
    };
  }

  async project(asOf?: string): Promise<TimelineProjection> {
    return (await this.read(asOf)).projection;
  }
}
