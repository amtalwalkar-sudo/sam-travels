import { describe, expect, it } from "vitest";
import { defineApplicationShell } from "../packages/presentation/src/shell-contracts";

const navigation = [
  { screen: "Drive", label: "Drive", icon: "drive" },
  { screen: "Timeline", label: "Timeline", icon: "timeline" },
  { screen: "Performance", label: "Performance", icon: "performance" },
] as const;

describe("framework-neutral presentation shell contract", () => {
  it("allows a replacement shell to consume the same screen capabilities", () => {
    const original = defineApplicationShell({
      id: "sam-travels.bottom-navigation",
      version: 1,
      initialScreen: "Drive",
      navigation,
    });
    const replacement = defineApplicationShell({
      id: "sam-travels.sidebar-navigation",
      version: 2,
      initialScreen: "Timeline",
      navigation,
    });

    expect(original.navigation.map(item => item.screen)).toEqual(["Drive", "Timeline", "Performance"]);
    expect(replacement.navigation).toEqual(original.navigation);
    expect(replacement.initialScreen).toBe("Timeline");
    expect(Object.isFrozen(replacement)).toBe(true);
    expect(Object.isFrozen(replacement.navigation[0])).toBe(true);
  });

  it("rejects duplicate screens and an unregistered initial screen", () => {
    expect(() => defineApplicationShell({
      id: "duplicate",
      version: 1,
      initialScreen: "Drive",
      navigation: [
        { screen: "Drive", label: "Drive", icon: "drive" },
        { screen: "Drive", label: "Another Drive", icon: "drive" },
      ],
    })).toThrow("Duplicate shell screen");

    expect(() => defineApplicationShell({
      id: "missing-initial",
      version: 1,
      initialScreen: "Settings",
      navigation,
    })).toThrow("Initial shell screen is not registered");
  });
});
