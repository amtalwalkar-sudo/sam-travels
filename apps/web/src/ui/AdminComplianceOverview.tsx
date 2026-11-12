import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";
import "./AdminWorkspace.css";

type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
type Overview = Awaited<ReturnType<AdminPresentationServices["complianceAnalysis"]["getOverview"]>>;
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(paise / 100);
function expiryStatus(validTo: string): "Valid" | "Expiring soon" | "Expired" {
  const days = Math.floor((Date.parse(validTo + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 86400000);
  return days < 0 ? "Expired" : days <= 15 ? "Expiring soon" : "Valid";
}
function overlapKey(item: Overview["overlaps"][number]) {
  return [item.vehicleId, item.firstRecordId, item.secondRecordId, item.from, item.to].join("|");
}

export function AdminComplianceOverview() {
  const services = useAdminServices();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [vehicleRows, data] = await Promise.all([
        services.vehicles.list(), services.complianceAnalysis.getOverview(),
      ]);
      setVehicles(vehicleRows);
      setOverview(data);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Compliance analysis.");
    }
  }, [services]);
  useEffect(() => { void refresh(); }, [refresh]);

  const records = useMemo(() => (overview?.records ?? []).filter(record =>
    vehicleFilter === "all" || record.data.vehicleId === vehicleFilter,
  ), [overview, vehicleFilter]);
  const gaps = useMemo(() => (overview?.gaps ?? []).filter(item =>
    vehicleFilter === "all" || item.vehicleId === vehicleFilter,
  ), [overview, vehicleFilter]);
  const overlaps = useMemo(() => (overview?.overlaps ?? []).filter(item =>
    vehicleFilter === "all" || item.vehicleId === vehicleFilter,
  ), [overview, vehicleFilter]);
  const vehicleName = (id: string) => vehicles.find(vehicle => vehicle.id === id)?.data.registrationNumber ?? id;

  async function decide(item: Overview["overlaps"][number], decision: "confirmed" | "rejected") {
    const key = overlapKey(item);
    const rationale = (rationales[key] ?? "").trim();
    if (!rationale) { setMessage("A review reason is required before recording a decision."); return; }
    setBusyKey(key); setMessage("");
    try {
      await services.complianceAnalysis.recordReview({
        uuid: crypto.randomUUID(),
        firstRecordId: item.firstRecordId, secondRecordId: item.secondRecordId,
        from: item.from, to: item.to, decision, rationale,
      });
      setRationales(previous => ({ ...previous, [key]: "" }));
      setMessage(decision === "confirmed" ? "Overlap confirmed. Original dates remain unchanged." : "Overlap rejected. It remains flagged for attention.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save overlap review.");
    } finally { setBusyKey(""); }
  }

  return <section className="compliance-fleet-overview" aria-label="Fleet Compliance analysis">
    <div className="admin-vehicle-context">
      <label htmlFor="compliance-fleet-filter">Fleet overview · Filter by vehicle</label>
      <select id="compliance-fleet-filter" value={vehicleFilter} onChange={event => setVehicleFilter(event.target.value)}>
        <option value="all">All vehicles</option>
        {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.data.registrationNumber}</option>)}
      </select>
    </div>
    {overview && <>
      <div className="compliance-overview-counts">
        <div><strong>{records.length}</strong><small>Records</small></div>
        <div><strong>{gaps.length}</strong><small>Coverage gaps</small></div>
        <div><strong>{overlaps.length}</strong><small>Overlaps</small></div>
      </div>
      <div className="compliance-overview-section">
        <h3>Expiry status</h3>
        {records.length === 0 ? <p className="admin-hint">No Compliance records in this view.</p> :
          records.slice().sort((a,b)=>a.data.validTo.localeCompare(b.data.validTo)).map(record =>
            <article className="admin-capability-record" key={record.id}>
              <div><strong>{record.data.complianceName} · {expiryStatus(record.data.validTo)}</strong>
                <small>{vehicleName(record.data.vehicleId)} · valid {record.data.validFrom} to {record.data.validTo}</small>
                <small>{record.data.supportingDocumentRef ? "Document reference: " + record.data.supportingDocumentRef : "Supporting document missing"}</small>
              </div>
            </article>,
          )}
      </div>
      <div className="compliance-overview-section">
        <h3>Coverage gaps</h3>
        {gaps.length === 0 ? <p className="admin-hint">No detected coverage gaps.</p> : gaps.map((gap,index) =>
          <article className="admin-capability-record" key={gap.vehicleId + gap.complianceName + gap.from + index}>
            <div><strong>{gap.complianceName} · {vehicleName(gap.vehicleId)}</strong>
              <small>Uncovered {gap.from} to {gap.to} · {gap.days} {gap.days === 1 ? "day" : "days"}</small>
            </div>
          </article>,
        )}
      </div>
      <div className="compliance-overview-section">
        <h3>Overlapping records</h3>
        {overlaps.length === 0 ? <p className="admin-hint">No detected overlaps.</p> : overlaps.map(item => {
          const key = overlapKey(item);
          const first = overview.records.find(record => record.id === item.firstRecordId);
          const second = overview.records.find(record => record.id === item.secondRecordId);
          const needsReview = item.reviewStatus !== "confirmed" && item.reviewStatus !== "rejected";
          return <article className="compliance-overlap-card" key={key}>
            <div className="compliance-overlap-heading">
              <strong>{item.complianceName} · {vehicleName(item.vehicleId)}</strong>
              <span className={"compliance-review-state state-" + item.reviewStatus}>{item.reviewStatus === "stale" ? "Needs review" : item.reviewStatus}</span>
            </div>
            <small>Overlap {item.from} to {item.to} · {item.days} {item.days === 1 ? "day" : "days"}</small>
            <div className="compliance-source-pair">
              <div><b>Source A</b><small>{first?.data.validFrom} to {first?.data.validTo}</small><small>{money(first?.data.totalCostPaise ?? 0)}</small></div>
              <div><b>Source B</b><small>{second?.data.validFrom} to {second?.data.validTo}</small><small>{money(second?.data.totalCostPaise ?? 0)}</small></div>
            </div>
            {needsReview && <div className="compliance-review-actions">
              <label>Review reason<textarea rows={2} maxLength={1000} value={rationales[key] ?? ""}
                onChange={event => setRationales(previous => ({ ...previous, [key]: event.target.value }))}
                placeholder="Explain why these overlapping records are accepted or rejected" /></label>
              <div className="loan-form-actions">
                <button className="admin-primary" type="button" disabled={!!busyKey} onClick={() => void decide(item,"confirmed")}>Confirm overlap</button>
                <button className="admin-secondary" type="button" disabled={!!busyKey} onClick={() => void decide(item,"rejected")}>Reject overlap</button>
              </div>
            </div>}
            {item.reviewStatus === "confirmed" && <small>Confirmed for these exact source revisions. Dates and overlap are retained.</small>}
            {item.reviewStatus === "rejected" && <small>Rejected; the overlap remains unconfirmed for cost aggregation.</small>}
          </article>;
        })}
      </div>
    </>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}
