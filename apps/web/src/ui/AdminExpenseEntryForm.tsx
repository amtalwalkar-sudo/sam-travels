import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  PLATFORM_FEE_FORM_V1, MISC_BUSINESS_EXPENSE_FORM_V1, TRAFFIC_CHALLAN_FORM_V1,
  type FormDefinition, type FormFieldDefinition,
} from "../../../../packages/application/src";
import { useAdminFormRuntime } from "./admin-services-context";
import "./AdminFormControls.css";

type ExpenseDefinition = typeof PLATFORM_FEE_FORM_V1 | typeof MISC_BUSINESS_EXPENSE_FORM_V1 | typeof TRAFFIC_CHALLAN_FORM_V1;

function ExpenseEntryForm({ definition, heading, description }: {
  definition: ExpenseDefinition; heading: string; description: string;
}) {
  const services = useAdminFormRuntime();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef = useRef<typeof copy>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const start = useCallback(async () => {
    const [drafts, operatingVehicle] = await Promise.all([
      services.formRuntime.listDrafts(definition as FormDefinition), services.operatingConfiguration.getVehicleForReadOnly(),
    ]);
    const resumable = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    let next = resumable ?? await services.formRuntime.open(definition as FormDefinition, crypto.randomUUID());
    for (const field of ["vehicleId"] as const) {
      if (!definition.fields.some(item => item.id === field)) continue;
      const expected = operatingVehicle.id;
      if (next.values[field] !== undefined && next.values[field] !== expected) {
        throw new Error("business_expense_draft_operating_context_mismatch");
      }
      if (next.status !== "pending" && next.values[field] === undefined) {
        next = await services.formRuntime.update(definition as FormDefinition, next, field, expected);
      }
      if (next.status === "pending" && next.values[field] !== expected) {
        throw new Error("business_expense_pending_operating_context_mismatch");
      }
    }
    copyRef.current = next;
    setCopy(next);
    // A pending intent is immutable; render the exact payload that will be replayed.
    setValues({ ...(next.status === "pending" && next.submission ? next.submission.values : next.values) });
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
      const commandSnapshot = await services.operatingConfiguration.get();
      if (definition.fields.some(item => item.id === "vehicleId") && commandSnapshot.vehicleId !== current.values.vehicleId) {
        throw new Error("operating_configuration_stale");
      }
      let commandCopy = current;
      if (definition.fields.some(item => item.id === "driverId") && current.status !== "pending" &&
          current.values.driverId !== commandSnapshot.driverId) {
        commandCopy = await services.formRuntime.update(definition as FormDefinition, current, "driverId", commandSnapshot.driverId);
        copyRef.current = commandCopy;
        setCopy(commandCopy);
      }
      await services.operatingConfiguration.assertCurrent(commandSnapshot);
      await services.formRuntime.save(definition as FormDefinition, commandCopy);
      setMessage("Saved.");
      copyRef.current = undefined; setCopy(undefined); setValues({});
      const nextVehicle = await services.operatingConfiguration.getVehicleForReadOnly();
      let next = await services.formRuntime.open(definition as FormDefinition, crypto.randomUUID());
      if (definition.fields.some(item => item.id === "vehicleId")) {
        next = await services.formRuntime.update(definition as FormDefinition, next, "vehicleId", nextVehicle.id);
      }
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
          {field.type === "checkbox" ? <input type="checkbox" checked={values[field.id] === true} disabled={busy || copy?.status === "pending"}
            onChange={event => change(field, event.target.checked)} /> :
          field.type === "select" ? <select required={field.required} value={String(values[field.id] ?? "")} disabled={busy || copy?.status === "pending"}
            onChange={event => change(field, event.target.value)}>
              <option value="">Select</option>
              {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
            </select> :
          <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
            required={field.required} maxLength={field.maxLength} disabled={busy || copy?.status === "pending"}
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

export { ExpenseEntryForm };
