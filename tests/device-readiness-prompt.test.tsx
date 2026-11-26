import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeviceReadinessPrompt } from "../apps/web/src/ui/DeviceReadinessPrompt";
import {
  getDeviceReadinessStatus,
  isAndroidRuntime,
  openDeviceReadinessSetting,
} from "../apps/web/src/platform/device-readiness";

vi.mock("../apps/web/src/platform/device-readiness", () => ({
  getDeviceReadinessStatus: vi.fn(),
  isAndroidRuntime: vi.fn(),
  openDeviceReadinessSetting: vi.fn(),
}));

const missingRequired = {
  manufacturer: "Google", model: "Pixel", androidVersion: 35,
  items: [
    { id: "location_services", title: "Location services", description: "Enable location.", granted: false, required: true },
    { id: "precise_location", title: "Precise location access", description: "Allow precise location.", granted: false, required: true },
    { id: "overlay_access", title: "Floating controls access", description: "Optional overlay.", granted: false, required: false },
  ],
};
const readyRequired = {
  ...missingRequired,
  items: missingRequired.items.map(item => item.required ? { ...item, granted: true } : item),
};

describe("Android Device Readiness prompt lifecycle", () => {
  beforeEach(() => {
    vi.mocked(isAndroidRuntime).mockReturnValue(true);
    vi.mocked(openDeviceReadinessSetting).mockResolvedValue({ opened: true, usedFallback: false });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("hands off to the requested Android setting and rechecks on return, closing when essentials are ready", async () => {
    vi.mocked(getDeviceReadinessStatus)
      .mockResolvedValueOnce(missingRequired)
      .mockResolvedValueOnce(readyRequired);

    render(<DeviceReadinessPrompt />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Location services/ }));
    await waitFor(() => expect(openDeviceReadinessSetting).toHaveBeenCalledWith("location_services"));

    // Android returning from Settings produces focus/visibility signals to the WebView.
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(getDeviceReadinessStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /Phone settings/ })).toBeTruthy();
  });

  it("keeps optional readiness items non-blocking until the driver opens settings", async () => {
    vi.mocked(getDeviceReadinessStatus).mockResolvedValue({
      ...readyRequired,
      items: readyRequired.items.map(item => item.required ? item : { ...item, granted: false }),
    });
    render(<DeviceReadinessPrompt />);
    await waitFor(() => expect(getDeviceReadinessStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Phone settings/ }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Floating controls access")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue to app/ })).toBeTruthy();
  });
});
