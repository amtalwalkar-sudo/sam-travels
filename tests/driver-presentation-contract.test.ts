import { describe, expect, it } from "vitest";
import { driverPresentationContract, driverPresentationCssVars } from "../apps/web/src/ui/driver-presentation";

describe("shared driver visual presentation", () => {
  it("exposes the shared tokens to PWA components", () => {
    const cssVars = driverPresentationCssVars as unknown as Record<string, string>;
    expect(driverPresentationContract.version).toBe(1);
    expect(cssVars["--driver-surface"]).toBe("#F6F9FA");
    expect(cssVars["--driver-accent"]).toBe("#254F65");
    expect(cssVars["--driver-field-height"]).toBe("48px");
    expect(cssVars["--driver-card-radius"]).toBe("13px");
  });

  it("keeps compact overlay sizing independent from the PWA layout", () => {
    expect(driverPresentationContract.principles.identicalLayoutsRequired).toBe(false);
    expect(driverPresentationContract.principles.overlayUsesCompactLayout).toBe(true);
    expect(driverPresentationContract.spacing.overlayCompactPadding).toBeLessThan(
      driverPresentationContract.spacing.webCardPadding + driverPresentationContract.spacing.overlayPanelPadding,
    );
    expect(driverPresentationContract.sizing.overlayWidth).toBeGreaterThan(0);
    expect(driverPresentationContract.sizing.overlayMaxHeight).toBeGreaterThan(0);
  });

  it("defines explicit shared visual states", () => {
    expect(Object.keys(driverPresentationContract.visualStates).sort()).toEqual([
      "default", "disabled", "error", "pending", "success",
    ]);
  });
});
