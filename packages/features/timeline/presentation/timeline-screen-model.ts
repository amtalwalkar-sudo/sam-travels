import type { TimelineReadModel } from "../application/timeline-projection-service";
import type { TimelineLocationMap } from "../application/timeline-reverse-geocoding";

/** Stable presentation action contract for the replaceable Timeline screen. */
export type TimelineScreenContext = Readonly<{
  loadTimeline: (
    fromDate: string,
    toDate: string,
    allowLocationLookup: boolean,
    signal?: AbortSignal,
  ) => Promise<Readonly<{
    model: TimelineReadModel;
    locations: Promise<TimelineLocationMap>;
  }>>;
}>;
