import { TimelineEventCard, type TimelineEventCardModel } from "./TimelineEventCard";

export type TimelineShiftSectionProps = Readonly<{
  id: string;
  title: string;
  status: string;
  events: readonly TimelineEventCardModel[];
  onOpenEvent: (eventId: string) => void;
  summary?: React.ReactNode;
}>;

/** Logical shift boundary and sequence grouping, independent from event source ownership. */
export function TimelineShiftSection({ id, title, status, events, onOpenEvent, summary }: TimelineShiftSectionProps) {
  return <section className="timeline-shift-section" aria-labelledby={"timeline-shift-" + id}>
    <header><h3 id={"timeline-shift-" + id}>{title}</h3><span>{status}</span></header>
    <div className="timeline-shift-sequence">
      {events.map(event => <TimelineEventCard key={event.id} event={event} onOpen={onOpenEvent} />)}
    </div>
    {summary}
  </section>;
}
