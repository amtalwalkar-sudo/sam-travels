import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type {
  DriverEvent,
  DriverIntent,
  DriverStateProjection,
  DriverWorkflowRepository,
  EventLocationProvider,
  GpsFix,
} from "../../../packages/features/work-shift";
import { DexieDriverWorkflowRepository } from "../../../packages/storage-browser/src/driver-workflow";
import { TimelineProjectionService, type TimelineEvidenceSource } from "../../../packages/application/src/timeline-projection-service";
import { recoverPendingBackupTransactions } from "./backup-runtime";
import { validateGpsFix } from "../../../packages/core/src/gps";

type NativeApi = {
  getSnapshot(): Promise<{ snapshot: DriverStateProjection }>;
  queueIntent(options: { command: DriverIntent["command"] }): Promise<{ intent: DriverIntent }>;
  listPending(): Promise<{ intents: DriverIntent[] }>;
  listEvents(): Promise<{ events: DriverEvent[] }>;
  listUndeliveredEvents(): Promise<{ events: DriverEvent[] }>;
  markEventDelivered(options: { eventId: string }): Promise<void>;
  retryIntent(options: { eventId: string }): Promise<{ intent: DriverIntent }>;
  captureLocation(options: { transitionAt: string }): Promise<GpsFix>;
  completeIntent(options: { eventId: string; gps: GpsFix }): Promise<{ snapshot: DriverStateProjection }>;
  markNeedsAttention(options: { eventId: string; reason: string }): Promise<void>;
  enableOverlay(): Promise<void>;
  disableOverlay(): Promise<void>;
  addListener(
    event: "driverStateChanged",
    listener: (data: { snapshot: DriverStateProjection }) => void,
  ): Promise<PluginListenerHandle>;
};

const NativeDriver = registerPlugin<NativeApi>("DriverWorkflow");

export class NativeDriverWorkflowRepository implements DriverWorkflowRepository {
  private readonly listeners = new Set<(snapshot: DriverStateProjection) => void>();
  private handle?: PluginListenerHandle;
  private disposed = false;

  constructor() {
    void NativeDriver.addListener("driverStateChanged", (data) => {
      this.listeners.forEach((listener) => listener(data.snapshot));
    }).then((handle) => {
      if (this.disposed) void handle.remove();
      else this.handle = handle;
    });
  }

  async getSnapshot() {
    return (await NativeDriver.getSnapshot()).snapshot;
  }

  async queueIntent(intent: DriverIntent) {
    return (await NativeDriver.queueIntent({ command: intent.command })).intent;
  }

  async reactivateIntent(eventId: string) {
    return (await NativeDriver.retryIntent({ eventId })).intent;
  }

  async getIntent(eventId: string) {
    return (await NativeDriver.listPending()).intents.find(
      (intent) => intent.command.eventId === eventId,
    );
  }

  async listPending() {
    return (await NativeDriver.listPending()).intents;
  }

  async completeIntent(eventId: string, gps: GpsFix) {
    return (await NativeDriver.completeIntent({ eventId, gps })).snapshot;
  }

  markNeedsAttention(eventId: string, reason: string) {
    return NativeDriver.markNeedsAttention({ eventId, reason });
  }

  async listEvents(): Promise<DriverEvent[]> {
    return (await NativeDriver.listEvents()).events;
  }

  async listUndeliveredEvents(): Promise<DriverEvent[]> {
    return (await NativeDriver.listUndeliveredEvents()).events;
  }

  markEventDelivered(eventId: string): Promise<void> {
    return NativeDriver.markEventDelivered({ eventId });
  }

  subscribe(listener: (snapshot: DriverStateProjection) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.disposed = true;
    void this.handle?.remove();
    this.handle = undefined;
    this.listeners.clear();
  }
}

export class BrowserEventLocationProvider implements EventLocationProvider {
  capture(transitionAt: string): Promise<GpsFix> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("location_unavailable"));
        return;
      }
      const transitionMs = Date.parse(transitionAt);
      const deadlineMs = transitionMs + 30_000;
      const remainingMs = Math.min(30_000, deadlineMs - Date.now());
      if (!Number.isFinite(transitionMs) || remainingMs <= 0) {
        reject(new Error("gps_recovery_window_expired"));
        return;
      }

      let watchId: number | undefined;
      let finished = false;
      const finish = (error?: Error, fix?: GpsFix) => {
        if (finished) return;
        finished = true;
        globalThis.clearTimeout(deadline);
        if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        if (fix) resolve(fix);
        else reject(error ?? new Error("location_unavailable"));
      };
      const deadline = globalThis.setTimeout(
        () => finish(new Error("location_timeout")),
        remainingMs,
      );

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const fix: GpsFix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            horizontalAccuracyM: position.coords.accuracy,
            fixAt: new Date(position.timestamp).toISOString(),
            provider: "browser-geolocation",
          };
          // Keep sampling after an inaccurate/invalid candidate. Only a fix
          // accepted against the original gesture time can complete the event.
          if (validateGpsFix(fix, transitionAt, Date.now()).accepted) finish(undefined, fix);
        },
        (error) => {
          if (error.code === 1) finish(new Error("permission_denied"));
          // POSITION_UNAVAILABLE and TIMEOUT can be transient while the OS
          // reacquires a fix. Keep the watch alive until our single event-time
          // deadline; the timer above is the only terminal timeout.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: remainingMs },
      );
    });
  }
}

export class NativeEventLocationProvider implements EventLocationProvider {
  capture(transitionAt: string) {
    return NativeDriver.captureLocation({ transitionAt });
  }
}

export async function createDriverWorkflow(): Promise<{
  repository: DriverWorkflowRepository;
  location: EventLocationProvider;
  timeline: TimelineProjectionService;
}> {
  await recoverPendingBackupTransactions();
  const repository = Capacitor.isNativePlatform()
    ? new NativeDriverWorkflowRepository()
    : new DexieDriverWorkflowRepository();
  return {
    repository,
    location: Capacitor.isNativePlatform()
      ? new NativeEventLocationProvider()
      : new BrowserEventLocationProvider(),
    timeline: createTimelineProjectionService(repository),
  };
}

/** Construct the shared headless projection service around the active platform repository. */
export function createTimelineProjectionService(
  repository: Pick<DriverWorkflowRepository, "listEvents">,
  evidence?: TimelineEvidenceSource,
): TimelineProjectionService {
  return new TimelineProjectionService(repository, evidence);
}

export const nativeOverlayAvailable = () => Capacitor.isNativePlatform();

export async function enableNativeOverlay() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Native overlay is available in the Android app");
  }
  await NativeDriver.enableOverlay();
}

export async function disableNativeOverlay() {
  if (!Capacitor.isNativePlatform()) return;
  await NativeDriver.disableOverlay();
}
