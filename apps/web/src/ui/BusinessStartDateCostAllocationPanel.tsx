import { useCallback, useEffect, useState } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";

type Report = Awaited<ReturnType<AdminPresentationServices["costAllocation"]["getReport"]>>;
const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(paise / 100);

export function BusinessStartDateCostAllocationPanel() {
  const services = useAdminServices();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await services.costAllocation.getReport());
      setMessage("");
    } catch (error) {
      setReport(null);
      setMessage(error instanceof Error ? error.message : "Could not calculate business cost allocations.");
    } finally { setLoading(false); }
  }, [services]);
  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="compliance-overview-section" aria-label="Business cost allocation report">
    <div className="compliance-daily-heading">
      <h3>Business cost allocation</h3>
      <button className="admin-secondary" type="button" disabled={loading} onClick={() => void refresh()}>Refresh report</button>
    </div>
    {loading ? <p className="admin-hint">Calculating from current source records…</p> :
      report ? <>
        <p className="admin-hint">Business Start Date: {report.businessStartDate} · Calculation v{report.result.calculationVersion}. This report is rebuilt from current source records and schedule versions.</p>
        <div className="compliance-overview-counts">
          <div><strong>{money(report.result.allocatedAmountPaise)}</strong><small>Allocated to business days</small></div>
          <div><strong>{money(report.result.historicalAmountPaise)}</strong><small>Pre-business historical</small></div>
          <div><strong>{money(report.result.withheldAmountPaise)}</strong><small>Withheld for overlap review</small></div>
        </div>
        <div className="compliance-overview-section">
          <h4>Monthly totals</h4>
          {report.result.monthly.length ? report.result.monthly.map(item =>
            <div className="compliance-daily-cost" key={item.month}><strong>{item.month}</strong><small>{money(item.amountPaise)}</small></div>,
          ) : <p className="admin-hint">No business-day costs are currently allocated.</p>}
        </div>
        <div className="compliance-overview-section">
          <h4>Yearly totals</h4>
          {report.result.yearly.length ? report.result.yearly.map(item =>
            <div className="compliance-daily-cost" key={item.year}><strong>{item.year}</strong><small>{money(item.amountPaise)}</small></div>,
          ) : <p className="admin-hint">No yearly totals yet.</p>}
        </div>
        <details className="loan-schedule">
          <summary>Allocation source audit ({report.result.sources.length} sources · {report.result.daily.length} business days)</summary>
          {report.result.sources.map(source => <article className="admin-capability-record" key={source.sourceId}>
            <div>
              <strong>{source.sourceKind === "compliance" ? "Compliance" : source.sourceKind === "emi" ? "Scheduled EMI" : "Pre-business EMI carry-forward"}</strong>
              <small>{source.sourceId}</small>
              <small>{money(source.sourceAmountPaise)} · {source.disposition.replaceAll("_", " ")} · source revision {source.sourceVersion}{source.scheduleVersion ? " · schedule v" + source.scheduleVersion : ""}</small>
              {source.eligibleFrom && source.eligibleTo && <small>Allocated {source.eligibleFrom} through {source.eligibleTo}</small>}
            </div>
          </article>)}
        </details>
      </> : <p className="admin-message" role="status">{message || "Business Start Date is not configured."}</p>}
    {message && report && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
