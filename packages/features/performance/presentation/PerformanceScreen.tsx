import { useState, type FormEvent } from "react";
import type { BreakevenPeriodResultV1 } from "../../../domain/src/full-cost-breakeven";
import type { PerformanceCalculationResultV1, PerformanceCostKindV1 } from "../../../domain/src/performance-calculation-v1";
import type { PerformanceScreenContextV1 } from "./performance-screen-model";
import { PerformanceDistanceHistory } from "./PerformanceDistanceHistory";
import { aggregateCosts, CATEGORY_LABELS, INSIGHT_DEFINITIONS, money, monthlyTotals, offsetDate, operationalToday, signedMoney } from "./performance-screen-model";
import "./performance-screen.css";

export function PerformanceScreen({ context }: { context: PerformanceScreenContextV1 }) {
  const today = operationalToday();
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [rangePreset, setRangePreset] = useState<"today" | "week" | "month" | "custom" | "lifetime">("month");
  const [result, setResult] = useState<PerformanceCalculationResultV1>();
  const [distanceProjection, setDistanceProjection] = useState<BreakevenPeriodResultV1>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [distanceError, setDistanceError] = useState("");
  const [activeView, setActiveView] = useState<"daily" | "distance" | "monthly" | "passbook" | "recovery">("daily");
  const [selectedInsight, setSelectedInsight] = useState("lifetime-target-position");

  async function calculate(event?: FormEvent) {
    event?.preventDefault();
    if (!from || !to || from > to) return;
    setLoading(true); setError(""); setDistanceError("");
    try {
      const loaded = await context.loadPeriod(from, to);
      setResult(loaded.result);
      setDistanceProjection(loaded.distanceProjection);
      setDistanceError(loaded.distanceError ?? "");
    }
    catch (reason) {
      setResult(undefined); setDistanceProjection(undefined);
      setError(reason instanceof Error ? reason.message : "Performance calculation failed.");
    } finally { setLoading(false); }
  }


  const categories = result ? aggregateCosts(result) : [];
  const months = result ? monthlyTotals(result) : [];
  const incomplete = result?.provenance.completeness.filter(item => item.status !== "complete") ?? [];
  const distanceSummary = distanceProjection?.distanceSummary;
  const businessKm = distanceSummary?.totalBusinessKm ??
    distanceProjection?.daily.reduce((sum, row) => sum + row.businessKm, 0) ?? 0;
  const fuelCostPaise = categories.find(item => item.key === "fuel")?.amount ?? 0;
  const fuelCostPerBusinessKmPaise = businessKm > 0 ? fuelCostPaise / businessKm : undefined;
  const currentOperationalDate = operationalToday();
  const isMonthToDateSelected = !!result && from === currentOperationalDate.slice(0, 7) + "-01" && to === currentOperationalDate;
  const monthToDateAchievementPercent = isMonthToDateSelected && result.period.targetPaise > 0
    ? Math.round(result.period.profitPaise / result.period.targetPaise * 100)
    : undefined;
  const insight = INSIGHT_DEFINITIONS[selectedInsight] ?? {
    label: selectedInsight.startsWith("cost-kind:") ? CATEGORY_LABELS[selectedInsight.slice(9) as PerformanceCostKindV1] ?? "Cost category" : "Performance figure",
    formula: selectedInsight.startsWith("cost-kind:")
      ? "This category total is the sum of verified daily amounts for this cost kind over the selected period."
      : "The figure is calculated from the selected period's verified and allocated source records.",
  };;

  return <section className="performance-dashboard" aria-labelledby="performance-dashboard-title">
    <header className="performance-dashboard-heading">
      <div><small>BUSINESS HEALTH · CONTRACT V1</small><h2 id="performance-dashboard-title">Performance overview</h2>
        <p>Start with the business story, then explore costs and source details. Figures use verified records from your actual business start date.</p></div>
      <span className="performance-version">Calculation v{result?.calculationVersion ?? 1}</span>
    </header>

    <div className="performance-range-presets" role="group" aria-label="Performance date range presets">
      <button type="button" className={rangePreset === "today" ? "active" : ""} onClick={() => { setFrom(today); setTo(today); setRangePreset("today"); }}>Today</button>
      <button type="button" className={rangePreset === "week" ? "active" : ""} onClick={() => { const weekday = new Date(today + "T00:00:00Z").getUTCDay(); const daysFromMonday = (weekday + 6) % 7; setFrom(offsetDate(today, -daysFromMonday)); setTo(today); setRangePreset("week"); }}>This week</button>
      <button type="button" className={rangePreset === "month" ? "active" : ""} onClick={() => { setFrom(today.slice(0, 7) + "-01"); setTo(today); setRangePreset("month"); }}>This month</button>
      <button type="button" className={rangePreset === "custom" ? "active" : ""} onClick={() => setRangePreset("custom")}>Custom</button>
      <button type="button" className={rangePreset === "lifetime" ? "active" : ""} disabled={!result} onClick={() => { if (result) { setFrom(result.businessStartDate); setTo(today); setRangePreset("lifetime"); } }}>Lifetime</button>
    </div>
    <form className="performance-period-form" onSubmit={calculate}>
      <label>Period from<input type="date" required value={from} max={to} onChange={event => { setFrom(event.target.value); setRangePreset("custom"); }} /></label>
      <label>Period to<input type="date" required value={to} min={from} onChange={event => { setTo(event.target.value); setRangePreset("custom"); }} /></label>
      <button className="primary-action" type="submit" disabled={loading || !from || !to || from > to}
        onClick={event => { event.preventDefault(); void calculate(); }}>
        {loading ? "Calculating…" : "Refresh performance"}
      </button>
    </form>
    {error && <p className="performance-error" role="alert">{error}</p>}
    {distanceError && <p className="performance-loading" role="status">Distance and fuel-per-km metrics unavailable: {distanceError}</p>}
    {!result && !loading && !error && <div className="performance-empty">
      <strong>Ready to calculate</strong><p>Choose the reporting period and refresh to load the Performance figures.</p>
    </div>}
    {loading && <p className="performance-loading" role="status">Calculating from verified records…</p>}

    {result && <>
      <div className="performance-meta"><span>Business started <strong>{result.businessStartDate}</strong></span>
        <span>Selected period <strong>{result.periodFrom} — {result.periodTo}</strong></span>
        <span>Operational days <strong>{result.daily.length}</strong></span>
        <a className={incomplete.length > 0 ? "performance-completeness-banner review" : "performance-completeness-banner complete"} href="#performance-provenance">
          {incomplete.length > 0 ? "Provisional · " + incomplete.length + " source checks need review" : "Completeness checks passed"}
        </a></div>

      <section className="performance-kpi-grid" aria-label="Selected period results">
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Period revenue" onClick={() => setSelectedInsight("period-revenue")}><small>Period revenue</small><strong>{money(result.period.revenuePaise)}</strong><span>Verified fares + cancellation fees</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Eligible period costs" onClick={() => setSelectedInsight("period-cost")}><small>Eligible period costs</small><strong>{money(result.period.costPaise)}</strong><span>Including recovery allocations</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Period net position" onClick={() => setSelectedInsight("period-net")}><small>Period net position</small><strong className={result.period.profitPaise >= 0 ? "positive" : "negative"}>{signedMoney(result.period.profitPaise)}</strong><span>Revenue minus eligible costs</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain selected-period Driver Target" onClick={() => setSelectedInsight("monthly-target")}><small>Target for selected period</small><strong>{money(result.period.targetPaise)}</strong><span>Configured monthly surplus target, prorated by calendar days</span>
          {isMonthToDateSelected ? <span>Month-to-date net: {signedMoney(result.period.profitPaise)}{monthToDateAchievementPercent === undefined ? "" : " · " + monthToDateAchievementPercent + "% of target"}</span>
            : <span>Select This month to view month-to-date achievement.</span>}</button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Business distance" onClick={() => setSelectedInsight("business-distance")}><small>Business distance</small><strong>{businessKm.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km</strong><span>Confirmed allocated business kilometres</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Fuel cost per business km" onClick={() => setSelectedInsight("fuel-per-km")}><small>Fuel cost per business km</small><strong>{fuelCostPerBusinessKmPaise === undefined ? "—" : money(fuelCostPerBusinessKmPaise)}</strong><span>{businessKm > 0 ? "Selected-period fuel cost ÷ confirmed business km" : "Unavailable without confirmed distance"}</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain active driving days" onClick={() => setSelectedInsight("active-driving-days")}><small>Active driving days</small><strong>{distanceProjection ? distanceProjection.activeDrivingDayCount : "—"}</strong><span>Online shift plus at least one recorded ride</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain average business kilometres per active driving day" onClick={() => setSelectedInsight("average-km-active-day")}><small>Average km per active day</small><strong>{distanceProjection?.averageBusinessKmPerActiveDrivingDay == null ? "—" : distanceProjection.averageBusinessKmPerActiveDrivingDay.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " km"}</strong><span>Confirmed business km ÷ qualifying active driving days</span></button>
      </section>

      <section className="performance-story" aria-labelledby="performance-lifetime-title">
      <div className="performance-story-title"><small>THE BUSINESS STORY</small><h3>Am I ahead of breakeven?</h3></div>
      <section className="performance-lifetime" aria-labelledby="performance-lifetime-title">
        <header><div><small>FROM BUSINESS START DATE THROUGH PERIOD END</small><h3 id="performance-lifetime-title">Lifetime breakeven & target position</h3></div>
          <button type="button" className={result.lifetime.targetPositionPaise >= 0 ? "performance-position performance-number-action positive" : "performance-position performance-number-action negative"} aria-label="Explain Lifetime target position" onClick={() => setSelectedInsight("lifetime-target-position")}>{signedMoney(result.lifetime.targetPositionPaise)}</button></header>
        <div className="performance-lifetime-grid">
          <button type="button" onClick={() => setSelectedInsight("lifetime-revenue")}><small>Lifetime revenue</small><strong>{money(result.lifetime.revenuePaise)}</strong></button>
          <button type="button" onClick={() => setSelectedInsight("lifetime-cost")}><small>Lifetime eligible costs</small><strong>{money(result.lifetime.costPaise)}</strong></button>
          <button type="button" onClick={() => setSelectedInsight("lifetime-net")}><small>Lifetime net</small><strong className={result.lifetime.profitPaise >= 0 ? "positive" : "negative"}>{signedMoney(result.lifetime.profitPaise)}</strong></button>
          <button type="button" onClick={() => setSelectedInsight("lifetime-target")}><small>Accumulated target</small><strong>{money(result.lifetime.targetPaise)}</strong></button>
          <button type="button" onClick={() => setSelectedInsight("target-month-count")}><small>Target months counted</small><strong>{result.lifetime.elapsedCalendarMonths}</strong></button>
        </div>
        <p className="performance-explainer">Target position is lifetime net profit minus the monthly surplus target prorated by calendar days from business start through the selected period end.</p>
      </section>
      </section>

      <section className="performance-understand" aria-labelledby="performance-understand-title">
      <header><small>UNDERSTAND MY BUSINESS</small><h3 id="performance-understand-title">Where the money goes</h3></header>
      <section className="performance-category-panel" aria-labelledby="performance-cost-breakdown-title">
        <h3 id="performance-cost-breakdown-title">Explore performance by period</h3>
        <div className="performance-tabs" role="tablist" aria-label="Performance detail views">
          <button type="button" role="tab" aria-selected={activeView === "daily"} className={activeView === "daily" ? "active" : ""} onClick={() => setActiveView("daily")}>Daily details</button>
          <button type="button" role="tab" aria-selected={activeView === "distance"} className={activeView === "distance" ? "active" : ""} onClick={() => setActiveView("distance")}>Distance history</button>
          <button type="button" role="tab" aria-selected={activeView === "monthly"} className={activeView === "monthly" ? "active" : ""} onClick={() => setActiveView("monthly")}>Monthly roll-up</button>
          <button type="button" role="tab" aria-selected={activeView === "passbook"} className={activeView === "passbook" ? "active" : ""} onClick={() => setActiveView("passbook")}>Driver Passbook</button>
          <button type="button" role="tab" aria-selected={activeView === "recovery"} className={activeView === "recovery" ? "active" : ""} onClick={() => setActiveView("recovery")}>Pre-business recovery</button>
        </div>
        {activeView === "daily" && <div className="performance-table-wrap"><table className="performance-table">
          <thead><tr><th>Operational date</th><th>Revenue</th><th>Costs</th><th>Net</th><th>Record status</th></tr></thead>
          <tbody>{result.daily.slice().reverse().map(row => <tr key={row.date}>
            <td>{row.date}</td><td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("daily-revenue")}>{money(row.grossRevenuePaise)}</button></td>
            <td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("daily-cost")}>{money(row.totalCostPaise)}</button></td>
            <td><button type="button" className={"performance-table-number " + (row.profitPaise >= 0 ? "positive" : "negative")} onClick={() => setSelectedInsight("daily-net")}>{signedMoney(row.profitPaise)}</button></td>
            <td><button type="button" className={"performance-table-number " + (row.complete ? "positive" : "negative")} onClick={() => setSelectedInsight("daily-completeness")}><span className={row.complete ? "performance-status complete" : "performance-status review"}>{row.complete ? "Complete" : "Review"}</span></button></td>
          </tr>)}</tbody>
        </table></div>}
        {activeView === "distance" && <PerformanceDistanceHistory summary={distanceSummary}/>}
        {activeView === "monthly" && <div className="performance-table-wrap"><table className="performance-table">
          <caption>Monthly revenue, full-cost expense, net and calendar-day-prorated target for the dates included in each month.</caption>
          <thead><tr><th>Month</th><th>Revenue</th><th>Eligible costs</th><th>Net</th><th>Monthly target</th><th>Target position</th></tr></thead>
          <tbody>{months.map(row => <tr key={row.month}><td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("monthly-net")}>{row.month}</button></td>
            <td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("monthly-revenue")}>{money(row.revenue)}</button></td>
            <td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("monthly-cost")}>{money(row.cost)}</button></td>
            <td><button type="button" className={"performance-table-number " + (row.profit >= 0 ? "positive" : "negative")} onClick={() => setSelectedInsight("monthly-net")}>{signedMoney(row.profit)}</button></td>
            <td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("monthly-target")}>{money(row.target)}</button></td>
            <td><button type="button" className={"performance-table-number " + (row.targetPosition >= 0 ? "positive" : "negative")} onClick={() => setSelectedInsight("monthly-target-position")}>{signedMoney(row.targetPosition)}</button></td></tr>)}</tbody>
        </table></div>}
        {activeView === "passbook" && <div className="performance-recovery">
          <div className="performance-recovery-summary">
            <span>Expected cumulative surplus <strong>{money(result.passbook.expectedCumulativeTargetPaise)}</strong></span>
            <span>Actual cumulative surplus <strong>{money(result.passbook.actualEligibleSurplusPaise)}</strong></span>
            <span>{result.passbook.positionPaise >= 0 ? "Ahead of target" : "Behind target"} <strong>{signedMoney(result.passbook.positionPaise)}</strong></span>
            <span>Remaining to target <strong>{money(result.passbook.remainingTargetPaise)}</strong></span>
          </div>
          <p className="performance-explainer">Passbook progress runs from the Business Start Date. Daily actual surplus is gross completed-trip fares and cancellation fees minus the same verified full-cost expenses used by Performance. Earlier shortfalls carry forward and later surplus can recover them.</p>
          <div className="performance-table-wrap"><table className="performance-table">
            <thead><tr><th>Date</th><th>Expected cumulative</th><th>Actual daily surplus</th><th>Actual cumulative</th><th>Ahead / behind</th><th>Remaining</th><th>Source records</th></tr></thead>
            <tbody>{result.passbook.daily.slice().reverse().map(row => <tr key={row.date}>
              <td>{row.date}</td><td>{money(row.expectedCumulativeTargetPaise)}</td>
              <td>{signedMoney(row.actualDailySurplusPaise)}</td><td>{signedMoney(row.actualCumulativeSurplusPaise)}</td>
              <td className={row.positionPaise >= 0 ? "positive" : "negative"}>{signedMoney(row.positionPaise)}</td>
              <td>{money(row.remainingTargetPaise)}</td>
              <td><details><summary>{row.sourceRefs.length} source{row.sourceRefs.length === 1 ? "" : "s"}</summary>
                <ul>{row.sourceRefs.map((ref, index) => <li key={ref.sourceId + ":" + ref.revision + ":" + index}>
                  {ref.sourceId} · revision {ref.revision}{ref.scheduleVersion === undefined ? "" : " · schedule " + ref.scheduleVersion}
                </li>)}</ul>
              </details></td>
            </tr>)}</tbody>
          </table></div>
        </div>}
        {activeView === "recovery" && <div className="performance-recovery">
          <div className="performance-recovery-summary"><span>Recovery window <strong>{result.recovery.from} — {result.recovery.toExclusive} (exclusive)</strong></span>
            <span>Total eligible pre-business amounts <strong>{money(result.recovery.totalPaise)}</strong></span></div>
          <div className="performance-table-wrap"><table className="performance-table">
            <thead><tr><th>Source / note</th><th>Origin</th><th>Allocated daily</th><th>Source revision</th></tr></thead>
            <tbody>{result.recovery.daily.filter(row => row.date >= result.periodFrom && row.date <= result.periodTo).slice(-90).map((row, index) => <tr key={row.sourceId + ":" + row.date + ":" + index}>
              <td>{row.note}<small className="performance-subtext">{row.date}</small></td><td>{row.origin}</td>
              <td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("recovery-allocation")}>{money(row.amountPaise)}</button></td>
              <td><button type="button" className="performance-table-number" onClick={() => setSelectedInsight("recovery-source-revision")}>{row.sourceId} · r{row.revision}</button></td></tr>)}</tbody>
          </table></div><p className="performance-explainer">Showing at most the most recent 90 recovery dates within the selected period. The full calculation window is exactly 18 months from business start.</p>
        </div>}
      </section>
      <section className="performance-category-panel" aria-labelledby="performance-category-list-title">
        <h3 id="performance-category-list-title">Selected period cost breakdown</h3>
        {categories.length === 0 ? <p>No verified costs were allocated to this period.</p> : <div className="performance-category-list">
          {categories.map(item => <button type="button" className="performance-category-row performance-number-action" key={item.key} onClick={() => setSelectedInsight("cost-kind:" + item.key)}><span>{item.label}</span><strong>{money(item.amount)}</strong></button>)}
        </div>}
      </section>
      </section>

      <section className="performance-check-numbers" aria-labelledby="performance-check-numbers-title">
      <header><small>CHECK MY NUMBERS</small><h3 id="performance-check-numbers-title">How each figure was calculated</h3></header>
      <div className="performance-insight" aria-live="polite"><h4>{insight.label}</h4><p className="performance-formula">{insight.formula}</p><details><summary>Source-record path ({result.provenance.sourceRefs.length} source references)</summary><p>These immutable source IDs and revisions are passed through the Performance calculation provenance from their owning modules. Use the owning module's record/history view to inspect or correct source data; Performance is read-only.</p><ul>{result.provenance.sourceRefs.map((ref, index) => <li key={ref.sourceId + ":" + ref.revision + ":" + index}>{ref.sourceId} · revision {ref.revision}</li>)}</ul></details></div>
      <details className="performance-provenance" id="performance-provenance"><summary>Calculation completeness & source provenance ({result.provenance.sourceRefs.length} source references)</summary>
        {incomplete.length === 0 ? <p>All supplied completeness checks are complete.</p> : <ul>{incomplete.map((item, index) =>
          <li key={item.source + ":" + index}><strong>{item.source}:</strong> {item.status}{item.detail ? " — " + item.detail : ""}</li>)}</ul>}
        <p>Calculation ID {result.calculationId} · version {result.calculationVersion}</p>
        <details><summary>Source IDs and revisions</summary><ul>{result.provenance.sourceRefs.map((ref, index) =>
          <li key={ref.sourceId + ":" + ref.revision + ":" + index}>{ref.sourceId} · revision {ref.revision}</li>)}</ul></details>
      </details>
      </section>
    </>}
  </section>;
}
