import { describe, expect, it } from "vitest";
import { ALL_FORM_DEFINITIONS } from "../packages/application/src";

describe("complete persisted form-definition inventory", () => {
  it("contains unique, versioned, feature-owned forms with one primary action", () => {
    const ids = ALL_FORM_DEFINITIONS.map((form) => form.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_FORM_DEFINITIONS.length).toBe(19);

    for (const form of ALL_FORM_DEFINITIONS) {
      expect(form.id.trim().length).toBeGreaterThan(0);
      expect(Number.isSafeInteger(form.version)).toBe(true);
      expect(form.version).toBeGreaterThan(0);
      expect(form.owner.trim().length).toBeGreaterThan(0);
      expect(form.purpose.trim().length).toBeGreaterThan(0);
      expect(["save", "submit"]).toContain(form.primaryAction);
      expect(form.fields.length).toBeGreaterThan(0);
      const fieldIds = form.fields.map((field) => field.id);
      expect(new Set(fieldIds).size).toBe(fieldIds.length);
      for (const field of form.fields) {
        expect(field.id.trim().length).toBeGreaterThan(0);
        expect(field.label.trim().length).toBeGreaterThan(0);
        expect(["text", "number", "date", "select", "checkbox"]).toContain(field.type);
        if (field.type === "select") expect(field.options?.length).toBeGreaterThan(0);
      }
    }
  });

  it("includes the separate Performance and Work/Fuel form definitions", () => {
    expect(ALL_FORM_DEFINITIONS.map((form) => form.id)).toEqual(expect.arrayContaining([
      "admin.performance-driver-target",
      "admin.pre-business-cost",
      "work.fuel-entry",
      "work.trip-completed-financials",
      "work.trip-cancellation-fee",
    ]));
  });
});
