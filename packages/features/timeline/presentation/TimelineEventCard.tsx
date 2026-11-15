export type TimelineEventCardModel = Readonly<{
  id: string;
  time: string;
  title: string;
  description: string;
  secondary?: string;
  location: string;
  kind: "shift" | "pickup" | "ride" | "cancelled" | "system" | "other";
}>;

export type TimelineEventCardProps = Readonly<{
  event: TimelineEventCardModel;
  onOpen: (eventId: string) => void;
}>;

/** One event renderer; stable source identity is the only interaction argument. */
export function TimelineEventCard({ event, onOpen }: TimelineEventCardProps) {
  return <button type="button" className={"timeline-event-card " + event.kind}
    onClick={() => onOpen(event.id)} aria-label={event.title + ", " + event.time + ". View details"}>
    <span className="timeline-card-time">{event.time}</span>
    <span className="timeline-card-body">
      <strong>{event.title}</strong>
      <small>{event.description}</small>
      {event.secondary && <small>{event.secondary}</small>}
      <small>{event.location}</small>
    </span>
    <span className="timeline-card-open" aria-hidden="true">›</span>
  </button>;
}
