import { Capacitor, registerPlugin } from "@capacitor/core";

type TimelineEnrichmentNativeApi = { schedule(): Promise<void> };
const NativeTimelineEnrichment = registerPlugin<TimelineEnrichmentNativeApi>("TimelineEnrichment");

/** Android WorkManager owns deferred execution; browser PWA drains on online/resume events. */
export function scheduleNativeTimelineEnrichment(): Promise<void> {
  return Capacitor.isNativePlatform() ? NativeTimelineEnrichment.schedule() : Promise.resolve();
}
