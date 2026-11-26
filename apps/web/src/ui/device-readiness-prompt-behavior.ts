/** Shared focus/visibility callback used when the WebView returns from Android Settings. */
export function createDeviceReadinessResumeHandler(
  refresh: () => Promise<unknown>,
  visibilityState: () => string,
): () => void {
  return () => {
    if (visibilityState() === "visible") void refresh();
  };
}
