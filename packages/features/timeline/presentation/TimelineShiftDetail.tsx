import { useEffect, useRef, type KeyboardEvent } from "react";

export type TimelineShiftDetailModel = Readonly<{
  title: string;
  status: string;
  rows: readonly Readonly<{ label: string; value: string; status: string }>[];
}>;

export type TimelineShiftDetailProps = Readonly<{
  shift: TimelineShiftDetailModel | null;
  onClose: () => void;
}>;

/** Read-only shift detail. Its only input is a presentation snapshot of metric values/statuses. */
export function TimelineShiftDetail({ shift, onClose }: TimelineShiftDetailProps) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { if (shift) panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [shift]);
  if (!shift) return null;
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key === "Tab") {
      const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  return <div className="timeline-detail-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section ref={panel} className="timeline-detail-panel" role="dialog" aria-modal="true"
      aria-labelledby="timeline-shift-detail-title" tabIndex={-1} onKeyDown={handleKeyDown}>
      <header className="timeline-detail-header">
        <div><small>SHIFT DETAILS · READ ONLY</small><h3 id="timeline-shift-detail-title">{shift.title}</h3></div>
        <button type="button" onClick={onClose} aria-label="Close shift details">×</button>
      </header>
      <span className="timeline-detail-status">{shift.status}</span>
      <dl className="timeline-shift-detail-metrics">
        {shift.rows.map(row => <div key={row.label}>
          <dt>{row.label}</dt><dd>{row.value}</dd><small>{row.status}</small>
        </div>)}
      </dl>
      <p>These values are read-only projections. Pending, unavailable, invalid and not-applicable states are preserved as supplied.</p>
      <button type="button" className="timeline-detail-close" onClick={onClose}>Back to activity</button>
    </section>
  </div>;
}
