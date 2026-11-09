import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminPresentationServices, FormWorkingCopy, MaintenanceExpenseItemV1 } from "../../../../packages/application/src";
import {
  MAINTENANCE_VISIT_FORM_V1, MAINTENANCE_EXPENSE_FORM_V1, MAINTENANCE_RATE_FORM_V1,
} from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";
import "./AdminWorkspace.css";

type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
type Maintenance = Awaited<ReturnType<AdminPresentationServices["maintenance"]["listVehicleRecords"]>>;
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const optional = (value: string) => value.trim() || undefined;

type ItemDraft = { id: string; description: string; amount: string };
const newItem = (): ItemDraft => ({ id: crypto.randomUUID(), description: "", amount: "" });
type RecordMode = "visit" | "expense";
type ActiveForm = RecordMode | "rate" | null;

export function MaintenanceSection() {
  const services = useAdminServices();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [records, setRecords] = useState<Maintenance | null>(null);
  const [reminders, setReminders] = useState<Awaited<ReturnType<AdminPresentationServices["maintenance"]["getServiceReminderStates"]>>>([]);
  const [drafts, setDrafts] = useState<readonly FormWorkingCopy[]>([]);
  const [mode, setMode] = useState<RecordMode>("visit");
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [copy, setCopy] = useState<FormWorkingCopy>();
  const copyRef = useRef<FormWorkingCopy>();
  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const updateError = useRef<unknown>(null);
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [odometer, setOdometer] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextKm, setNextKm] = useState("");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const definitionFor = (form: ActiveForm) => form === "visit" ? MAINTENANCE_VISIT_FORM_V1
    : form === "expense" ? MAINTENANCE_EXPENSE_FORM_V1
    : form === "rate" ? MAINTENANCE_RATE_FORM_V1 : undefined;

  const loadDrafts = useCallback(async () => {
    const [visits, expenses, rates] = await Promise.all([
      services.formRuntime.listDrafts(MAINTENANCE_VISIT_FORM_V1),
      services.formRuntime.listDrafts(MAINTENANCE_EXPENSE_FORM_V1),
      services.formRuntime.listDrafts(MAINTENANCE_RATE_FORM_V1),
    ]);
    setDrafts([...visits, ...expenses, ...rates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }, [services]);

  const loadVehicleRecords = useCallback(async (id: string) => {
    if (!id) { setRecords(null); setReminders([]); return; }
    const [history, states] = await Promise.all([
      services.maintenance.listVehicleRecords(id),
      services.maintenance.getServiceReminderStates(id, today()),
    ]);
    setRecords(history);
    setReminders(states.filter(item => item.dateDue || item.kilometreStatus === "due" || item.kilometreStatus === "odometer_unavailable"));
  }, [services]);

  const refresh = useCallback(async (requestedId: string) => {
    try {
      const v = await services.vehicles.list();
      setVehicles(v);
      const chosen = requestedId || v.find(x => x.data.lifecycleState === "active")?.id || v[0]?.id || "";
      setVehicleId(chosen);
      await Promise.all([loadVehicleRecords(chosen), loadDrafts()]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load maintenance records.");
    }
  }, [services, loadVehicleRecords, loadDrafts]);

  useEffect(() => { void refresh(""); }, [refresh]);

  async function changeVehicle(id: string) {
    setVehicleId(id);
    await loadVehicleRecords(id);
  }

  function activateDraft(workingCopy: FormWorkingCopy, form: Exclude<ActiveForm, null>) {
    copyRef.current = workingCopy;
    setCopy(workingCopy);
    setActiveForm(form);
    updateQueue.current = Promise.resolve();
    updateError.current = null;
    const values = workingCopy.values;
    if (form === "rate") {
      setRate(values.ratePaisePerKm === undefined ? "" : (Number(values.ratePaisePerKm) / 100).toFixed(2));
      return;
    }
    setMode(form);
    setDate(String(values[form === "visit" ? "maintenanceDate" : "expenseDate"] ?? today()));
    setTitle(String(values[form === "visit" ? "maintenanceType" : "expenseName"] ?? ""));
    setDescription(String(values.description ?? ""));
    setProvider(String(values.provider ?? ""));
    setOdometer(values.odometerKm === undefined ? "" : String(values.odometerKm));
    setNextDate(String(values.nextServiceDate ?? ""));
    setNextKm(values.nextServiceKm === undefined ? "" : String(values.nextServiceKm));
    setAmount(values.amountPaise === undefined ? "" : (Number(values.amountPaise) / 100).toFixed(2));
    if (form === "visit") {
      try {
        const parsed = JSON.parse(String(values.itemsJson ?? "[]")) as Array<Record<string, unknown>>;
        setItems(parsed.map(item => ({
          id: String(item.id ?? crypto.randomUUID()),
          description: String(item.description ?? ""),
          amount: typeof item.amount === "string" ? item.amount
            : typeof item.amountPaise === "number" ? (item.amountPaise / 100).toFixed(2) : "",
        })).length ? parsed.map(item => ({
          id: String(item.id ?? crypto.randomUUID()),
          description: String(item.description ?? ""),
          amount: typeof item.amount === "string" ? item.amount
            : typeof item.amountPaise === "number" ? (item.amountPaise / 100).toFixed(2) : "",
        })) : [newItem()]);
      } catch { setItems([newItem()]); }
    } else setItems([newItem()]);
    setMessage("");
  }

  async function startNew(form: Exclude<ActiveForm, null>) {
    if (!vehicleId) return;
    setBusy(true);
    setMessage("");
    try {
      const definition = definitionFor(form)!;
      // The same UUID is the durable draft identity and the owning service command ID.
      let workingCopy = await services.formRuntime.open(definition, crypto.randomUUID());
      const initial: Record<string, unknown> = form === "visit" ? {
        vehicleId, maintenanceDate: today(), maintenanceType: "", description: "",
        itemsJson: JSON.stringify([newItem()]), odometerKm: undefined, provider: "",
        nextServiceDate: "", nextServiceKm: undefined,
      } : form === "expense" ? {
        vehicleId, expenseDate: today(), expenseName: "", description: "",
        amountPaise: undefined, odometerKm: undefined, provider: "",
      } : { vehicleId, ratePaisePerKm: undefined };
      for (const [field, value] of Object.entries(initial)) {
        if (workingCopy.values[field] === undefined) {
          workingCopy = await services.formRuntime.update(definition, workingCopy, field, value);
        }
      }
      activateDraft(workingCopy, form);
      await loadDrafts();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start maintenance form.");
    } finally { setBusy(false); }
  }

  async function resumeDraft(draft: FormWorkingCopy) {
    const form: ActiveForm = draft.formId === MAINTENANCE_VISIT_FORM_V1.id ? "visit"
      : draft.formId === MAINTENANCE_EXPENSE_FORM_V1.id ? "expense"
      : draft.formId === MAINTENANCE_RATE_FORM_V1.id ? "rate" : null;
    const definition = definitionFor(form);
    if (!definition) return;
    if (draft.values.vehicleId !== vehicleId) {
      setMessage("Select the vehicle belonging to this draft before resuming it.");
      return;
    }
    setBusy(true);
    try {
      const restored = await services.formRuntime.open(definition, draft.instanceId);
      activateDraft(restored, form as Exclude<ActiveForm, null>);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not resume maintenance draft.");
    } finally { setBusy(false); }
  }

  function queueFieldUpdate(fieldId: string, value: unknown) {
    const form = activeForm;
    const definition = definitionFor(form);
    if (!definition) return;
    updateQueue.current = updateQueue.current.then(async () => {
      const current = copyRef.current;
      if (!current) return;
      const next = await services.formRuntime.update(definition, current, fieldId, value);
      copyRef.current = next;
      setCopy(next);
    }).catch(error => {
      updateError.current = error;
      setMessage(error instanceof Error ? error.message : "Maintenance draft could not be saved.");
    });
  }

  function updateCommonField(field: "date" | "title" | "description" | "provider" | "odometer" | "nextDate" | "nextKm" | "amount", value: string) {
    if (field === "date") setDate(value);
    if (field === "title") setTitle(value);
    if (field === "description") setDescription(value);
    if (field === "provider") setProvider(value);
    if (field === "odometer") setOdometer(value);
    if (field === "nextDate") setNextDate(value);
    if (field === "nextKm") setNextKm(value);
    if (field === "amount") setAmount(value);
    const form = activeForm;
    let fieldId: string = field;
    let stored: unknown = value;
    if (field === "date") fieldId = form === "visit" ? "maintenanceDate" : "expenseDate";
    if (field === "title") fieldId = form === "visit" ? "maintenanceType" : "expenseName";
    if (field === "odometer") { fieldId = "odometerKm"; stored = value.trim() ? Number(value) : undefined; }
    if (field === "nextDate") fieldId = "nextServiceDate";
    if (field === "nextKm") { fieldId = "nextServiceKm"; stored = value.trim() ? Number(value) : undefined; }
    if (field === "amount") { fieldId = "amountPaise"; stored = value.trim() ? Math.round(Number(value) * 100) : undefined; }
    queueFieldUpdate(fieldId, stored);
  }

  function updateItems(next: ItemDraft[]) {
    setItems(next);
    queueFieldUpdate("itemsJson", JSON.stringify(next));
  }

  async function closeActiveForm() {
    await updateQueue.current;
    copyRef.current = undefined;
    setCopy(undefined);
    setActiveForm(null);
    setMessage("Draft retained. You can resume it later.");
    await loadDrafts();
  }

  async function saveRecord(e: FormEvent) {
    e.preventDefault();
    const form = activeForm;
    const definition = definitionFor(form);
    if (!definition || (form !== "visit" && form !== "expense")) return;
    setBusy(true);
    setMessage("");
    try {
      await updateQueue.current;
      if (updateError.current) throw updateError.current;
      let current = copyRef.current;
      if (!current) throw new Error("maintenance_form_not_ready");
      if (form === "visit") {
        const mapped: MaintenanceExpenseItemV1[] = items.map(item => {
          const amountValue = Number(item.amount);
          if (!item.description.trim() || !item.amount.trim() || !Number.isFinite(amountValue) || amountValue < 0) {
            throw new Error("Enter a description and valid non-negative amount for every service cost item.");
          }
          const amountPaise = Math.round(amountValue * 100);
          if (!Number.isSafeInteger(amountPaise)) throw new Error("Service cost amount is out of range.");
          return { id: item.id, description: item.description.trim(), amountPaise };
        });
        current = await services.formRuntime.update(definition, current, "itemsJson", JSON.stringify(mapped));
        copyRef.current = current;
        setCopy(current);
      }
      await services.formRuntime.save(definition, current);
      copyRef.current = undefined;
      setCopy(undefined);
      setActiveForm(null);
      setMessage(form === "visit" ? "Service visit saved." : "Maintenance expense saved.");
      await Promise.all([loadVehicleRecords(vehicleId), loadDrafts()]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Maintenance record could not be saved.");
    } finally { setBusy(false); }
  }

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    if (activeForm !== "rate") return;
    setBusy(true);
    setMessage("");
    try {
      await updateQueue.current;
      if (updateError.current) throw updateError.current;
      const current = copyRef.current;
      if (!current) throw new Error("maintenance_rate_form_not_ready");
      await services.formRuntime.save(MAINTENANCE_RATE_FORM_V1, current);
      copyRef.current = undefined;
      setCopy(undefined);
      setActiveForm(null);
      setMessage("Per-kilometre rate saved with effective-date history.");
      await Promise.all([loadVehicleRecords(vehicleId), loadDrafts()]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Rate could not be saved.");
    } finally { setBusy(false); }
  }

  const total = (records?.visits.reduce((sum, item) => sum + item.data.totalPaise, 0) ?? 0)
    + (records?.expenses.reduce((sum, item) => sum + item.data.amountPaise, 0) ?? 0);
  const vehicleDrafts = drafts.filter(draft => draft.values.vehicleId === vehicleId);

  return <div className="admin-capability-panel">
    <p className="admin-hint">Record actual service visits and itemised costs, general expenses, odometer readings and next-service reminders. Historical dates are accepted. In-progress forms are saved as recoverable drafts and can be resumed after reopening the app.</p>
    <div className="admin-vehicle-context"><label>Vehicle</label><select value={vehicleId} onChange={e => void changeVehicle(e.target.value)}><option value="">Select vehicle</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.data.registrationNumber}</option>)}</select></div>
    {vehicleId && <>
      <div className="loan-metrics">
        <div><small>Total recorded maintenance cost</small><strong>{money(total)}</strong></div>
        <div><small>Service visits</small><strong>{records?.visits.length ?? 0}</strong></div>
        <div><small>General expenses</small><strong>{records?.expenses.length ?? 0}</strong></div>
        <div><small>Rate history</small><strong>{records?.rateHistory.length ?? 0} entries</strong></div>
      </div>

      {vehicleDrafts.length > 0 && <div className="admin-capability-form">
        <strong>Unfinished maintenance drafts</strong>
        {vehicleDrafts.map(draft => <article className="admin-capability-record" key={draft.instanceId}>
          <div><strong>{draft.formId === MAINTENANCE_VISIT_FORM_V1.id ? "Service visit" : draft.formId === MAINTENANCE_EXPENSE_FORM_V1.id ? "General expense" : "Per-kilometre rate"}</strong>
            <small>Last saved {new Date(draft.updatedAt).toLocaleString("en-IN")} · revision {draft.revision}</small></div>
          <button className="admin-secondary" type="button" disabled={busy || activeForm !== null} onClick={() => void resumeDraft(draft)}>Resume draft</button>
        </article>)}
      </div>}

      {!activeForm && <div className="admin-capability-form">
        <strong>New maintenance record</strong>
        <div className="admin-vehicle-context"><label>Record type</label><select value={mode} onChange={e => setMode(e.target.value as RecordMode)}><option value="visit">Service visit</option><option value="expense">General expense</option></select></div>
        <div className="loan-form-actions">
          <button className="admin-primary" type="button" disabled={busy} onClick={() => void startNew(mode)}>Start {mode === "visit" ? "service visit" : "general expense"}</button>
          <button className="admin-secondary" type="button" disabled={busy} onClick={() => void startNew("rate")}>Change per-kilometre rate</button>
        </div>
      </div>}

      {activeForm && activeForm !== "rate" && <form className="admin-capability-form" onSubmit={saveRecord}>
        <strong>{activeForm === "visit" ? "Service visit" : "General maintenance expense"}</strong>
        <div className="loan-form-grid">
          <label>{activeForm === "visit" ? "Maintenance type" : "Expense name"}<input required value={title} onChange={e => updateCommonField("title", e.target.value)} /></label>
          <label>Date<input required type="date" value={date} onChange={e => updateCommonField("date", e.target.value)} /></label>
          <label>Provider / garage (optional)<input value={provider} onChange={e => updateCommonField("provider", e.target.value)} /></label>
          <label>Odometer km (optional)<input type="number" min="0" step="1" value={odometer} onChange={e => updateCommonField("odometer", e.target.value)} /></label>
          {activeForm === "expense" && <label>Amount (₹)<input required type="number" min="0" step="0.01" value={amount} onChange={e => updateCommonField("amount", e.target.value)} /></label>}
          {activeForm === "visit" && <>
            <label>Next service date (optional)<input type="date" min={date} value={nextDate} onChange={e => updateCommonField("nextDate", e.target.value)} /></label>
            <label>Next service at km (optional)<input type="number" min="0" step="1" value={nextKm} onChange={e => updateCommonField("nextKm", e.target.value)} /></label>
          </>}
          <label className="admin-wide-field">Description<input required value={description} onChange={e => updateCommonField("description", e.target.value)} /></label>
        </div>
        {activeForm === "visit" && <div className="admin-capability-form">
          <strong>Itemised service costs</strong>
          {items.map((item, index) => <div className="loan-form-grid" key={item.id}>
            <label>Item {index + 1}<input required value={item.description} onChange={e => updateItems(items.map(row => row.id === item.id ? { ...row, description: e.target.value } : row))} /></label>
            <label>Amount (₹)<input required type="number" min="0" step="0.01" value={item.amount} onChange={e => updateItems(items.map(row => row.id === item.id ? { ...row, amount: e.target.value } : row))} /></label>
          </div>)}
          <button className="admin-secondary" type="button" onClick={() => updateItems([...items, newItem()])}>Add cost item</button>
        </div>}
        <div className="loan-form-actions">
          <button className="admin-primary" disabled={busy || !copy}>{busy ? "Saving…" : "Save maintenance record"}</button>
          <button className="admin-secondary" type="button" disabled={busy} onClick={() => void closeActiveForm()}>Close and keep draft</button>
        </div>
        {copy && <small className="admin-hint">Draft status · {copy.status.replaceAll("_", " ")} · revision {copy.revision}</small>}
      </form>}

      {activeForm === "rate" && <form className="admin-capability-form" onSubmit={saveRate}>
        <strong>Per-kilometre rate</strong>
        <p className="admin-hint">This is an Admin-entered rate with effective-date history. It is not automatically calculated from actual maintenance expenses.</p>
        <label>New rate (₹ per km)<input required type="number" min="0" step="0.01" value={rate} onChange={e => {
          setRate(e.target.value);
          queueFieldUpdate("ratePaisePerKm", e.target.value.trim() ? Math.round(Number(e.target.value) * 100) : undefined);
        }} /></label>
        <div className="loan-form-actions">
          <button className="admin-secondary" disabled={busy || !copy}>Save rate</button>
          <button className="admin-secondary" type="button" disabled={busy} onClick={() => void closeActiveForm()}>Close and keep draft</button>
        </div>
        {copy && <small className="admin-hint">Draft status · {copy.status.replaceAll("_", " ")} · revision {copy.revision}</small>}
      </form>}

      {records?.rateHistory.length ? <div className="admin-capability-form">
        <strong>Per-kilometre rate history</strong>
        {records.rateHistory.map((entry, index) => <small key={entry.effectiveFrom + "-" + index}>{money(entry.ratePaisePerKm)} / km from {entry.effectiveFrom}{entry.isDefault ? " · Default rate" : " · Admin entered"}</small>)}
      </div> : null}
      {reminders.length > 0 && <div className="admin-capability-form">
        <strong>Service reminders</strong>
        {reminders.map(item => <small key={item.visit.id}>{item.visit.data.maintenanceType} · {item.dateDue ? "Date due " + (item.visit.data.nextServiceDate ?? "") : ""}{item.kilometreStatus === "due" ? " · Kilometre threshold reached (" + (item.latestOdometerKm ?? "unknown") + " km)" : item.kilometreStatus === "odometer_unavailable" ? " · Odometer reading unavailable" : ""}</small>)}
      </div>}
      <details className="loan-schedule">
        <summary>Maintenance history ({(records?.visits.length ?? 0) + (records?.expenses.length ?? 0)} records)</summary>
        {records?.visits.map(visit => <article className="admin-capability-record" key={visit.id}><div>
          <strong>{visit.data.maintenanceType} · {money(visit.data.totalPaise)}</strong>
          <small>{visit.data.maintenanceDate} · {visit.data.provider ?? "No provider"} · {visit.data.odometerKm ?? "No odometer"} km</small>
          <small>{visit.data.items.map(item => item.description + " " + money(item.amountPaise)).join(" · ")}</small>
        </div></article>)}
        {records?.expenses.map(expense => <article className="admin-capability-record" key={expense.id}><div>
          <strong>{expense.data.expenseName} · {money(expense.data.amountPaise)}</strong>
          <small>{expense.data.expenseDate} · {expense.data.description}</small>
        </div></article>)}
      </details>
    </>}
    {!vehicleId && <p className="admin-hint">Add a vehicle before recording maintenance.</p>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}
