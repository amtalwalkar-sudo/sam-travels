import { useEffect, useMemo, useState } from "react";
import { NetworkGateway } from "../../../../packages/core/src";
import type { PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import type { DriverStateProjection, DriverTransitionCommand } from "../../../../packages/features/work-shift";
import { createPlatformRepository } from "../native-store";
import {
  createDriverWorkflow,
  disableNativeOverlay,
  enableNativeOverlay,
} from "../driver-workflow";
import { createDriverCommand, DriverWorkflowService } from "../../../../packages/features/work-shift";

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

        const service = new DriverWorkflowService(repository, location);
        setWorkflow(service);
        setDriver(await service.snapshot());
        const pendingItems = await service.pending();
        setPending(pendingItems);
        setDriverMessage(
          pendingItems.length
            ? pendingItems.length + " action(s) awaiting location/recovery"
            : "Driver state is up to date",
        );

        unsubscribe = service.subscribe((snapshot) => {
          if (live) setDriver(snapshot);
        });

        const syncHandle = window.setInterval(() => {
          void service.snapshot().then((snapshot) => {
            if (live) setDriver(snapshot);
          });
          void service.pending().then((items) => {
            if (live) setPending(items);
          });
        }, 1500);

        const priorUnsubscribe = unsubscribe;
        unsubscribe = () => {
          priorUnsubscribe?.();
          window.clearInterval(syncHandle);
          (repository as typeof repository & { dispose?: () => void }).dispose?.();
        };
      })
      .catch((cause) => {
        if (live) setDriverMessage(cause instanceof Error ? cause.message : "Driver workflow unavailable");
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
      const result = await workflow.retry(eventId);
      setDriver(result.snapshot);
      setPending(await workflow.pending());
      setDriverMessage(
        result.status === "recorded"
          ? "Recovered action recorded"
          : "Still awaiting a reliable GPS fix · " + (result.reason ?? "retry later"),
      );
    } catch (cause) {
      setDriverMessage(cause instanceof Error ? cause.message : "Unable to retry pending action");
    } finally {
      setDriverBusy(false);
    }
  }

  async function toggleNetwork() {
    if (!gateway) return;
    try {
      const next = !enabled;
      await gateway.setEnabled(next);
      setEnabled(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save setting");
    }
  }

  async function dispatch(eventType: DriverTransitionCommand["eventType"]) {
    if (!workflow || !driver || driverBusy) return;
    setDriverBusy(true);
    setDriverMessage("Action received · saving pending intent");
    try {
      const command = createDriverCommand(driver, eventType, "pwa", crypto.randomUUID());
      const result = await workflow.dispatch(command);
      setDriver(result.snapshot);
      setPending(await workflow.pending());
      setDriverMessage(
        result.status === "recorded"
          ? "Recorded securely on this device"
          : result.reason === "permission_denied"
            ? "Location permission needed · action retained for recovery"
            : result.reason === "location_timeout"
              ? "GPS fix timed out · action retained for retry"
              : "Action needs attention · " + (result.reason ?? "retry required"),
      );
    } catch (cause) {
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
  const shiftOn = driver?.state === "shift_active" || driver?.state === "trip_active" || driver?.state === "approach_active";
  const tripOn = driver?.state === "trip_active" || driver?.state === "approach_active";

  return {
    repo, enabled, error, ready, driver, pending, driverBusy, overlayMessage, driverMessage,
    shiftOn, tripOn, localClock, elapsed,
    actions: { enableOverlay, disableOverlay, retry, toggleNetwork, dispatch },
  };
}
