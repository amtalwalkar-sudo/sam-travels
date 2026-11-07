import { createElement, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import "./AdminWorkspace.css";
import { BusinessSetupSection, VehicleSection } from "./AdminBusinessVehicle";
import { LoanPaymentsPanel } from "./LoanPaymentsPanel";
import {
  getApplicationFinanceLoanService,
  getApplicationRecordSource,
  getApplicationVehicleService,
  type FinanceLoanDetailsV1,
} from "../../../../packages/application/src";
import type { LoanAmortizationSchedule } from "../../../../packages/features/finance";

type Vehicle = Awaited<ReturnType<ReturnType<typeof getApplicationVehicleService>["list"]>>[number];
type Loan = Awaited<ReturnType<ReturnType<typeof getApplicationFinanceLoanService>["list"]>>[number];
type AdminSection = "Business setup" | "Vehicle" | "Driver" | "Compliance" | "Loan" | "Maintenance";
type LoanForm = {
  loanName: string;
  lenderName: string;
  loanAccountReference: string;
  principalRupees: string;
  annualRatePercent: string;
  loanStartDate: string;
  tenureMonths: string;
  firstEmiDate: string;
};

const EMPTY_FORM: LoanForm = {
  loanName: "", lenderName: "", loanAccountReference: "", principalRupees: "",
  annualRatePercent: "", loanStartDate: "", tenureMonths: "", firstEmiDate: "",
};
const SECTIONS: AdminSection[] = ["Business setup", "Vehicle", "Driver", "Compliance", "Loan", "Maintenance"];

function money(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(paise / 100);
}
function rate(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2) + "% p.a.";
}
function asForm(details: FinanceLoanDetailsV1): LoanForm {
  return {
    loanName: details.loanName,
    lenderName: details.lenderName,
    loanAccountReference: details.loanAccountReference ?? "",
    principalRupees: (details.principalPaise / 100).toFixed(2),
    annualRatePercent: (details.annualInterestRateBasisPoints / 100).toFixed(2),
    loanStartDate: details.loanStartDate,
    tenureMonths: String(details.tenureMonths),
    firstEmiDate: details.firstEmiDate,
  };
}
function toDetails(form: LoanForm, vehicleId: string): FinanceLoanDetailsV1 {
  const principal = Number(form.principalRupees);
  const annualRate = Number(form.annualRatePercent);
  const tenure = Number(form.tenureMonths);
  const principalPaise = Math.round(principal * 100);
  const annualInterestRateBasisPoints = Math.round(annualRate * 100);
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isSafeInteger(principalPaise) ||
      !Number.isFinite(annualRate) || annualRate < 0 || !Number.isSafeInteger(annualInterestRateBasisPoints) ||
      !Number.isSafeInteger(tenure) || tenure < 1 || tenure > 1200) {
    throw new Error("Enter a valid principal, annual interest rate and tenure.");
  }
  return {
    loanName: form.loanName.trim(),
    lenderName: form.lenderName.trim(),
    ...(form.loanAccountReference.trim() ? { loanAccountReference: form.loanAccountReference.trim() } : {}),
    vehicleId,
    principalPaise,
    annualInterestRateBasisPoints,
    loanStartDate: form.loanStartDate,
    tenureMonths: tenure,
    firstEmiDate: form.firstEmiDate,
  };
}

export function AdminWorkspace() {
  const [expanded, setExpanded] = useState<AdminSection | null>("Loan");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [form, setForm] = useState<LoanForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [vehicleRecords, loanRecords] = await Promise.all([
        getApplicationVehicleService().list(),
        getApplicationFinanceLoanService().list(),
      ]);
      setVehicles(vehicleRecords);
      setLoans(loanRecords);
      setSelectedVehicleId(current => current || vehicleRecords.find(item => item.data.lifecycleState === "active")?.id || vehicleRecords[0]?.id || "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Admin records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedVehicle = vehicles.find(item => item.id === selectedVehicleId);
  const vehicleLoans = useMemo(
    () => loans.filter(item => item.data.details.vehicleId === selectedVehicleId),
    [loans, selectedVehicleId],
  );

  function beginCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setMessage("");
  }
  function beginEdit(loan: Loan) {
    setEditing(loan);
    setFormOpen(true);
    setForm(asForm(loan.data.details));
    setMessage("");
  }
  function cancelEdit() {
    setEditing(null);
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setMessage("");
  }

  async function saveLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVehicle) {
      setMessage("Select a vehicle before adding a loan.");
      return;
    }
    if (!editing && selectedVehicle.data.lifecycleState !== "active") {
      setMessage("A new loan can only be added to an active vehicle.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const details = toDetails(form, selectedVehicle.id);
      const service = getApplicationFinanceLoanService();
      if (editing) {
        await service.update({ id: editing.id, expectedRevision: editing.revision, details });
        setMessage("Loan details saved. Previous EMI schedule versions are preserved.");
      } else {
        await service.create({
          uuid: crypto.randomUUID(),
          details,
          source: getApplicationRecordSource(),
        });
        setMessage("Loan and original EMI schedule saved.");
      }
      setEditing(null);
      setFormOpen(false);
      setForm(EMPTY_FORM);
      const [nextVehicles, nextLoans] = await Promise.all([
        getApplicationVehicleService().list(),
        service.list(),
      ]);
      setVehicles(nextVehicles);
      setLoans(nextLoans);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Loan could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="admin-workspace" aria-label="Admin workspace">
    <div className="admin-intro">
      <div><small>BUSINESS ADMINISTRATION</small><h2>Admin</h2><p>Manage business and vehicle records. Each section uses its owning capability.</p></div>
      <span className="admin-local-tag">LOCAL RECORDS</span>
    </div>
    <div className="admin-section-list">
      {SECTIONS.map(section => <div className="admin-section" key={section}>
        <button className={expanded === section ? "admin-section-trigger active" : "admin-section-trigger"}
          type="button" aria-expanded={expanded === section}
          onClick={() => { setExpanded(current => current === section ? null : section); setMessage(""); }}>
          <span>{section}</span><span aria-hidden="true">{expanded === section ? "−" : "+"}</span>
        </button>
        {expanded === section && <div className="admin-section-content">
          {section === "Business setup" ? <BusinessSetupSection /> : section === "Vehicle" ? <VehicleSection /> : section === "Loan" ? <>
            <div className="admin-vehicle-context">
              <label htmlFor="admin-vehicle">Selected vehicle</label>
              <select id="admin-vehicle" value={selectedVehicleId}
                onChange={event => { setSelectedVehicleId(event.target.value); cancelEdit(); }}>
                <option value="">Select vehicle</option>
                {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.data.registrationNumber} · {vehicle.data.make} {vehicle.data.model} ({vehicle.data.lifecycleState})
                </option>)}
              </select>
            </div>
            {loading ? <p className="admin-hint">Loading loan records…</p> : !vehicles.length
              ? <p className="admin-hint">Add a vehicle in Vehicle before creating a loan.</p>
              : !selectedVehicle ? <p className="admin-hint">Select a vehicle to view its loans.</p> : <>
                <div className="loan-section-heading">
                  <div><strong>{selectedVehicle.data.registrationNumber}</strong><small>{selectedVehicle.data.make} {selectedVehicle.data.model}</small></div>
                  <span>{selectedVehicle.data.lifecycleState}</span>
                </div>
                {!editing && selectedVehicle.data.lifecycleState === "active" &&
                  <button className="admin-primary" type="button" onClick={beginCreate}>Add loan</button>}
                {editing && <p className="admin-hint">Editing {editing.data.details.loanName} · revision {editing.revision}</p>}
                {formOpen && <form className="loan-form" onSubmit={saveLoan}>
                  <div className="loan-form-grid">
                    <label>Loan name<input required value={form.loanName} onChange={event => setForm({ ...form, loanName: event.target.value })} /></label>
                    <label>Lender name<input required value={form.lenderName} onChange={event => setForm({ ...form, lenderName: event.target.value })} /></label>
                    <label>Loan account reference (optional)<input value={form.loanAccountReference} onChange={event => setForm({ ...form, loanAccountReference: event.target.value })} /></label>
                    <label>Original principal (₹)<input required type="number" min="0.01" step="0.01" value={form.principalRupees} onChange={event => setForm({ ...form, principalRupees: event.target.value })} /></label>
                    <label>Annual interest rate (%)<input required type="number" min="0" step="0.01" value={form.annualRatePercent} onChange={event => setForm({ ...form, annualRatePercent: event.target.value })} /></label>
                    <label>Tenure (months)<input required type="number" min="1" max="1200" step="1" value={form.tenureMonths} onChange={event => setForm({ ...form, tenureMonths: event.target.value })} /></label>
                    <label>Loan start date<input required type="date" value={form.loanStartDate} onChange={event => setForm({ ...form, loanStartDate: event.target.value })} /></label>
                    <label>First EMI date (first day of month)<input required type="date" value={form.firstEmiDate} onChange={event => setForm({ ...form, firstEmiDate: event.target.value })} /></label>
                  </div>
                  <div className="loan-form-actions">
                    <button className="admin-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save loan"}</button>
                    <button className="admin-secondary" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
                  </div>
                </form>}
                {vehicleLoans.length === 0 ? <p className="admin-hint">No loans recorded for this vehicle yet.</p> :
                  <div className="loan-record-list">{vehicleLoans.map(loan => {
                    const version = loan.data.scheduleVersions[loan.data.currentScheduleVersion - 1];
                    const schedule = version.output as LoanAmortizationSchedule;
                    return <article className="loan-record" key={loan.id}>
                      <div className="loan-record-heading">
                        <div><strong>{loan.data.details.loanName}</strong><small>{loan.data.details.lenderName} · {rate(loan.data.details.annualInterestRateBasisPoints)}</small></div>
                        <button className="admin-secondary" type="button" onClick={() => beginEdit(loan)}>Edit details</button>
                      </div>
                      <div className="loan-metrics">
                        <div><small>Original principal</small><strong>{money(schedule.principalPaise)}</strong></div>
                        <div><small>Scheduled EMI</small><strong>{money(schedule.regularEmiPaise)}</strong></div>
                        <div><small>Total scheduled interest</small><strong>{money(schedule.totalInterestPaise)}</strong></div>
                        <div><small>Total scheduled payments</small><strong>{money(schedule.totalScheduledPaymentsPaise)}</strong></div>
                      </div>
                      <p className="loan-disclaimer">Schedule v{version.version} · Assumes every instalment is paid on its due date. This is not an actual payment-adjusted outstanding balance.</p>
                      <details className="loan-schedule">
                        <summary>View amortization schedule ({schedule.rows.length} instalments)</summary>
                        <div className="loan-table-scroll"><table><thead><tr>
                          <th>#</th><th>Due date</th><th>Scheduled EMI</th><th>Interest</th><th>Principal</th><th>Projected closing principal</th>
                        </tr></thead><tbody>{schedule.rows.map(row => <tr key={row.installmentNumber}>
                          <td>{row.installmentNumber}</td><td>{row.dueDate}</td><td>{money(row.installmentAmountPaise)}</td>
                          <td>{money(row.interestPaise)}</td><td>{money(row.principalComponentPaise)}</td><td>{money(row.closingPrincipalPaise)}</td>
                        </tr>)}</tbody></table></div>
                      </details>
                      <details className="loan-schedule loan-version-history">
                        <summary>Schedule history ({loan.data.scheduleVersions.length} versions)</summary>
                        {loan.data.scheduleVersions.map(item => { const historical = item.output as LoanAmortizationSchedule; return <div className="loan-version" key={item.version}>
                          <strong>Version {item.version}</strong><span>{item.createdAt}</span>
                          <small>{money(historical.regularEmiPaise)} EMI · {rate(item.input.annualInterestRateBasisPoints)} · {item.input.tenureMonths} months</small>
                        </div>; })}
                      </details>
                      {createElement(LoanPaymentsPanel, { loan })}
                    </article>;
                  })}</div>}
              </>}
            {message && <p className="admin-message" role="status">{message}</p>}
          </> : <div className="admin-placeholder">
            <strong>{section}</strong>
            <p>This section's capability foundation is in place. Its Admin presentation is being connected in a separate, focused slice.</p>
          </div>}
        </div>}
      </div>)}
    </div>
  </section>;
}
