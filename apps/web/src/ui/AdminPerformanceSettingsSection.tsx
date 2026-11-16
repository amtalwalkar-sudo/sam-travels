import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  PERFORMANCE_DRIVER_TARGET_FORM_V1,
  PRE_BUSINESS_COST_FORM_V1,
} from "../../../../packages/application/src";
import { useAdminPerformanceServices } from "./admin-services-context";
import "./AdminFormControls.css";

function rupees(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AdminPerformanceSettingsSection() {
  const services = useAdminPerformanceServices();
  const [target, setTarget] = useState("");
  const [targetCopy, setTargetCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof services.performanceSettings.listEntries>>>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [currentTarget, currentEntries] = await Promise.all([
        services.performanceSettings.getMonthlyTargetPaise().catch(error => {
          if (error instanceof Error && error.message === "performance_driver_target_not_configured") return undefined;
          throw error;
        }),
        services.performanceSettings.listEntries(),
      ]);
      let copy = await services.formRuntime.open(PERFORMANCE_DRIVER_TARGET_FORM_V1, "performance-driver-target");
      if (currentTarget !== undefined && copy.values.monthlyTargetRupees === undefined) {
        copy = await services.formRuntime.update(
          PERFORMANCE_DRIVER_TARGET_FORM_V1, copy, "monthlyTargetRupees", currentTarget / 100,
        );
      }
      setTargetCopy(copy);
      setTarget(currentTarget === undefined ? "" : (currentTarget / 100).toString());
      setEntries(currentEntries);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Performance settings.");
    } finally {
      setLoading(false);
    }
  }, [services]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function saveTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTarget(true);
    setMessage("");
    try {
      const value = Number(target);
      if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) {
        throw new Error("performance_driver_target_invalid");
      }
      let copy = targetCopy ?? await services.formRuntime.open(PERFORMANCE_DRIVER_TARGET_FORM_V1, "performance-driver-target");
      copy = await services.formRuntime.update(PERFORMANCE_DRIVER_TARGET_FORM_V1, copy, "monthlyTargetRupees", value);
      await services.formRuntime.save(PERFORMANCE_DRIVER_TARGET_FORM_V1, copy);
      await refresh();
      setMessage("Monthly Driver Target saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Monthly Driver Target could not be saved.");
    } finally {
      setSavingTarget(false);
    }
  }

  async function addPreBusinessCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEntry(true);
    setMessage("");
    try {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 100)) || !note.trim()) {
        throw new Error("performance_pre_business_cost_invalid");
      }
      const instanceId = crypto.randomUUID();
      let copy = await services.formRuntime.open(PRE_BUSINESS_COST_FORM_V1, instanceId);
      copy = await services.formRuntime.update(PRE_BUSINESS_COST_FORM_V1, copy, "amountRupees", value);
      copy = await services.formRuntime.update(PRE_BUSINESS_COST_FORM_V1, copy, "note", note.trim());
      await services.formRuntime.save(PRE_BUSINESS_COST_FORM_V1, copy);
      setAmount("");
      setNote("");
      await refresh();
      setMessage("Pre-business cost entry saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pre-business cost could not be saved.");
    } finally {
      setSavingEntry(false);
    }
  }

  return <div className="admin-capability-panel">
    <p className="admin-hint">The Driver Target is a fixed rupee amount per calendar month, not a percentage. A selected daily or weekly report does not prorate this target.</p>
    {loading ? <p className="admin-hint">Loading Performance settings…</p> : <>
      <form className="admin-capability-form" onSubmit={saveTarget}>
        <label>Monthly Driver Target (₹)
          <input required type="number" min="0" step="0.01" value={target}
            onChange={event => setTarget(event.target.value)} />
        </label>
        <div className="loan-form-actions">
          <button className="admin-primary" type="submit" disabled={savingTarget || !target}>
            {savingTarget ? "Saving…" : "Save monthly target"}
          </button>
        </div>
        {targetCopy && <small className="admin-hint">Draft status · {targetCopy.status.replaceAll("_", " ")}</small>}
      </form>

      <div className="admin-form-divider" />
      <h3>Pre-business costs</h3>
      <p className="admin-hint">Add each cost incurred before the actual business start date separately, with a note. Each eligible entry is recovered over the 18-month period beginning on that date.</p>
      <form className="admin-capability-form" onSubmit={addPreBusinessCost}>
        <label>Amount (₹)
          <input required type="number" min="0.01" step="0.01" value={amount}
            onChange={event => setAmount(event.target.value)} />
        </label>
        <label>What was this cost for?
          <input required maxLength={240} type="text" value={note}
            onChange={event => setNote(event.target.value)} />
        </label>
        <div className="loan-form-actions">
          <button className="admin-primary" type="submit" disabled={savingEntry || !amount || !note.trim()}>
            {savingEntry ? "Saving…" : "Add pre-business cost"}
          </button>
        </div>
      </form>

      <h3>Saved entries</h3>
      {entries.length === 0 ? <p className="admin-hint">No pre-business costs recorded.</p> : <ul className="admin-performance-cost-list">
        {entries.map(entry => <li key={entry.sourceId}>
          <strong>₹{rupees(entry.amountPaise)}</strong>
          <span>{entry.note}</span>
          <small>Revision {entry.revision}</small>
        </li>)}
      </ul>}
    </>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}
