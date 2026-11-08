import { Capacitor, registerPlugin } from "@capacitor/core";

type TimelineEnrichmentNativeApi = {
  schedule(): Promise<void>;
  addListener(event: "enrichmentChanged", listener: () => void): Promise<{ remove(): Promise<void> }>;
};
const NativeTimelineEnrichment = registerPlugin<TimelineEnrichmentNativeApi>("TimelineEnrichment");

/** Android WorkManager owns deferred execution; browser PWA drains on online/resume events. */
export function scheduleNativeTimelineEnrichment(): Promise<void> {
  return Capacitor.isNativePlatform() ? NativeTimelineEnrichment.schedule() : Promise.resolve();
}

export function listenForNativeTimelineEnrichment(listener: () => void) {
  return Capacitor.isNativePlatform()
    ? NativeTimelineEnrichment.addListener("enrichmentChanged", listener)
    : Promise.resolve(undefined);
}
