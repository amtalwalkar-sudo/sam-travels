import { useState } from "react";
import type { FullCostBreakevenService } from "../../../../packages/application/src";
import type { BreakevenPeriodResultV1 } from "../../../../packages/domain/src/full-cost-breakeven";

function dateOffset(days: number): string {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [year, month, dayOfMonth] = local.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth - days)).toISOString().slice(0, 10);
}
function rupees(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Temporary isolated sanity-check surface; it does not alter the Performance shell or metrics UI. */
export function FullCostBreakevenPanel({ service }: { service: Pick<FullCostBreakevenService, "calculate"> }) {
  const [from, setFrom] = useState(dateOffset(29));
  const [to, setTo] = useState(dateOffset(0));
  const [result, setResult] = useState<BreakevenPeriodResultV1>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true); setError("");
    try {
      setResult(await service.calculate(from, to));
    } catch (reason) {
      setResult(undefined);
      setError(reason instanceof Error ? reason.message : "Breakeven calculation failed.");
    } finally { setLoading(false); }
  }

  return <section className="status-card breakeven-sanity-check" aria-labelledby="breakeven-title">
    <div className="status-heading">
      <div><small>TEMPORARY CALCULATION VALIDATION</small><h2 id="breakeven-title">Full-cost breakeven</h2></div>
      <span className="pill">V1</span>
    </div>
    <p>Read-only calculation from Finance, fuel-rate history, Maintenance, Compliance and business-expense records.</p>
    <div className="driver-actions">
      <label>From <input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
      <label>To <input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
      <button className="primary-action" disabled={loading || !from || !to || from > to}
        onClick={() => void calculate()}>{loading ? "Calculating…" : "Calculate"}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {result && <>
      <div className="status-foot">
        <strong>Total cost: {rupees(result.totalCostPaise)}</strong>
        <span>{result.from} to {result.to}</span>
      </div>
      <p>Calculation {result.calculationId} · version {result.calculationVersion}</p>
      {result.provenance.completeness.map(item => <p key={item.source}>
        <strong>{item.source}:</strong> {item.status}{item.detail ? " — " + item.detail : ""}
      </p>)}
      <h3>Period reconciliation</h3>
      <p>Daily {result.daily.length} days · Weekly {result.weekly.length} weeks · Monthly {result.monthly.length} months · Yearly {result.yearly.length} years</p>
      <div className="pending-list">
        <strong>Weekly totals</strong>
        {result.weekly.map(row => <div className="pending-row" key={row.week}><span>{row.week}</span><strong>{rupees(row.totalCostPaise)}</strong></div>)}
        <strong>Monthly totals</strong>
        {result.monthly.map(row => <div className="pending-row" key={row.month}><span>{row.month}</span><strong>{rupees(row.totalCostPaise)}</strong></div>)}
        <strong>Yearly totals</strong>
        {result.yearly.map(row => <div className="pending-row" key={row.year}><span>{row.year}</span><strong>{rupees(row.totalCostPaise)}</strong></div>)}
      </div>
      <div className="pending-list">
        {result.daily.slice(-14).map(row => <div className="pending-row" key={row.date}>
          <span>{row.date} · {row.businessKm} business km</span>
          <strong>{rupees(row.totalCostPaise)}</strong>
        </div>)}
      </div>
      <details><summary>Calculation provenance ({result.provenance.sourceIds.length} source records)</summary>
        <ul>{result.provenance.sourceRevisions.map((source, index) =>
          <li key={source.sourceId + ":" + index}>{source.sourceId} · revision {source.revision}
            {source.scheduleVersion ? " · schedule v" + source.scheduleVersion : ""}</li>)}</ul>
      </details>
    </>}
  </section>;
}
