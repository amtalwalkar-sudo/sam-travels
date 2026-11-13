import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  PLATFORM_FEE_FORM_V1,
  MISC_BUSINESS_EXPENSE_FORM_V1,
  TRAFFIC_CHALLAN_FORM_V1,
  type FormDefinition,
  type FormFieldDefinition,
} from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";
import "./AdminWorkspace.css";

type ExpenseDefinition = typeof PLATFORM_FEE_FORM_V1 | typeof MISC_BUSINESS_EXPENSE_FORM_V1 | typeof TRAFFIC_CHALLAN_FORM_V1;

function ExpenseEntryForm({ definition, heading, description }: {
  definition: ExpenseDefinition; heading: string; description: string;
}) {
  const services = useAdminServices();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef = useRef<typeof copy>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const start = useCallback(async () => {
    const drafts = await services.formRuntime.listDrafts(definition as FormDefinition);
    const resumable = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const next = resumable ?? await services.formRuntime.open(definition as FormDefinition, crypto.randomUUID());
    copyRef.current = next;
    setCopy(next);
    setValues({ ...next.values });
  }, [definition, services]);

  useEffect(() => { void start().catch(error => setMessage(error instanceof Error ? error.message : "Could not open the expense form.")); }, [start]);

  function change(field: FormFieldDefinition, value: unknown) {
    setValues(previous => ({ ...previous, [field.id]: value }));
    queue.current = queue.current.then(async () => {
      const current = copyRef.current;
      if (!current) return;
      const next = await services.formRuntime.update(definition as FormDefinition, current, field.id, value);
      copyRef.current = next;
      setCopy(next);
    }).catch(error => setMessage(error instanceof Error ? error.message : "Draft could not be saved."));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await queue.current;
      const current = copyRef.current;
      if (!current) throw new Error("business_expense_form_not_ready");
      await services.formRuntime.save(definition as FormDefinition, current);
      setMessage("Saved.");
      copyRef.current = undefined; setCopy(undefined); setValues({});
      const next = await services.formRuntime.open(definition as FormDefinition, crypto.randomUUID());
      copyRef.current = next; setCopy(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this expense.");
    } finally { setBusy(false); }
  }

  return <section className="admin-capability-panel">
    <h3>{heading}</h3>
    <p className="admin-hint">{description}</p>
    <form className="admin-capability-form" onSubmit={save}>
      <div className="loan-form-grid">
        {definition.fields.map(field => <label key={field.id}>
          {field.label}
          {field.type === "checkbox" ? <input type="checkbox" checked={values[field.id] === true}
            onChange={event => change(field, event.target.checked)} /> :
          field.type === "select" ? <select required={field.required} value={String(values[field.id] ?? "")}
            onChange={event => change(field, event.target.value)}>
              <option value="">Select</option>
              {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
            </select> :
          <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
            required={field.required} maxLength={field.maxLength}
            min={field.type === "number" ? "0.01" : undefined}
            step={field.type === "number" ? "0.01" : undefined}
            value={String(values[field.id] ?? "")}
            onChange={event => change(field, field.type === "number"
              ? (event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value)} />}
        </label>)}
      </div>
      <div className="loan-form-actions">
        <button className="admin-primary" type="submit" disabled={busy || !copy}>{busy ? "Saving…" : "Save expense"}</button>
        {copy && <small className="admin-hint">Draft · {copy.status.replaceAll("_", " ")}</small>}
      </div>
    </form>
    {message && <p className="admin-message" role="status">{message}</p>}
  </section>;
}

export function PlatformFeeSection() {
  return <ExpenseEntryForm definition={PLATFORM_FEE_FORM_V1} heading="Platform Fees"
    description="Record fees from actual trip or settlement evidence. Mark fees already deducted from income to prevent double-counting." />;
}
export function MiscBusinessExpenseSection() {
  return <ExpenseEntryForm definition={MISC_BUSINESS_EXPENSE_FORM_V1} heading="Miscellaneous Business Expenses"
    description="Record other business costs with a category and optional vehicle or driver attribution." />;
}
export function TrafficChallanSection() {
  return <ExpenseEntryForm definition={TRAFFIC_CHALLAN_FORM_V1} heading="Traffic Challans"
    description="Record each challan against its vehicle. Challans remain separate from normal operating costs and are included in full-cost reporting." />;
}
