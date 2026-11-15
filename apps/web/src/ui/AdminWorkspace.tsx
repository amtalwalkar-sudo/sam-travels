import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { AdminWorkspaceShell } from "./AdminWorkspaceShell";
import "./AdminWorkspace.css";
import { BusinessSetupSection, VehicleSection } from "./AdminBusinessVehicle";
import { BusinessStartDateCostAllocationPanel } from "./BusinessStartDateCostAllocationPanel";
import { DriverSection, ComplianceSection, MaintenanceSection } from "./AdminOperations";
import { LoanPaymentsPanel } from "./LoanPaymentsPanel";
import { LoanDetailsForm } from "./LoanDetailsForm";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import { useAdminServices, useAdminIdentityAdapter } from "./admin-services-context";
import type { LoanAmortizationSchedule } from "../../../../packages/features/finance";
import { PersonIdentityPanel } from "./PersonIdentityPanel";
import { PlatformFeeSection, MiscBusinessExpenseSection, TrafficChallanSection } from "./BusinessExpenseAdminForms";

type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
type Loan = Awaited<ReturnType<AdminPresentationServices["financeLoans"]["list"]>>[number];
type LoanScheduleHistory = Awaited<ReturnType<AdminPresentationServices["financeLoanPrepayments"]["getScheduleHistory"]>>;

function money(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(paise / 100);
}
function rate(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2) + "% p.a.";
}
export function AdminWorkspace() {
  const identityAdapter = useAdminIdentityAdapter();
  const services = useAdminServices();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanScheduleHistories, setLoanScheduleHistories] = useState<Record<string, LoanScheduleHistory>>({});
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [vehicleRecords, loanRecords] = await Promise.all([
        services.vehicles.list(),
        services.financeLoans.list(),
      ]);
      const histories = await Promise.all(loanRecords.map(async loan =>
        [loan.id, await services.financeLoanPrepayments.getScheduleHistory(loan.id)] as const));
      setVehicles(vehicleRecords);
      setLoans(loanRecords);
      setLoanScheduleHistories(Object.fromEntries(histories));
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

  const sections = [
    { id: "business-setup", label: "Business setup", content: <><BusinessSetupSection /><BusinessStartDateCostAllocationPanel /></> },
    { id: "vehicle", label: "Vehicle", content: <VehicleSection /> },
    { id: "driver", label: "Driver", content: <DriverSection /> },
    { id: "compliance", label: "Compliance", content: <><ComplianceSection /><TrafficChallanSection /></> },
    { id: "finance", label: "Finance", content: <>
      <div className="admin-vehicle-context">
        <label htmlFor="admin-vehicle">Selected vehicle</label>
        <select id="admin-vehicle" value={selectedVehicleId} onChange={event => setSelectedVehicleId(event.target.value)}>
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
          <LoanDetailsForm vehicleId={selectedVehicle.id} vehicleActive={selectedVehicle.data.lifecycleState === "active"} onChanged={refresh} />
          {vehicleLoans.length === 0 ? <p className="admin-hint">No loans recorded for this vehicle yet.</p> :
            <div className="loan-record-list">{vehicleLoans.map(loan => {
              const originalVersion = loan.data.scheduleVersions[loan.data.currentScheduleVersion - 1];
              const originalSchedule = originalVersion.output as LoanAmortizationSchedule;
              const history = loanScheduleHistories[loan.id];
              const activeVersion = history?.currentScheduleVersion ?? loan.data.currentScheduleVersion;
              const activeSchedule = history?.versions.find(item => item.version === activeVersion);
              const scheduleRows = activeSchedule?.rows ?? originalSchedule.rows;
              const schedulePrincipal = activeSchedule?.principalPaise ?? originalSchedule.principalPaise;
              const scheduleEmi = activeSchedule?.regularEmiPaise ?? originalSchedule.regularEmiPaise;
              const scheduleInterest = activeSchedule?.totalInterestPaise ?? originalSchedule.totalInterestPaise;
              const schedulePayments = activeSchedule?.totalScheduledPaymentsPaise ?? originalSchedule.totalScheduledPaymentsPaise;
              const scheduleLabel = activeSchedule?.label ?? "Original schedule";
              const scheduleHistory = history?.versions ?? loan.data.scheduleVersions.map(item => {
                const historical = item.output as LoanAmortizationSchedule;
                return { version: item.version, effectiveDate: item.effectiveDate, createdAt: item.createdAt,
                  label: "Original schedule", rows: historical.rows, regularEmiPaise: historical.regularEmiPaise,
                  principalPaise: historical.principalPaise, totalInterestPaise: historical.totalInterestPaise,
                  totalScheduledPaymentsPaise: historical.totalScheduledPaymentsPaise };
              });
              return <article className="loan-record" key={loan.id}>
                <div className="loan-record-heading"><div><strong>{loan.data.details.loanName}</strong><small>{loan.data.details.lenderName} · {rate(loan.data.details.annualInterestRateBasisPoints)}</small></div></div>
                <div className="loan-metrics">
                  <div><small>Active schedule principal</small><strong>{money(schedulePrincipal)}</strong></div>
                  <div><small>Scheduled EMI</small><strong>{money(scheduleEmi)}</strong></div>
                  <div><small>Remaining scheduled interest</small><strong>{money(scheduleInterest)}</strong></div>
                  <div><small>Remaining scheduled payments</small><strong>{money(schedulePayments)}</strong></div>
                </div>
                <p className="loan-disclaimer">Schedule v{activeVersion} · {scheduleLabel}. Assumes each remaining instalment is paid on its due date; actual outstanding is determined from allocated payment history.</p>
                <details className="loan-schedule">
                  <summary>View active amortization schedule ({scheduleRows.length} instalments)</summary>
                  <div className="loan-table-scroll"><table><thead><tr><th>#</th><th>Due date</th><th>Scheduled EMI</th><th>Interest</th><th>Principal</th><th>Projected closing principal</th></tr></thead>
                    <tbody>{scheduleRows.map(row => <tr key={row.installmentNumber}>
                      <td>{row.installmentNumber}</td><td>{row.dueDate}</td><td>{money(row.installmentAmountPaise)}</td>
                      <td>{money(row.interestPaise)}</td><td>{money(row.principalComponentPaise)}</td><td>{money(row.closingPrincipalPaise)}</td>
                    </tr>)}</tbody></table></div>
                </details>
                <details className="loan-schedule loan-version-history">
                  <summary>Schedule history ({scheduleHistory.length} versions)</summary>
                  {scheduleHistory.map(item => <div className="loan-version" key={item.version}>
                    <strong>Version {item.version} · {item.label}</strong><span>{item.createdAt}</span>
                    <small>{money(item.regularEmiPaise)} EMI · {item.rows.length} instalments · effective {item.effectiveDate}</small>
                  </div>)}
                </details>
                {createElement(LoanPaymentsPanel, { loan, onChanged: refresh })}
              </article>;
            })}</div>}
        </>}
      <PlatformFeeSection />
      <MiscBusinessExpenseSection />
      {message && <p className="admin-message" role="status">{message}</p>}
    </> },
    { id: "maintenance", label: "Maintenance", content: <MaintenanceSection /> },
  ];
  return <AdminWorkspaceShell identityPanel={<PersonIdentityPanel adapter={identityAdapter} />}
    sections={sections} initialExpandedSection="finance" />;
}
