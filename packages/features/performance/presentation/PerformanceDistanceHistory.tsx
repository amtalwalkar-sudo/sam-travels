import type { BreakevenDistanceSummaryV1 } from "../../../domain/src/full-cost-breakeven";

export function PerformanceDistanceHistory({
  summary,
}: {
  summary?: BreakevenDistanceSummaryV1;
}) {
  const formatKm = (value: number | null) => value === null
    ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " km";

  return <div className="performance-distance-history">
    {summary ? <>
      <div className="performance-recovery-summary">
        <span>Confirmed business distance <strong>{formatKm(summary.totalBusinessKm)}</strong></span>
        <span>Qualifying active driving days <strong>{summary.activeDrivingDayCount}</strong></span>
        <span>Average per active day <strong>{formatKm(summary.averageBusinessKmPerActiveDrivingDay)}</strong></span>
        <span>Distance source <strong>{summary.complete ? "Complete" : "Review required"}</strong></span>
      </div>
      <p className="performance-explainer">Totals include every confirmed allocated business kilometre in the selected period. Personal kilometres are excluded. Averages divide confirmed business kilometres by qualifying active driving days; zero-kilometre active days remain in the denominator. Unallocated boundary distance is withheld and marked for review.</p>
      <h4>Daily distance</h4>
      <div className="performance-table-wrap"><table className="performance-table">
        <caption>Daily distance from confirmed Work allocations</caption>
        <thead><tr><th>Operational date</th><th>Business km</th><th>Active driving day</th><th>Average km / active day</th><th>Status</th></tr></thead>
        <tbody>{summary.daily.slice().reverse().map(row => <tr key={row.date}>
          <td>{row.date}</td><td>{formatKm(row.businessKm)}</td><td>{row.activeDrivingDay ? "Yes" : "No"}</td>
          <td>{formatKm(row.averageBusinessKmPerActiveDrivingDay)}</td>
          <td><span className={row.complete ? "performance-status complete" : "performance-status review"}>{row.complete ? "Complete" : "Review"}</span></td>
        </tr>)}</tbody>
      </table></div>
      <h4>Weekly distance</h4>
      <div className="performance-table-wrap"><table className="performance-table">
        <caption>Weekly confirmed business distance and active-day average</caption>
        <thead><tr><th>ISO week</th><th>Dates</th><th>Business km</th><th>Active days</th><th>Average km / active day</th><th>Status</th></tr></thead>
        <tbody>{summary.weekly.slice().reverse().map(row => <tr key={row.period}>
          <td>{row.period}</td><td>{row.from} — {row.to}</td><td>{formatKm(row.businessKm)}</td>
          <td>{row.activeDrivingDayCount}</td><td>{formatKm(row.averageBusinessKmPerActiveDrivingDay)}</td>
          <td><span className={row.complete ? "performance-status complete" : "performance-status review"}>{row.complete ? "Complete" : "Review"}</span></td>
        </tr>)}</tbody>
      </table></div>
      <h4>Monthly distance</h4>
      <div className="performance-table-wrap"><table className="performance-table">
        <caption>Monthly confirmed business distance and active-day average</caption>
        <thead><tr><th>Month</th><th>Dates</th><th>Business km</th><th>Active days</th><th>Average km / active day</th><th>Status</th></tr></thead>
        <tbody>{summary.monthly.slice().reverse().map(row => <tr key={row.period}>
          <td>{row.period}</td><td>{row.from} — {row.to}</td><td>{formatKm(row.businessKm)}</td>
          <td>{row.activeDrivingDayCount}</td><td>{formatKm(row.averageBusinessKmPerActiveDrivingDay)}</td>
          <td><span className={row.complete ? "performance-status complete" : "performance-status review"}>{row.complete ? "Complete" : "Review"}</span></td>
        </tr>)}</tbody>
      </table></div>
    </> : <p>Confirmed distance history is unavailable for this period.</p>}
  </div>;
}
