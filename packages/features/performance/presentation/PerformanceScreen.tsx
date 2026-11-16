import { useState, type FormEvent } from "react";
import type { PerformanceCalculationServiceV1 } from "../../../application/src/performance-calculation-service";
import type { PerformanceCalculationResultV1, PerformanceCostKindV1 } from "../../../domain/src/performance-calculation-v1";
import "./performance-screen.css";

type PerformanceScreenContext = Readonly<{
  calculation: Pick<PerformanceCalculationServiceV1, "calculate">;
}>;

const CATEGORY_LABELS: Readonly<Record<PerformanceCostKindV1, string>> = {
  fuel: "Fuel",
  maintenance: "Maintenance",
  emi: "Loan EMI",
  compliance: "Compliance",
  "platform-fee": "Platform fees",
  "traffic-challan": "Traffic challans",
  "toll-parking": "Tolls & parking",
  miscellaneous: "Miscellaneous",
  "pre-business-manual-recovery": "Pre-business cost recovery",
  "pre-business-emi-recovery": "Pre-business EMI recovery",
  "pre-business-compliance-recovery": "Pre-business compliance recovery",
};

function localDateOffset(days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).split("-");
  const [year, month, day] = parts.map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}
function money(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR",
    minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100);
}
function signedMoney(paise: number): string {
  return (paise > 0 ? "+" : paise < 0 ? "−" : "") + money(Math.abs(paise));
}
function aggregateCosts(result: PerformanceCalculationResultV1) {
  const totals = Object.keys(CATEGORY_LABELS).reduce((map, key) => {
    map[key as PerformanceCostKindV1] = 0; return map;
  }, {} as Record<PerformanceCostKindV1, number>);
  for (const row of result.daily) {
    for (const key of Object.keys(CATEGORY_LABELS) as PerformanceCostKindV1[]) {
      totals[key] += row.costs[key];
    }
  }
  return (Object.keys(CATEGORY_LABELS) as PerformanceCostKindV1[])
    .map(key => ({ key, label: CATEGORY_LABELS[key], amount: totals[key] }))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}
function monthlyTotals(result: PerformanceCalculationResultV1) {
  const totals = new Map<string, { revenue: number; cost: number; profit: number }>();
  for (const row of result.daily) {
    const month = row.date.slice(0, 7);
    const item = totals.get(month) ?? { revenue: 0, cost: 0, profit: 0 };
    item.revenue += row.grossRevenuePaise; item.cost += row.totalCostPaise; item.profit += row.profitPaise;
    totals.set(month, item);
  }
  return [...totals].map(([month, item]) => ({ month, ...item }));
}

export function PerformanceScreen({ context }: { context: PerformanceScreenContext }) {
  const [from, setFrom] = useState(localDateOffset(29));
  const [to, setTo] = useState(localDateOffset(0));
  const [result, setResult] = useState<PerformanceCalculationResultV1>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<"daily" | "monthly" | "recovery">("daily");

  async function calculate(event?: FormEvent) {
    event?.preventDefault();
    if (!from || !to || from > to) return;
    setLoading(true); setError("");
    try { setResult(await context.calculation.calculate(from, to)); }
    catch (reason) {
      setResult(undefined);
      setError(reason instanceof Error ? reason.message : "Performance calculation failed.");
    } finally { setLoading(false); }
  }

  const categories = result ? aggregateCosts(result) : [];
  const months = result ? monthlyTotals(result) : [];
  const incomplete = result?.provenance.completeness.filter(item => item.status !== "complete") ?? [];

  return <section className="performance-dashboard" aria-labelledby="performance-dashboard-title">
    <header className="performance-dashboard-heading">
      <div><small>BUSINESS HEALTH · CONTRACT V1</small><h2 id="performance-dashboard-title">Performance overview</h2>
        <p>Verified revenue and eligible costs, calculated from your actual business start date.</p></div>
      <span className="performance-version">Calculation v{result?.calculationVersion ?? 1}</span>
    </header>

    <form className="performance-period-form" onSubmit={calculate}>
      <label>Period from<input type="date" required value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
      <label>Period to<input type="date" required value={to} min={from} onChange={event => setTo(event.target.value)} /></label>
      <button className="primary-action" type="submit" disabled={loading || !from || !to || from > to}>
        {loading ? "Calculating…" : "Refresh performance"}
      </button>
    </form>
    {error && <p className="performance-error" role="alert">{error}</p>}
    {!result && !loading && !error && <div className="performance-empty">
      <strong>Ready to calculate</strong><p>Choose the reporting period and refresh to load the Performance figures.</p>
    </div>}
    {loading && <p className="performance-loading" role="status">Calculating from verified records…</p>}

    {result && <>
      <div className="performance-meta"><span>Business started <strong>{result.businessStartDate}</strong></span>
        <span>Selected period <strong>{result.periodFrom} — {result.periodTo}</strong></span>
        <span>Operational days <strong>{result.daily.length}</strong></span></div>

      <section className="performance-kpi-grid" aria-label="Selected period results">
        <article className="performance-kpi"><small>Period revenue</small><strong>{money(result.period.revenuePaise)}</strong><span>Verified fares + cancellation fees</span></article>
        <article className="performance-kpi"><small>Eligible period costs</small><strong>{money(result.period.costPaise)}</strong><span>Including recovery allocations</span></article>
        <article className="performance-kpi"><small>Period net position</small><strong className={result.period.profitPaise >= 0 ? "positive" : "negative"}>{signedMoney(result.period.profitPaise)}</strong><span>Revenue minus eligible costs</span></article>
        <article className="performance-kpi"><small>Monthly Driver Target</small><strong>{money(result.period.monthlyDriverTargetPaise)}</strong><span>Fixed monthly rupee target · not prorated</span></article>
      </section>

      <section className="performance-lifetime" aria-labelledby="performance-lifetime-title">
        <header><div><small>FROM BUSINESS START DATE THROUGH PERIOD END</small><h3 id="performance-lifetime-title">Lifetime breakeven & target position</h3></div>
          <span className={result.lifetime.targetPositionPaise >= 0 ? "performance-position positive" : "performance-position negative"}>{signedMoney(result.lifetime.targetPositionPaise)}</span></header>
        <div className="performance-lifetime-grid">
          <div><small>Lifetime revenue</small><strong>{money(result.lifetime.revenuePaise)}</strong></div>
          <div><small>Lifetime eligible costs</small><strong>{money(result.lifetime.costPaise)}</strong></div>
          <div><small>Lifetime net</small><strong className={result.lifetime.profitPaise >= 0 ? "positive" : "negative"}>{signedMoney(result.lifetime.profitPaise)}</strong></div>
          <div><small>Accumulated target</small><strong>{money(result.lifetime.targetPaise)}</strong></div>
          <div><small>Target months counted</small><strong>{result.lifetime.elapsedCalendarMonths}</strong></div>
        </div>
        <p className="performance-explainer">Target position is lifetime net profit minus the fixed monthly target multiplied by elapsed calendar months since business start (including the start and period-to months).</p>
      </section>

      <section className="performance-detail-panel">
        <div className="performance-tabs" role="tablist" aria-label="Performance detail views">
          <button type="button" role="tab" aria-selected={activeView === "daily"} className={activeView === "daily" ? "active" : ""} onClick={() => setActiveView("daily")}>Daily details</button>
          <button type="button" role="tab" aria-selected={activeView === "monthly"} className={activeView === "monthly" ? "active" : ""} onClick={() => setActiveView("monthly")}>Monthly roll-up</button>
          <button type="button" role="tab" aria-selected={activeView === "recovery"} className={activeView === "recovery" ? "active" : ""} onClick={() => setActiveView("recovery")}>Pre-business recovery</button>
        </div>
        {activeView === "daily" && <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>Operational date</th><th>Revenue</th><th>Costs</th><th>Net</th><th>Record status</th></tr></thead>
          <tbody>{result.daily.slice().reverse().map(row => <tr key={row.date}>
            <td>{row.date}</td><td>{money(row.grossRevenuePaise)}</td><td>{money(row.totalCostPaise)}</td>
            <td className={row.profitPaise >= 0 ? "positive" : "negative"}>{signedMoney(row.profitPaise)}</td>
            <td><span className={row.complete ? "performance-status complete" : "performance-status review"}>{row.complete ? "Complete" : "Review"}</span></td>
          </tr>)}</tbody>
        </table></div>}
        {activeView === "monthly" && <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>Month</th><th>Revenue</th><th>Eligible costs</th><th>Net</th></tr></thead>
          <tbody>{months.map(row => <tr key={row.month}><td>{row.month}</td><td>{money(row.revenue)}</td><td>{money(row.cost)}</td>
            <td className={row.profit >= 0 ? "positive" : "negative"}>{signedMoney(row.profit)}</td></tr>)}</tbody>
        </table></div>}
        {activeView === "recovery" && <div className="performance-recovery">
          <div className="performance-recovery-summary"><span>Recovery window <strong>{result.recovery.from} — {result.recovery.toExclusive} (exclusive)</strong></span>
            <span>Total eligible pre-business amounts <strong>{money(result.recovery.totalPaise)}</strong></span></div>
          <div className="performance-table-wrap"><table className="performance-table">
            <thead><tr><th>Source / note</th><th>Origin</th><th>Allocated daily</th><th>Source revision</th></tr></thead>
            <tbody>{result.recovery.daily.slice(-90).map((row, index) => <tr key={row.sourceId + ":" + row.date + ":" + index}>
              <td>{row.note}<small className="performance-subtext">{row.date}</small></td><td>{row.origin}</td>
              <td>{money(row.amountPaise)}</td><td>{row.sourceId} · r{row.revision}</td></tr>)}</tbody>
          </table></div><p className="performance-explainer">Showing at most the most recent 90 allocated recovery dates. The calculation window is exactly 18 months from business start.</p>
        </div>}
      </section>

      <section className="performance-category-panel" aria-labelledby="performance-cost-breakdown-title">
        <h3 id="performance-cost-breakdown-title">Selected period cost breakdown</h3>
        {categories.length === 0 ? <p>No verified costs were allocated to this period.</p> : <div className="performance-category-list">
          {categories.map(item => <div className="performance-category-row" key={item.key}><span>{item.label}</span><strong>{money(item.amount)}</strong></div>)}
        </div>}
      </section>

      <details className="performance-provenance"><summary>Calculation completeness & source provenance ({result.provenance.sourceRefs.length} source references)</summary>
        {incomplete.length === 0 ? <p>All supplied completeness checks are complete.</p> : <ul>{incomplete.map((item, index) =>
          <li key={item.source + ":" + index}><strong>{item.source}:</strong> {item.status}{item.detail ? " — " + item.detail : ""}</li>)}</ul>}
        <p>Calculation ID {result.calculationId} · version {result.calculationVersion}</p>
        <details><summary>Source IDs and revisions</summary><ul>{result.provenance.sourceRefs.map((ref, index) =>
          <li key={ref.sourceId + ":" + ref.revision + ":" + index}>{ref.sourceId} · revision {ref.revision}</li>)}</ul></details>
      </details>
    </>}
  </section>;
}
