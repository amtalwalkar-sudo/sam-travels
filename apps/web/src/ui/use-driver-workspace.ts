import { useCallback, useEffect, useMemo, useState } from "react";
import { NetworkGateway } from "../../../../packages/core/src";
import type { AtomicRecordRepository, PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import type { DriverStateProjection, DriverTransitionCommand } from "../../../../packages/features/work-shift";
import { getPlatformRecordSource } from "../native-store";
import { getDriverPersonLink } from "../person-identity-adapters";
import { getPersonIdentityService } from "../person-identity-runtime";
import {
  createDriverWorkflow,
} from "../driver-workflow";
import { createDriverCommand, createDriverCommandV2, DriverWorkflowService } from "../../../../packages/features/work-shift";
import { WorkDriverSelectionService } from "../../../../packages/application/src/work-driver-selection-service";
import { useCancellationFeeWorkspace } from "./use-cancellation-fee-workspace";
import { useCompletedTripFinancialsWorkspace } from "./use-completed-trip-financials-workspace";
import { dispatchCommittedFeatureEvent, TimelineProjectionService, TimelineEnrichmentQueue, GeoapifyProxyReverseGeocoder } from "../../../../packages/application/src";
import type { RuntimeRegistry } from "../../../../packages/core/src";
import { LOGBOOK_WORK_EVENT_INTEGRATION, rebuildTripHistoryProjection } from "../../../../packages/features/logbook";
import { recordBrowserDiagnostic } from "../diagnostics";
import { isOperationalBoundaryPending, nextOperationalBoundaryAt } from "../../../../packages/domain/src/driver-workflow";
import { isNativeTimelineEnrichmentPlatform, listenForNativeTimelineEnrichment, scheduleNativeTimelineEnrichment } from "../timeline-enrichment-native";


export function useDriverWorkspace(runtime: RuntimeRegistry, platformRepository: RecordRepository & PolicyRepository & AtomicRecordRepository) {
  const [now, setNow] = useState(Date.now());
  const [repo, setRepo] = useState<(RecordRepository & PolicyRepository) | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [driver, setDriver] = useState<DriverStateProjection | null>(null);
  const [workflow, setWorkflow] = useState<DriverWorkflowService | null>(null);
  const [pending, setPending] = useState<{ command: DriverTransitionCommand; status: string; reason?: string }[]>([]);
  const [driverBusy, setDriverBusy] = useState(false);
  const [driverMessage, setDriverMessage] = useState("Restoring driver state…");
  const [driverChoices, setDriverChoices] = useState<Array<{driverId:string;name:string}>>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectionService, setSelectionService] = useState<WorkDriverSelectionService | null>(null);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const gateway = useMemo(() => repo ? new NetworkGateway(repo) : null, [repo]);


  useEffect(() => {
    let live = true;
    setRepo(platformRepository);
    platformRepository.getNetworkEnabled()
      .then(value => {
        if (!live) return;
        setEnabled(value);
        setReady(true);
      })
      .catch((cause) => {
        if (live) {
          void recordBrowserDiagnostic({ subsystem: "storage", operation: "repository_startup", failureCategory: "storage", recoveryResult: "startup_blocked" });
          setError(cause instanceof Error ? cause.message : "Local storage unavailable");
          setReady(true);
        }
      });
    return () => { live = false; };
  }, [platformRepository]);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;

    createDriverWorkflow()
      .then(async ({ repository, location }) => {
        if (!live) {
          (repository as typeof repository & { dispose?: () => void }).dispose?.();
          return;
        }

        const platformRecords = platformRepository;
        const selection = new WorkDriverSelectionService(platformRecords, repository);
        const selected = await selection.getSelectedDriver();
        const allRecords = await platformRecords.list<unknown>();
        setDriverChoices(allRecords.filter(row => typeof row.id === "string" && row.id.startsWith("feature:driver-records:driver:") && !!row.data && typeof row.data === "object")
          .map(row => row.data as {driverId?:string;name?:string;lifecycleState?:string})
          .filter(row => typeof row.driverId === "string" && typeof row.name === "string" && row.lifecycleState === "active")
          .map(row => ({driverId:row.driverId!,name:row.name!})));
        setSelectedDriverId(selected?.driverId ?? "");
        setSelectionService(selection);
        const service = new DriverWorkflowService(repository, location, async (event) => {
          await dispatchCommittedFeatureEvent(runtime, LOGBOOK_WORK_EVENT_INTEGRATION, event, async () => {
            rebuildTripHistoryProjection(await repository.listEvents());
          });
        });
        setWorkflow(service);
        setDriver(await service.snapshot());
        rebuildTripHistoryProjection(await service.events());
        await service.replayCommittedEvents();
        await service.reconcilePending();
        const pendingItems = await service.resumePendingBackground();
        setPending(pendingItems);
        setDriverMessage(
          pendingItems.length
            ? pendingItems.length + " action(s) awaiting location/recovery"
            : "Driver state is up to date",
        );

        const refreshWorkflowStatus = () => {
          void service.pending().then(items => {
            if (!live) return;
            setPending(items);
            const acquiring = items.some(item => item.status === "pending_location");
            const attention = items.find(item => item.status === "needs_attention");
            setDriverMessage(current => {
              if (acquiring) return "Action saved · GPS verification continuing in the background";
              if (attention) return attention.reason === "gps_recovery_window_expired"
                ? "GPS evidence window expired · reissue the action when ready"
                : "Action retained · " + (attention.reason ?? "location needs attention");
              if (/GPS verification|Retry queued|Retrying the original pending action/.test(current)) {
                return "Recorded securely on this device";
              }
              return current;
            });
          });
        };
        const unsubscribeState = service.subscribe((snapshot) => {
          if (live) {
            setDriver(snapshot);
            // Native Room invalidation can represent financial/form record changes even when
            // the driver workflow revision is unchanged. Refresh record-backed workspaces too.
            setWorkspaceRefreshKey(current => current + 1);
            refreshWorkflowStatus();
          }
        });
        const unsubscribeStatus = service.subscribeStatus(refreshWorkflowStatus);
        void service.snapshot().then(snapshot => { if (live) setDriver(snapshot); });
        refreshWorkflowStatus();
        const resumeWorkflow = () => {
          if (document.visibilityState === "hidden") return;
          void service.replayCommittedEvents();
          void service.snapshot().then(snapshot => { if (live) setDriver(snapshot); });
          void service.reconcilePending().then(items => { if (live) setPending(items); });
        };
        window.addEventListener("focus", resumeWorkflow);
        document.addEventListener("visibilitychange", resumeWorkflow);

        unsubscribe = () => {
          unsubscribeState();
          unsubscribeStatus();
          window.removeEventListener("focus", resumeWorkflow);
          document.removeEventListener("visibilitychange", resumeWorkflow);
          (repository as typeof repository & { dispose?: () => void }).dispose?.();
        };
      })
      .catch((cause) => {
        if (live) {
          void recordBrowserDiagnostic({ subsystem: "workflow", operation: "workflow_startup", failureCategory: "workflow", recoveryResult: "retry_required" });
          setDriverMessage(cause instanceof Error ? cause.message : "Driver workflow unavailable");
        }
      });

    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);

  async function retry(eventId: string) {
    if (!workflow || driverBusy) return;
    setDriverBusy(true);
    setDriverMessage("Retrying the original pending action…");
    try {
      const result = await workflow.retryBackground(eventId);
      setDriver(result.snapshot);
      const items = await workflow.pending();
      setPending(items);
      const actionItem = items.find(item => item.command.eventId === eventId);
      const stillPending = actionItem?.status === "pending_location";
      setDriverMessage(
        result.status === "recorded" || (!stillPending && !actionItem)
          ? "Recovered action recorded"
          : (result.reason ?? actionItem?.reason) === "gps_recovery_window_expired"
            ? "GPS evidence window expired · reissue the action when ready"
            : actionItem?.status === "needs_attention"
              ? "Action retained · " + (actionItem.reason ?? "location needs attention")
              : "Retry queued · GPS is being checked in the background",
      );
    } catch (cause) {
      void recordBrowserDiagnostic({ subsystem: "recovery", operation: "retry_pending_action", failureCategory: "recovery", recoveryResult: "retry_failed" });
      setDriverMessage(cause instanceof Error ? cause.message : "Unable to retry pending action");
    } finally {
      setDriverBusy(false);
    }
  }

  async function selectDriver(driverId:string) {
    if (!selectionService || !driverId) return;
    try {
      const link = await getDriverPersonLink(platformRepository, driverId);
      if (!link) throw new Error("Link this Driver profile to an enrolled person before starting work.");
      await getPersonIdentityService().activate(link.personId, "driver");
      const selected = await selectionService.selectDriver(driverId, getPlatformRecordSource());
      setSelectedDriverId(selected.driverId);
      setDriverMessage("Work Driver selected");
    } catch (cause) {
      setDriverMessage(cause instanceof Error ? cause.message : "Unable to select Work Driver");
    }
  }

  async function toggleNetwork() {
    if (!gateway) return;
    try {
      const next = !enabled;
      await gateway.setEnabled(next);
      setEnabled(next);
      setError("");
      if (next && enrichmentQueue) {
        if (isNativeTimelineEnrichmentPlatform()) void scheduleNativeTimelineEnrichment().catch(() => undefined);
        else if (navigator.onLine) window.dispatchEvent(new Event("timeline-enrichment-queue-updated"));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save setting");
    }
  }

  async function dispatch(eventType: DriverTransitionCommand["eventType"], odometerKm?: number) {
    if (!workflow || !driver || driverBusy) return;
    setDriverBusy(true);
    setDriverMessage("Action received · saving pending intent");
    try {
      let odometer: DriverTransitionCommand["odometer"];
      if (eventType === "shift_start") {
        if (!Number.isSafeInteger(odometerKm) || (odometerKm as number) < 0) throw new Error("shift_start_odometer_required");
        const previous = driver.lastConfirmedOdometerKm;
        odometer = { schemaVersion: 1, readingKm: odometerKm as number,
          ...(previous === undefined ? {} : { previousConfirmedKm: previous, personalKm: (odometerKm as number) - previous }) };
      } else if ((eventType === "shift_end" || eventType === "shift_rotate") && driver.shiftStartOdometerKm !== undefined) {
        if (!Number.isSafeInteger(odometerKm) || (odometerKm as number) < 0) throw new Error("shift_end_odometer_required");
        if ((odometerKm as number) < driver.shiftStartOdometerKm) throw new Error("shift_end_odometer_below_shift_start");
        odometer = { schemaVersion: 1, readingKm: odometerKm as number, businessKm: (odometerKm as number) - driver.shiftStartOdometerKm };
      }
      const rotation = eventType === "shift_rotate" && driver.shiftId && driver.shiftStartedAt && driver.shiftStartOdometerKm !== undefined
        ? {schemaVersion:1 as const,outgoingShiftId:driver.shiftId,outgoingShiftStartedAt:driver.shiftStartedAt,outgoingStartOdometerKm:driver.shiftStartOdometerKm,boundaryAt:nextOperationalBoundaryAt(driver.shiftStartedAt)}
        : undefined;
      if(eventType==="shift_rotate"&&!rotation)throw new Error("shift_rotation_context_missing");
      const command = eventType === "shift_end" && driver.shiftStartOdometerKm === undefined
        ? createDriverCommand(driver, eventType, "pwa", crypto.randomUUID())
        : createDriverCommandV2(driver, eventType, "pwa", crypto.randomUUID(), undefined, odometer, rotation);
      const result = await workflow.dispatchBackground(command);
      setDriver(result.snapshot);
      const items = await workflow.pending();
      setPending(items);
      const actionItem = items.find(item => item.command.eventId === command.eventId);
      const stillPending = actionItem?.status === "pending_location";
      setDriverMessage(
        result.status === "recorded" || (!stillPending && !actionItem)
          ? "Recorded securely on this device"
          : actionItem?.status === "needs_attention"
            ? "Action retained · " + (actionItem.reason ?? "location needs attention")
            : "Action saved · GPS verification continuing in the background",
      );
    } catch (cause) {
      void recordBrowserDiagnostic({ subsystem: "workflow", operation: "dispatch_transition", failureCategory: "workflow", recoveryResult: "operation_failed" });
      setDriverMessage(cause instanceof Error ? cause.message : "Unable to queue action");
    } finally {
      setDriverBusy(false);
    }
  }

  const elapsed = (start?: string) => {
    if (!start) return "00:00:00";
    const seconds = Math.max(0, Math.floor((now - Date.parse(start)) / 1000));
    const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return hours + ":" + minutes + ":" + secs;
  };

  const localClock = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const shiftOn = driver?.state !== undefined && driver.state !== "idle" && driver.state !== "needs_attention";
  const tripOn = driver?.state === "going_to_pickup" || driver?.state === "trip_active" || driver?.state === "approach_active";
  const boundaryAt = driver?.shiftStartedAt ? nextOperationalBoundaryAt(driver.shiftStartedAt) : undefined;
  const pendingBoundary = !!driver?.shiftContext && driver.state === "shift_active" && isOperationalBoundaryPending(driver.shiftStartedAt, now);
  const cancellationFees = useCancellationFeeWorkspace(platformRepository, workspaceRefreshKey, setDriverMessage);
  const completedTripFinancials = useCompletedTripFinancialsWorkspace(platformRepository, workspaceRefreshKey, setDriverMessage);
  // A pending Fare does not block other actions: that product rule remains explicitly unresolved.
  const pendingBlocksWorkflow = pendingBoundary || pending.some((item) => item.reason !== "gps_recovery_window_expired") ||
    cancellationFees.pendingCancellationFees.length > 0 || cancellationFees.cancellationFeeBusy;

  const enrichmentQueue = useMemo(
    () => repo && gateway ? new TimelineEnrichmentQueue(repo, gateway, new GeoapifyProxyReverseGeocoder()) : undefined,
    [repo, gateway],
  );

  // PWA work resumes on connectivity/lifecycle events. Android delegates
  // durable execution to WorkManager; neither platform polls the network.
  useEffect(() => {
    if (!enrichmentQueue) return;
    const notifyTimeline = () => window.dispatchEvent(new Event("timeline-enrichment-updated"));
    const nativeListener = listenForNativeTimelineEnrichment(notifyTimeline);
    let retryTimer: number | undefined;
    let draining = false;
    const drainAndSchedule = async () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (draining || document.visibilityState === "hidden" || !navigator.onLine || !enabled) return;
      if (isNativeTimelineEnrichmentPlatform()) {
        await scheduleNativeTimelineEnrichment().catch(() => undefined);
        return;
      }
      draining = true;
      try {
        await enrichmentQueue.drainDueRetries(5);
        notifyTimeline();
        const nextWakeAt = await enrichmentQueue.nextWakeAt();
        if (nextWakeAt !== undefined && document.visibilityState === "visible" && navigator.onLine && enabled) {
          retryTimer = window.setTimeout(() => { void drainAndSchedule(); },
            Math.max(1_000, nextWakeAt - Date.now()));
        }
      } catch {
        // The durable queue remains intact; a later online/resume event retries it.
      } finally {
        draining = false;
      }
    };
    const resume = () => { void drainAndSchedule(); };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("timeline-enrichment-queue-updated", resume);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("timeline-enrichment-queue-updated", resume);
      document.removeEventListener("visibilitychange", resume);
      void nativeListener.then(handle => handle?.remove());
    };
  }, [enrichmentQueue, enabled]);

  const loadTimeline = useCallback(async (fromDate: string, toDate: string, allowLocationLookup: boolean, signal?: AbortSignal) => {
    if (!workflow) throw new Error("Work history is still loading");
    const readModel = await new TimelineProjectionService({ listEvents: () => workflow.events() })
      .read(new Date().toISOString());
    const visibleEventIds = new Set(readModel.projection.calendarDays
      .filter(day => day.date >= fromDate && day.date <= toDate)
      .flatMap(day => day.eventIds));
    const visibleEvents = readModel.events.filter(event => visibleEventIds.has(event.eventId));
    const locations = (async () => {
      if (!enrichmentQueue) return {};
      if (allowLocationLookup) {
        await enrichmentQueue.enqueue(visibleEvents);
        if (isNativeTimelineEnrichmentPlatform()) await scheduleNativeTimelineEnrichment().catch(() => undefined);
        else if (navigator.onLine) await enrichmentQueue.drain(5, signal);
      }
      window.dispatchEvent(new Event("timeline-enrichment-queue-updated"));
      return enrichmentQueue.locations(visibleEvents.map(event => event.eventId));
    })();
    return { model: readModel, locations };
  }, [workflow, enrichmentQueue]);


  return {
    repo, enabled, error, ready, driver, pending, pendingBlocksWorkflow, pendingBoundary, boundaryAt, driverBusy, driverMessage,
    ...cancellationFees,
    ...completedTripFinancials,
    shiftOn, tripOn, localClock, elapsed,
    actions: { retry, toggleNetwork, dispatch, selectDriver,
      updateCancellationFeeDraft: cancellationFees.updateCancellationFeeDraft,
      submitCancellationFee: cancellationFees.submitCancellationFee,
      updateCompletedTripFinancialDraft: completedTripFinancials.updateCompletedTripFinancialDraft,
      submitCompletedTripFinancials: completedTripFinancials.submitCompletedTripFinancials },
    driverChoices, selectedDriverId, loadTimeline,
  };
}
