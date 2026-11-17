import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { type CancellationFeeObligation } from "../../../../packages/application/src/trip-financial-service";
import type { TripFinancialFormRuntimeV1 } from "../../../../packages/application/src/trip-financial-form-runtime";

export function useCancellationFeeWorkspace(
  tripFinancialForms: TripFinancialFormRuntimeV1,
  refreshKey: number | undefined,
  setDriverMessage: Dispatch<SetStateAction<string>>,
) {
  const [pendingCancellationFees, setPendingCancellationFees] = useState<Array<{id:string;data:CancellationFeeObligation}>>([]);
  const [cancellationFeeDrafts, setCancellationFeeDrafts] = useState<Record<string,string>>({});
  const [cancellationFeeBusy, setCancellationFeeBusy] = useState(false);
  const draftQueue = useRef(new Map<string,Promise<void>>());
    const refresh = useCallback(async () => {
    const obligations = await tripFinancialForms.listPendingCancellationFees();
    const drafts: Record<string,string> = {};
    for (const obligation of obligations) {
      const tripId = obligation.data.tripId;
      const values = await tripFinancialForms.openCancellationFeeDraft(tripId);
      const amount = values.cancellationFeePaise;
      drafts[tripId] = typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0
        ? (amount / 100).toFixed(2).replace(/\\.?0+$/, "")
        : "";
    }
    setPendingCancellationFees(obligations.map(row => ({id:row.id,data:row.data})));
    setCancellationFeeDrafts(drafts);
  }, [tripFinancialForms]);

  useEffect(() => {
    void refresh().catch(cause => setDriverMessage(cause instanceof Error ? cause.message : "Unable to restore cancellation-fee forms"));
  }, [refresh, refreshKey, setDriverMessage]);

  useEffect(() => {
    const resume = () => { if (document.visibilityState !== "hidden") void refresh(); };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);

  function parseRupeesToPaise(value: string): number | null {
    if (value === "" || !/^\\d+(\\.\\d{1,2})?$/.test(value)) return null;
    const [rupees, fraction = ""] = value.split(".");
    const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
  }

  async function updateCancellationFeeDraft(tripId: string, value: string) {
    setCancellationFeeDrafts(current => ({...current,[tripId]:value}));
    const previous = draftQueue.current.get(tripId) ?? Promise.resolve();
    const next = previous.then(async () => {
      await tripFinancialForms.updateCancellationFeeDraft(tripId, parseRupeesToPaise(value) ?? "");
    });
    draftQueue.current.set(tripId, next);
    await next;
  }

  async function submitCancellationFee(tripId: string) {
    if (cancellationFeeBusy) return;
    const amount = parseRupeesToPaise(cancellationFeeDrafts[tripId] ?? "");
    if (amount === null) {
      setDriverMessage("Enter a valid cancellation fee; ₹0 is allowed");
      return;
    }
    setCancellationFeeBusy(true);
    setDriverMessage("Saving cancellation fee…");
    try {
      await draftQueue.current.get(tripId);
      await tripFinancialForms.submitCancellationFeeDraft(tripId, amount);
      await refresh();
      setDriverMessage("Cancellation fee saved securely");
    } catch (cause) {
      setDriverMessage(cause instanceof Error ? cause.message : "Cancellation fee not saved");
    } finally {
      setCancellationFeeBusy(false);
    }
  }

  return {
    pendingCancellationFees,
    cancellationFeeDrafts,
    cancellationFeeBusy,
    refreshCancellationFees: refresh,
    updateCancellationFeeDraft,
    submitCancellationFee,
  };
}
