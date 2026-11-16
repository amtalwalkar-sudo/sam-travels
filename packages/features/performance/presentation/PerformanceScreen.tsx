import { useState, type FormEvent } from "react";
import type { PerformanceCalculationServiceV1 } from "../../../application/src/performance-calculation-service";
import type { FullCostBreakevenService } from "../../../application/src/full-cost-breakeven-service";
import type { BreakevenPeriodResultV1 } from "../../../domain/src/full-cost-breakeven";
import type { PerformanceCalculationResultV1, PerformanceCostKindV1 } from "../../../domain/src/performance-calculation-v1";
import "./performance-screen.css";

type PerformanceScreenContext = Readonly<{
  calculation: Pick<PerformanceCalculationServiceV1, "calculate">;
  fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">;
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
function operationalToday(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  return hour < 4 ? localDateOffset(-1) : localDateOffset(0);
}
function offsetDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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
  return [...totals].map(([month, item]) => ({ month, ...item,
    target: result.period.monthlyDriverTargetPaise,
    targetPosition: item.profit - result.period.monthlyDriverTargetPaise,
  }));
}

export function PerformanceScreen({ context }: { context: PerformanceScreenContext }) {
  const today = operationalToday();
  const [from, setFrom] = useState(offsetDate(today, -29));
  const [to, setTo] = useState(today);
  const [rangePreset, setRangePreset] = useState<"today" | "week" | "month" | "custom" | "lifetime">("month");
  const [result, setResult] = useState<PerformanceCalculationResultV1>();
  const [monthToDate, setMonthToDate] = useState<PerformanceCalculationResultV1>();
  const [distanceProjection, setDistanceProjection] = useState<BreakevenPeriodResultV1>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<"daily" | "monthly" | "recovery">("daily");
  const [selectedInsight, setSelectedInsight] = useState("lifetime-target-position");

  async function calculate(event?: FormEvent) {
    event?.preventDefault();
    if (!from || !to || from > to) return;
    setLoading(true); setError("");
    try {
      const [selectedPeriod, distance] = await Promise.all([
        context.calculation.calculate(from, to),
        context.fullCostBreakeven.calculate(from, to),
      ]);
      setResult(selectedPeriod);
      setDistanceProjection(distance);
      const currentOperationalDate = operationalToday();
      try {
        setMonthToDate(await context.calculation.calculate(currentOperationalDate.slice(0, 7) + "-01", currentOperationalDate));
      } catch { setMonthToDate(undefined); }
    }
    catch (reason) {
      setResult(undefined); setMonthToDate(undefined); setDistanceProjection(undefined);
      setError(reason instanceof Error ? reason.message : "Performance calculation failed.");
    } finally { setLoading(false); }
  }

  const categories = result ? aggregateCosts(result) : [];
  const months = result ? monthlyTotals(result) : [];
  const incomplete = result?.provenance.completeness.filter(item => item.status !== "complete") ?? [];
  const businessKm = distanceProjection?.daily.reduce((sum, row) => sum + row.businessKm, 0) ?? 0;
  const fuelCostPaise = categories.find(item => item.key === "fuel")?.amount ?? 0;
  const fuelCostPerBusinessKmPaise = businessKm > 0 ? fuelCostPaise / businessKm : undefined;
  const monthToDateAchievementPercent = monthToDate && monthToDate.period.monthlyDriverTargetPaise > 0
    ? Math.round(monthToDate.period.profitPaise / monthToDate.period.monthlyDriverTargetPaise * 100)
    : undefined;
  const insightDefinitions: Record<string, { label: string; formula: string }> = {
    "period-revenue": { label: "Period revenue", formula: "Verified gross completed fares + verified cancellation fees, summed over the selected operational dates. Unverified revenue is excluded." },
    "period-cost": { label: "Eligible period costs", formula: "Sum of verified operating costs, separately allocated EMI and Compliance, and applicable pre-business recovery amounts. Costs are not duplicated across source modules." },
    "period-net": { label: "Period net position", formula: "Selected-period revenue − selected-period full eligible costs." },
    "monthly-target": { label: "Monthly Driver Target", formula: "A fixed rupee amount set in Admin. It is shown in full for selected date filters and is not prorated. Month-to-date achievement = month-to-date net profit ÷ monthly target." },
    "business-distance": { label: "Business distance", formula: "Sum of confirmed allocated daily business kilometres in the selected period. Unallocated distance is not included." },
    "fuel-per-km": { label: "Fuel cost per business km", formula: "Verified fuel cost in the selected period ÷ confirmed allocated business kilometres. It is unavailable when distance is zero or not confirmed." },
    "lifetime-revenue": { label: "Lifetime revenue", formula: "Verified revenue summed from the actual business start date through the selected period end." },
    "lifetime-cost": { label: "Lifetime eligible costs", formula: "Verified eligible costs and recovery allocations summed from actual business start date through selected period end." },
    "lifetime-net": { label: "Lifetime net", formula: "Lifetime verified revenue − lifetime eligible costs." },
    "lifetime-target": { label: "Accumulated target", formula: "Configured monthly Driver Target × elapsed calendar months from business start through selected period-to month, counting both start and end months." },
    "lifetime-target-position": { label: "Lifetime target position", formula: "Lifetime net profit − accumulated target. Positive means ahead of the accumulated target; negative means shortfall." },
    "target-month-count": { label: "Target months counted", formula: "Calendar month count from business start month through selected period-to month, inclusive." },
  };
  const insight = insightDefinitions[selectedInsight] ?? {
    label: selectedInsight.startsWith("cost-kind:") ? CATEGORY_LABELS[selectedInsight.slice(9) as PerformanceCostKindV1] ?? "Cost category" : "Performance figure",
    formula: selectedInsight.startsWith("cost-kind:")
      ? "This category total is the sum of verified daily amounts for this cost kind over the selected period."
      : "The figure is calculated from the selected period's verified and allocated source records.",
  };

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
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Period revenue" onClick={() => setSelectedInsight("period-revenue")}><small>Period revenue</small><strong>{money(result.period.revenuePaise)}</strong><span>Verified fares + cancellation fees</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Eligible period costs" onClick={() => setSelectedInsight("period-cost")}><small>Eligible period costs</small><strong>{money(result.period.costPaise)}</strong><span>Including recovery allocations</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Period net position" onClick={() => setSelectedInsight("period-net")}><small>Period net position</small><strong className={result.period.profitPaise >= 0 ? "positive" : "negative"}>{signedMoney(result.period.profitPaise)}</strong><span>Revenue minus eligible costs</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Monthly Driver Target" onClick={() => setSelectedInsight("monthly-target")}><small>Monthly Driver Target</small><strong>{money(result.period.monthlyDriverTargetPaise)}</strong><span>Fixed monthly rupee target · not prorated</span>
          {monthToDate ? <span>Month-to-date net: {signedMoney(monthToDate.period.profitPaise)}{monthToDateAchievementPercent === undefined ? "" : " · " + monthToDateAchievementPercent + "% of target"}</span>
            : <span>Month-to-date achievement is currently unavailable.</span>}</button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Business distance" onClick={() => setSelectedInsight("business-distance")}><small>Business distance</small><strong>{businessKm.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km</strong><span>Confirmed allocated business kilometres</span></button>
        <button type="button" className="performance-kpi performance-number-action" aria-label="Explain Fuel cost per business km" onClick={() => setSelectedInsight("fuel-per-km")}><small>Fuel cost per business km</small><strong>{fuelCostPerBusinessKmPaise === undefined ? "—" : money(fuelCostPerBusinessKmPaise)}</strong><span>{businessKm > 0 ? "Selected-period fuel cost ÷ confirmed business km" : "Unavailable without confirmed distance"}</span></button>
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
        <p className="performance-explainer">Target position is lifetime net profit minus the fixed monthly target multiplied by elapsed calendar months since business start (including the start and period-to months).</p>
      </section>
      </section>

      <section className="performance-understand" aria-labelledby="performance-understand-title">
      <header><small>UNDERSTAND MY BUSINESS</small><h3 id="performance-understand-title">Where the money goes</h3></header>
      <section className="performance-category-panel" aria-labelledby="performance-cost-breakdown-title">
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
          <caption>Monthly Driver Passbook · full configured target is shown for each month, even when selected dates cover only part of it.</caption>
          <thead><tr><th>Month</th><th>Revenue</th><th>Eligible costs</th><th>Net</th><th>Monthly target</th><th>Target position</th></tr></thead>
          <tbody>{months.map(row => <tr key={row.month}><td>{row.month}</td><td>{money(row.revenue)}</td><td>{money(row.cost)}</td>
            <td className={row.profit >= 0 ? "positive" : "negative"}>{signedMoney(row.profit)}</td><td>{money(row.target)}</td>
            <td className={row.targetPosition >= 0 ? "positive" : "negative"}>{signedMoney(row.targetPosition)}</td></tr>)}</tbody>
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
      <section className="performance-detail-panel">
        {categories.length === 0 ? <p>No verified costs were allocated to this period.</p> : <div className="performance-category-list">
          {categories.map(item => <button type="button" className="performance-category-row performance-number-action" key={item.key} onClick={() => setSelectedInsight("cost-kind:" + item.key)}><span>{item.label}</span><strong>{money(item.amount)}</strong></button>)}
        </div>}
      </section>

      <section className="performance-check-numbers" aria-labelledby="performance-check-numbers-title">
      <header><small>CHECK MY NUMBERS</small><h3 id="performance-check-numbers-title">How each figure was calculated</h3></header>
      <div className="performance-insight" aria-live="polite"><h4>{insight.label}</h4><p className="performance-formula">{insight.formula}</p><details><summary>Source-record path ({result.provenance.sourceRefs.length} source references)</summary><p>These immutable source IDs and revisions are passed through the Performance calculation provenance from their owning modules. Use the owning module's record/history view to inspect or correct source data; Performance is read-only.</p><ul>{result.provenance.sourceRefs.map((ref, index) => <li key={ref.sourceId + ":" + ref.revision + ":" + index}>{ref.sourceId} · revision {ref.revision}</li>)}</ul></details></div>
      <details className="performance-provenance"><summary>Calculation completeness & source provenance ({result.provenance.sourceRefs.length} source references)</summary>
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
