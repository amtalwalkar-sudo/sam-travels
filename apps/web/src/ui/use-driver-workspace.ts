import { useCallback, useEffect, useMemo, useState } from "react";
import { NetworkGateway } from "../../../../packages/core/src";
import type { PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import type { DriverStateProjection, DriverTransitionCommand } from "../../../../packages/features/work-shift";
import { createPlatformRepository, getPlatformRecordSource } from "../native-store";
import {
  createDriverWorkflow,
  disableNativeOverlay,
  enableNativeOverlay,
} from "../driver-workflow";
import { createDriverCommandV2, DriverWorkflowService } from "../../../../packages/features/work-shift";
import { WorkDriverSelectionService } from "../../../../packages/application/src/work-driver-selection-service";
import { dispatchCommittedFeatureEvent, getApplicationRuntimeRegistry, TimelineProjectionService, TimelineEnrichmentQueue, GeoapifyProxyReverseGeocoder } from "../../../../packages/application/src";
import { LOGBOOK_WORK_EVENT_INTEGRATION, rebuildTripHistoryProjection } from "../../../../packages/features/logbook";
import { recordBrowserDiagnostic } from "../diagnostics";
import { isNativeTimelineEnrichmentPlatform, listenForNativeTimelineEnrichment, scheduleNativeTimelineEnrichment } from "../timeline-enrichment-native";


export function useDriverWorkspace() {
  const [now, setNow] = useState(Date.now());
  const [repo, setRepo] = useState<(RecordRepository & PolicyRepository) | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [driver, setDriver] = useState<DriverStateProjection | null>(null);
  const [workflow, setWorkflow] = useState<DriverWorkflowService | null>(null);
  const [pending, setPending] = useState<{ command: DriverTransitionCommand; status: string; reason?: string }[]>([]);
  const [driverBusy, setDriverBusy] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState("");
  const [driverMessage, setDriverMessage] = useState("Restoring driver state…");
  const [driverChoices, setDriverChoices] = useState<Array<{driverId:string;name:string}>>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectionService, setSelectionService] = useState<WorkDriverSelectionService | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const gateway = useMemo(() => repo ? new NetworkGateway(repo) : null, [repo]);

  useEffect(() => {
    let live = true;
    createPlatformRepository()
      .then(async (repository) => {
        if (!live) return;
        setRepo(repository);
        setEnabled(await repository.getNetworkEnabled());
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
  }, []);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;

    createDriverWorkflow()
      .then(async ({ repository, location }) => {
        if (!live) {
          (repository as typeof repository & { dispose?: () => void }).dispose?.();
          return;
        }

        const runtime = getApplicationRuntimeRegistry();
        const platformRecords = await createPlatformRepository();
        const selection = new WorkDriverSelectionService(platformRecords, repository);
        const selected = await selection.getSelectedDriver();
        const allRecords = await platformRecords.list<unknown>();
        setDriverChoices(allRecords.filter(row => row.id.startsWith("feature:driver-records:driver:") && !!row.data && typeof row.data === "object")
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
          void service.pending().then(items => { if (live) setPending(items); });
        };
        const unsubscribeState = service.subscribe((snapshot) => {
          if (live) {
            setDriver(snapshot);
            refreshWorkflowStatus();
          }
        });
        const unsubscribeStatus = service.subscribeStatus(refreshWorkflowStatus);
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

  async function enableOverlay() {
    try {
      await enableNativeOverlay();
      setOverlayMessage("Native driver overlay enabled");
    } catch (cause) {
      setOverlayMessage(cause instanceof Error ? cause.message : "Overlay permission required");
    }
  }

  async function disableOverlay() {
    try {
      await disableNativeOverlay();
      setOverlayMessage("Native driver overlay disabled");
    } catch (cause) {
      setOverlayMessage(cause instanceof Error ? cause.message : "Unable to disable overlay");
    }
  }

  async function retry(eventId: string) {
    if (!workflow || driverBusy) return;
    setDriverBusy(true);
    setDriverMessage("Retrying the original pending action…");
    try {
      const result = await workflow.retryBackground(eventId);
      setDriver(result.snapshot);
      setPending(await workflow.pending());
      setDriverMessage(
        result.status === "recorded"
          ? "Recovered action recorded"
          : result.reason === "gps_recovery_window_expired"
            ? "GPS evidence window expired · reissue the action when ready"
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
        else if (navigator.onLine) void enrichmentQueue.drainDueRetries(5).then(() => window.dispatchEvent(new Event("timeline-enrichment-updated"))).catch(() => undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save setting");
    }
  }

  async function dispatch(eventType: DriverTransitionCommand["eventType"]) {
    if (!workflow || !driver || driverBusy) return;
    setDriverBusy(true);
    setDriverMessage("Action received · saving pending intent");
    try {
      const command = createDriverCommandV2(driver, eventType, "pwa", crypto.randomUUID());
      const result = await workflow.dispatchBackground(command);
      setDriver(result.snapshot);
      setPending(await workflow.pending());
      setDriverMessage(
        result.status === "recorded"
          ? "Recorded securely on this device"
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
  const pendingBlocksWorkflow = pending.some((item) => item.reason !== "gps_recovery_window_expired");

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
      if (Capacitor.isNativePlatform()) {
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
        if (Capacitor.isNativePlatform()) await scheduleNativeTimelineEnrichment().catch(() => undefined);
        else if (navigator.onLine) await enrichmentQueue.drain(5, signal);
      }
      window.dispatchEvent(new Event("timeline-enrichment-queue-updated"));
      return enrichmentQueue.locations(visibleEvents.map(event => event.eventId));
    })();
    return { model: readModel, locations };
  }, [workflow, enrichmentQueue]);


  return {
    repo, enabled, error, ready, driver, pending, pendingBlocksWorkflow, driverBusy, overlayMessage, driverMessage,
    shiftOn, tripOn, localClock, elapsed,
    actions: { enableOverlay, disableOverlay, retry, toggleNetwork, dispatch, selectDriver },
    driverChoices, selectedDriverId, loadTimeline,
  };
}
