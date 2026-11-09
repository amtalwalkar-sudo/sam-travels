import { describe, expect, it } from "vitest";
import { defineApplicationShell } from "../packages/presentation/src/shell-contracts";
import type { FormSubmissionPort } from "../packages/application/src/form-submission-port";

const navigation = [
  { screen: "Drive", label: "Drive", icon: "drive" },
  { screen: "Timeline", label: "Timeline", icon: "timeline" },
  { screen: "Performance", label: "Performance", icon: "performance" },
  { screen: "Admin", label: "Admin", icon: "admin" },
] as const;

describe("framework-neutral presentation shell contract", () => {
  it("allows a replacement shell to consume the same screen capabilities", () => {
    const original = defineApplicationShell({ id: "sam-travels.bottom-navigation", version: 1, initialScreen: "Drive", navigation });
    const replacement = defineApplicationShell({ id: "sam-travels.sidebar-navigation", version: 2, initialScreen: "Timeline", navigation });
    expect(original.navigation.map(item => item.screen)).toEqual(["Drive", "Timeline", "Performance", "Admin"]);
    expect(replacement.navigation).toEqual(original.navigation);
    expect(replacement.initialScreen).toBe("Timeline");
    expect(Object.isFrozen(replacement)).toBe(true);
    expect(Object.isFrozen(replacement.navigation[0])).toBe(true);
  });

  it("rejects duplicate screens and an unregistered initial screen", () => {
    expect(() => defineApplicationShell({
      id: "duplicate", version: 1, initialScreen: "Drive",
      navigation: [{ screen: "Drive", label: "Drive", icon: "drive" }, { screen: "Drive", label: "Another Drive", icon: "drive" }],
    })).toThrow("Duplicate shell screen");
    expect(() => defineApplicationShell({
      id: "missing-initial", version: 1,
      initialScreen: "Settings" as typeof navigation[number]["screen"], navigation,
    })).toThrow("Initial shell screen is not registered");
  });
});

describe("application form submission boundary", () => {
  it("keeps form versions, operation identity, action and values behind one application port", async () => {
    const received: string[] = [];
    const applicationPort: FormSubmissionPort<{ accepted: boolean }> = {
      async submit(submission) {
        received.push(submission.formId + ":" + submission.formVersion + ":" + submission.operationId + ":" + submission.action);
        return { accepted: true };
      },
    };
    await expect(applicationPort.submit({
      formId: "work-note", formVersion: 1, operationId: "note-op-1", action: "submit", values: { note: "test" },
    })).resolves.toEqual({ accepted: true });
    await expect(applicationPort.submit({
      formId: "work-note", formVersion: 2, operationId: "note-op-2", action: "submit",
      values: { note: "test", recordedOn: "2026-11-05" },
    })).resolves.toEqual({ accepted: true });
    expect(received).toEqual(["work-note:1:note-op-1:submit", "work-note:2:note-op-2:submit"]);
  });
});
