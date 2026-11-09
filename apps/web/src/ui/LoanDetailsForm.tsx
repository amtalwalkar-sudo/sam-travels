import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminPresentationServices, FormWorkingCopy } from "../../../../packages/application/src";
import { LOAN_DETAILS_FORM_V1 } from "../../../../packages/application/src";
import { useAdminServices } from "./admin-services-context";

type Loan = Awaited<ReturnType<AdminPresentationServices["financeLoans"]["list"]>>[number];
type Props = {
  vehicleId: string;
  vehicleActive: boolean;
  requestedEdit: Loan | null;
  onEditConsumed: () => void;
  onChanged: () => Promise<void>;
};
type Values = {
  loanName: string; lenderName: string; loanAccountReference: string;
  principalRupees: string; annualRatePercent: string; loanStartDate: string;
  tenureMonths: string; firstEmiDate: string;
};
const EMPTY: Values = {
  loanName: "", lenderName: "", loanAccountReference: "", principalRupees: "",
  annualRatePercent: "", loanStartDate: "", tenureMonths: "", firstEmiDate: "",
};
const fromCopy = (copy: FormWorkingCopy): Values => ({
  loanName: String(copy.values.loanName ?? ""),
  lenderName: String(copy.values.lenderName ?? ""),
  loanAccountReference: String(copy.values.loanAccountReference ?? ""),
  principalRupees: typeof copy.values.principalPaise === "number" ? (copy.values.principalPaise / 100).toFixed(2) : "",
  annualRatePercent: typeof copy.values.annualInterestRateBasisPoints === "number" ? (copy.values.annualInterestRateBasisPoints / 100).toFixed(2) : "",
  loanStartDate: String(copy.values.loanStartDate ?? ""),
  tenureMonths: copy.values.tenureMonths === undefined ? "" : String(copy.values.tenureMonths),
  firstEmiDate: String(copy.values.firstEmiDate ?? ""),
});

export function LoanDetailsForm({ vehicleId, vehicleActive, requestedEdit, onEditConsumed, onChanged }: Props) {
  const services = useAdminServices();
  const [drafts, setDrafts] = useState<readonly FormWorkingCopy[]>([]);
  const [copy, setCopy] = useState<FormWorkingCopy | null>(null);
  const copyRef = useRef<FormWorkingCopy | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const updateError = useRef<unknown>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadDrafts = useCallback(async () => {
    const rows = await services.formRuntime.listDrafts(LOAN_DETAILS_FORM_V1);
    setDrafts(rows.filter(row => row.values.vehicleId === vehicleId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
  }, [services, vehicleId]);

  useEffect(() => { void loadDrafts().catch(error => setMessage(error instanceof Error ? error.message : "Could not load loan drafts.")); }, [loadDrafts]);

  function activate(next: FormWorkingCopy) {
    copyRef.current = next;
    setCopy(next);
    setValues(fromCopy(next));
    queue.current = Promise.resolve();
    updateError.current = null;
    setMessage("");
  }

  async function startNew() {
    if (!vehicleId || !vehicleActive) return;
    setBusy(true);
    try {
      let next = await services.formRuntime.open(LOAN_DETAILS_FORM_V1, crypto.randomUUID());
      const initial: Record<string, unknown> = {
        vehicleId, loanName: "", lenderName: "", loanAccountReference: "",
        principalPaise: undefined, annualInterestRateBasisPoints: undefined,
        loanStartDate: "", tenureMonths: undefined, firstEmiDate: "",
      };
      for (const [field, value] of Object.entries(initial)) {
        if (next.values[field] === undefined) next = await services.formRuntime.update(LOAN_DETAILS_FORM_V1, next, field, value);
      }
      activate(next);
      await loadDrafts();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start loan details."); }
    finally { setBusy(false); }
  }

  async function startEdit(loan: Loan) {
    setBusy(true);
    try {
      let next = await services.formRuntime.open(LOAN_DETAILS_FORM_V1, crypto.randomUUID());
      const initial: Record<string, unknown> = {
        vehicleId: loan.data.details.vehicleId,
        loanName: loan.data.details.loanName,
        lenderName: loan.data.details.lenderName,
        loanAccountReference: loan.data.details.loanAccountReference ?? "",
        principalPaise: loan.data.details.principalPaise,
        annualInterestRateBasisPoints: loan.data.details.annualInterestRateBasisPoints,
        loanStartDate: loan.data.details.loanStartDate,
        tenureMonths: loan.data.details.tenureMonths,
        firstEmiDate: loan.data.details.firstEmiDate,
        _recordId: loan.id,
        _recordRevision: loan.revision,
      };
      // An existing unfinished edit is resumed as-is; a fresh edit captures the current record revision.
      if (Object.keys(next.values).length === 0) {
        for (const [field, value] of Object.entries(initial)) next = await services.formRuntime.update(LOAN_DETAILS_FORM_V1, next, field, value);
      }
      activate(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open loan details."); }
    finally { setBusy(false); onEditConsumed(); }
  }

  useEffect(() => {
    if (requestedEdit && requestedEdit.data.details.vehicleId === vehicleId) void startEdit(requestedEdit);
    // startEdit is intentionally driven only by the parent request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedEdit?.id, vehicleId]);

  async function resume(draft: FormWorkingCopy) {
    setBusy(true);
    try {
      const next = await services.formRuntime.open(LOAN_DETAILS_FORM_V1, draft.instanceId);
      activate(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not resume loan draft."); }
    finally { setBusy(false); }
  }

  function updateField(field: keyof Values, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    const mapping: Record<keyof Values, string> = {
      loanName: "loanName", lenderName: "lenderName", loanAccountReference: "loanAccountReference",
      principalRupees: "principalPaise", annualRatePercent: "annualInterestRateBasisPoints",
      loanStartDate: "loanStartDate", tenureMonths: "tenureMonths", firstEmiDate: "firstEmiDate",
    };
    let stored: unknown = value;
    if (field === "principalRupees") stored = value.trim() ? Math.round(Number(value) * 100) : undefined;
    if (field === "annualRatePercent") stored = value.trim() ? Math.round(Number(value) * 100) : undefined;
    if (field === "tenureMonths") stored = value.trim() ? Number(value) : undefined;
    const fieldId = mapping[field];
    queue.current = queue.current.then(async () => {
      const current = copyRef.current;
      if (!current) return;
      const next = await services.formRuntime.update(LOAN_DETAILS_FORM_V1, current, fieldId, stored);
      copyRef.current = next;
      setCopy(next);
    }).catch(error => {
      updateError.current = error;
      setMessage(error instanceof Error ? error.message : "Loan draft could not be saved.");
    });
  }

  async function closeDraft() {
    await queue.current;
    copyRef.current = null;
    setCopy(null);
    setValues(EMPTY);
    setMessage("Draft retained. You can resume it later.");
    await loadDrafts();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await queue.current;
      if (updateError.current) throw updateError.current;
      const current = copyRef.current;
      if (!current) throw new Error("loan_details_form_not_ready");
      await services.formRuntime.save(LOAN_DETAILS_FORM_V1, current);
      copyRef.current = null;
      setCopy(null);
      setValues(EMPTY);
      setMessage("Loan details saved. The Finance service preserves prior EMI schedule versions when calculation inputs change.");
      await Promise.all([loadDrafts(), onChanged()]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Loan details could not be saved."); }
    finally { setBusy(false); }
  }

  const vehicleDrafts = drafts.filter(draft => draft.values.vehicleId === vehicleId);
  return <div className="admin-capability-form">
    {!copy && <>
      {vehicleActive && <button className="admin-primary" type="button" disabled={busy} onClick={() => void startNew()}>Add loan</button>}
      {vehicleDrafts.length > 0 && <div className="admin-capability-form">
        <strong>Unfinished loan details drafts</strong>
        {vehicleDrafts.map(draft => <article className="admin-capability-record" key={draft.instanceId}>
          <div><strong>{String(draft.values.loanName || "New loan details")}</strong><small>Last saved {new Date(draft.updatedAt).toLocaleString("en-IN")} · revision {draft.revision}</small></div>
          <button className="admin-secondary" type="button" disabled={busy} onClick={() => void resume(draft)}>Resume draft</button>
        </article>)}
      </div>}
    </>}
    {copy && <form className="loan-form" onSubmit={save}>
      <strong>{typeof copy.values._recordRevision === "number" ? "Edit loan details" : "New loan details"}</strong>
      <div className="loan-form-grid">
        <label>Loan name<input required value={values.loanName} onChange={event => updateField("loanName", event.target.value)} /></label>
        <label>Lender name<input required value={values.lenderName} onChange={event => updateField("lenderName", event.target.value)} /></label>
        <label>Loan account reference (optional)<input value={values.loanAccountReference} onChange={event => updateField("loanAccountReference", event.target.value)} /></label>
        <label>Original principal (₹)<input required type="number" min="0.01" step="0.01" value={values.principalRupees} onChange={event => updateField("principalRupees", event.target.value)} /></label>
        <label>Annual interest rate (%)<input required type="number" min="0" step="0.01" value={values.annualRatePercent} onChange={event => updateField("annualRatePercent", event.target.value)} /></label>
        <label>Tenure (months)<input required type="number" min="1" max="1200" step="1" value={values.tenureMonths} onChange={event => updateField("tenureMonths", event.target.value)} /></label>
        <label>Loan start date<input required type="date" value={values.loanStartDate} onChange={event => updateField("loanStartDate", event.target.value)} /></label>
        <label>First EMI date (first day of month)<input required type="date" value={values.firstEmiDate} onChange={event => updateField("firstEmiDate", event.target.value)} /></label>
      </div>
      <div className="loan-form-actions">
        <button className="admin-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save loan details"}</button>
        <button className="admin-secondary" type="button" onClick={() => void closeDraft()} disabled={busy}>Close and keep draft</button>
      </div>
      <small className="admin-hint">Draft status · {copy.status.replaceAll("_", " ")} · revision {copy.revision}. Historical loan dates are accepted.</small>
    </form>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}
