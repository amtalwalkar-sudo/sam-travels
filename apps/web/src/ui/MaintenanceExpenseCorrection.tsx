import { useEffect, useState, type FormEvent } from "react";
import type { AtomicRecordBatchRepository } from "../../../../packages/core/src/repositories";
import type { RecordEnvelope } from "../../../../packages/core/src/types";
import type { GeneralMaintenanceExpenseV1 } from "../../../../packages/application/src/maintenance-service";
import { HistoricalCorrectionService } from "../../../../packages/application/src/historical-correction-service";
import { projectHistoricalCorrectionsV1 } from "../../../../packages/domain/src/historical-correction";
import { getPersonIdentityService } from "../person-identity-runtime";

const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);

export function createMaintenanceExpenseCorrectionService(records: AtomicRecordBatchRepository, source: RecordEnvelope<unknown>["source"]) {
  return new HistoricalCorrectionService(records, getPersonIdentityService(), {
    resolve: async (record: RecordEnvelope<unknown>) => {
      const data = record.data as Record<string, unknown>;
      if (!record.id.startsWith("feature:maintenance:expense:") || data.kind !== "expense" || data.schemaVersion !== 1 ||
          typeof data.amountPaise !== "number" || !Number.isSafeInteger(data.amountPaise) || data.amountPaise < 0) {
        throw new Error("maintenance_expense_correction_target_invalid");
      }
      return {
        featureId: "maintenance",
        allowedFieldPaths: ["amountPaise"],
        validateProjectedData: value => {
          const projected = value as Record<string, unknown>;
          if (projected.kind !== "expense" || !Number.isSafeInteger(projected.amountPaise) ||
              (projected.amountPaise as number) < 0) throw new Error("maintenance_expense_correction_value_invalid");
        },
      };
    },
  }, source);
}

export async function projectMaintenanceExpenses(
  expenses: readonly RecordEnvelope<GeneralMaintenanceExpenseV1>[],
  service: HistoricalCorrectionService,
) {
  return Promise.all(expenses.map(async expense => {
    const corrections = await service.listForTarget(expense.id);
    const projection = projectHistoricalCorrectionsV1(expense.data, corrections);
    return projection.status === "valid" ? { ...expense, data: projection.data } : expense;
  }));
}

export function MaintenanceExpenseCorrection({ expense, service, onCorrected }: {
  expense: RecordEnvelope<GeneralMaintenanceExpenseV1>;
  service: HistoricalCorrectionService;
  onCorrected: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((expense.data.amountPaise / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<HistoricalCorrectionService["listForTarget"]>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void service.listForTarget(expense.id).then(rows => { if (live) setHistory(rows); })
      .catch(error => { if (live) setMessage(error instanceof Error ? error.message : "Correction history unavailable."); });
    return () => { live = false; };
  }, [expense.id, service]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const chain = await service.listForTarget(expense.id);
      const amountPaise = Math.round(Number(amount) * 100);
      if (!Number.isFinite(Number(amount)) || !Number.isSafeInteger(amountPaise) || amountPaise < 0) {
        throw new Error("Enter a valid amount.");
      }
      const result = await service.submit({
        correctionId: crypto.randomUUID().replaceAll("-", ""), targetRecordId: expense.id,
        expectedTargetRevision: expense.revision, expectedChainRevision: chain.length,
        fieldPath: "amountPaise", afterValue: amountPaise, reason,
        businessEffectiveDate: expense.data.expenseDate,
      });
      setHistory([...chain, result.correction]);
      setOpen(false); setReason("");
      setMessage("Correction appended. The original expense record remains unchanged.");
      await onCorrected();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Correction failed."); }
    finally { setBusy(false); }
  }
  return <div className="admin-capability-form">
    <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(value => !value)}>
      {open ? "Close correction" : "Correct amount / view history"}
    </button>
    {history.map(item => <small key={item.correctionId}>
      {item.recordedAt} · {money(Number(item.beforeValue))} → {money(Number(item.afterValue))} · {item.actor.role} · {item.reason}
    </small>)}
    {open && <form className="admin-capability-form" onSubmit={submit}>
      <label>Corrected amount (₹)<input required type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <small>Before: {money(expense.data.amountPaise)} · After: {Number.isFinite(Number(amount)) && Number(amount) >= 0 ? money(Math.round(Number(amount) * 100)) : "Enter a valid amount"}</small>
      <label>Reason for correction<input required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="loan-form-actions">
        <button className="admin-primary" disabled={busy}>Append correction</button>
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>}
    {message && <small className="admin-hint" role="status">{message}</small>}
  </div>;
}
