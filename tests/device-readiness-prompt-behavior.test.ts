import { describe, expect, it, vi } from "vitest";
import { createDeviceReadinessResumeHandler } from "../apps/web/src/ui/device-readiness-prompt-behavior";

describe("Device Readiness return from Android Settings", () => {
  it("rechecks when the WebView regains focus or visibility", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const handler = createDeviceReadinessResumeHandler(refresh, () => "visible");
    handler(); // window focus
    handler(); // document visibilitychange
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not run a readiness check while the WebView remains hidden", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const handler = createDeviceReadinessResumeHandler(refresh, () => "hidden");
    handler();
    expect(refresh).not.toHaveBeenCalled();
  });
});
