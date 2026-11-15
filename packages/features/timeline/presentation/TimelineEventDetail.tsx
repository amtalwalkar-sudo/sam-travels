import { useEffect, useRef, type KeyboardEvent } from "react";

export type TimelineEventDetailModel = Readonly<{
  title: string;
  category: string;
  status: string;
  time: string;
  duration: string;
  location: string;
  evidence: string;
  fare: string;
}>;

export type TimelineEventDetailProps = Readonly<{
  event: TimelineEventDetailModel | null;
  onClose: () => void;
}>;

/** Read-only detail layer. It receives display values only, never source records or services. */
export function TimelineEventDetail({ event, onClose }: TimelineEventDetailProps) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { if (event) panel.current?.focus(); }, [event]);
  if (!event) return null;
  const handleKeyDown = (keyEvent: KeyboardEvent<HTMLElement>) => {
    if (keyEvent.key === "Escape") {
      keyEvent.preventDefault();
      onClose();
    }
  };
  return <div className="timeline-detail-backdrop" role="presentation" onMouseDown={e => {
    if (e.target === e.currentTarget) onClose();
  }}>
    <section ref={panel} className="timeline-detail-panel" role="dialog" aria-modal="true"
      aria-labelledby="timeline-detail-title" tabIndex={-1} onKeyDown={handleKeyDown}>
      <header className="timeline-detail-header">
        <div><small>{event.category}</small><h3 id="timeline-detail-title">{event.title}</h3></div>
        <button type="button" onClick={onClose} aria-label="Close event details">×</button>
      </header>
      <span className="timeline-detail-status">{event.status}</span>
      <dl>
        <div><dt>Time</dt><dd>{event.time}</dd></div>
        <div><dt>Duration</dt><dd>{event.duration}</dd></div>
        <div><dt>Location</dt><dd>{event.location}</dd></div>
        <div><dt>Fare / fee</dt><dd>{event.fare}</dd></div>
        <div><dt>Location evidence</dt><dd>{event.evidence}</dd></div>
      </dl>
      <p>Read-only record details. Original shift and trip records remain with their owning features.</p>
      <button type="button" className="timeline-detail-close" onClick={onClose}>Back to activity</button>
    </section>
  </div>;
}
