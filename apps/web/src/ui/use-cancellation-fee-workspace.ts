import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AtomicRecordRepository, RecordRepository } from "../../../../packages/core/src";
import { getPlatformRecordSource } from "../native-store";
import { getPersonIdentityService } from "../person-identity-runtime";
import { RecordFormWorkingCopyRepository } from "../../../../packages/application/src/record-form-working-copy-repository";
import { SharedFormRuntime } from "../../../../packages/application/src/shared-form-runtime";
import { TRIP_CANCELLATION_FEE_FORM_V1 } from "../../../../packages/application/src/driver-form-definitions";
import { TripFinancialService, type CancellationFeeObligation } from "../../../../packages/application/src/trip-financial-service";

export function useCancellationFeeWorkspace(
  platformRepository: RecordRepository & AtomicRecordRepository,
  refreshKey: number | undefined,
  setDriverMessage: Dispatch<SetStateAction<string>>,
) {
  const [pendingCancellationFees, setPendingCancellationFees] = useState<Array<{id:string;data:CancellationFeeObligation}>>([]);
  const [cancellationFeeDrafts, setCancellationFeeDrafts] = useState<Record<string,string>>({});
  const [cancellationFeeBusy, setCancellationFeeBusy] = useState(false);
  const draftQueue = useRef(new Map<string,Promise<void>>());
  const service = useMemo(
    () => new TripFinancialService(platformRepository, getPlatformRecordSource(), undefined, async () => {
      const actor = await getPersonIdentityService().currentActor();
      return { personId: actor.actorId, role: actor.role };
    }),
    [platformRepository],
  );
  const forms = useMemo(() => {
    const copies = new RecordFormWorkingCopyRepository(platformRepository, getPlatformRecordSource());
    return new SharedFormRuntime(copies, {
      submit: async command => {
        if (command.formId !== TRIP_CANCELLATION_FEE_FORM_V1.id || command.action !== "submit") {
          throw new Error("unsupported_trip_financial_form");
        }
        return service.submitCancellationFee(
          command.instanceId,
          command.values.cancellationFeePaise as number,
          command.operationId,
        );
      },
    });
  }, [platformRepository, service]);

  const refresh = useCallback(async () => {
    const obligations = await service.pendingCancellationFees();
    const drafts: Record<string,string> = {};
    for (const obligation of obligations) {
      const tripId = obligation.data.tripId;
      let copy = await forms.open(TRIP_CANCELLATION_FEE_FORM_V1, tripId);
      if (copy.values.tripId !== tripId) {
        copy = await forms.update(TRIP_CANCELLATION_FEE_FORM_V1, copy, "tripId", tripId);
      }
      const amount = copy.values.cancellationFeePaise;
      drafts[tripId] = typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0
        ? (amount / 100).toFixed(2).replace(/\\.?0+$/, "")
        : "";
    }
    setPendingCancellationFees(obligations.map(row => ({id:row.id,data:row.data})));
    setCancellationFeeDrafts(drafts);
  }, [service, forms]);

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
      let copy = await forms.open(TRIP_CANCELLATION_FEE_FORM_V1, tripId);
      if (copy.values.tripId !== tripId) {
        copy = await forms.update(TRIP_CANCELLATION_FEE_FORM_V1, copy, "tripId", tripId);
      }
      await forms.update(TRIP_CANCELLATION_FEE_FORM_V1, copy, "cancellationFeePaise", parseRupeesToPaise(value) ?? "");
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
      let copy = await forms.open(TRIP_CANCELLATION_FEE_FORM_V1, tripId);
      if (copy.values.tripId !== tripId) {
        copy = await forms.update(TRIP_CANCELLATION_FEE_FORM_V1, copy, "tripId", tripId);
      }
      if (copy.values.cancellationFeePaise !== amount) {
        copy = await forms.update(TRIP_CANCELLATION_FEE_FORM_V1, copy, "cancellationFeePaise", amount);
      }
      await forms.submit(TRIP_CANCELLATION_FEE_FORM_V1, copy);
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
