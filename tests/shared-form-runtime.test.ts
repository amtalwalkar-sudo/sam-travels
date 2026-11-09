import { describe, expect, it } from "vitest";
import {
  SharedFormRuntime, validateFormValues,
  type FormDefinition, type FormWorkingCopy, type FormWorkingCopyRepository,
} from "../packages/application/src/shared-form-runtime";

class MemoryCopies implements FormWorkingCopyRepository {
  private readonly rows = new Map<string, FormWorkingCopy>();
  async get(formId: string, instanceId: string) { return this.rows.get(formId + ":" + instanceId); }
  async put(copy: FormWorkingCopy, expectedRevision?: number) {
    const key = copy.formId + ":" + copy.instanceId;
    const current = this.rows.get(key);
    if (expectedRevision !== undefined && current?.revision !== expectedRevision) throw new Error("form_copy_revision_conflict");
    if (expectedRevision === undefined && current) throw new Error("form_copy_already_exists");
    this.rows.set(key, copy);
  }
  async remove(formId: string, instanceId: string) { this.rows.delete(formId + ":" + instanceId); }
}

const definition: FormDefinition = {
  id: "work.trip-fare", version: 1, owner: "work", purpose: "Finalize a completed trip fare",
  primaryAction: "submit",
  fields: [
    { id: "farePaise", label: "Fare", type: "number", required: true },
    { id: "tripDate", label: "Trip date", type: "date", required: true },
    { id: "payer", label: "Toll payer", type: "select", options: ["Driver", "Customer"] },
  ],
};

describe("shared form runtime", () => {
  it("validates declared field mechanics without inventing feature business rules", () => {
    expect(validateFormValues(definition, {})).toEqual([
      { fieldId: "farePaise", code: "required", message: "Fare is required." },
      { fieldId: "tripDate", code: "required", message: "Trip date is required." },
    ]);
    expect(validateFormValues(definition, { farePaise: 0, tripDate: "2026-11-10", payer: "Customer" })).toEqual([]);
    expect(validateFormValues(definition, { farePaise: -10, tripDate: "2026-11-10" })).toEqual([]);
    expect(validateFormValues(definition, { farePaise: 10, tripDate: "2026-02-31" })).toMatchObject([{ fieldId: "tripDate", code: "date" }]);
  });

  it("restores an in-progress working copy without treating it as submitted", async () => {
    const copies = new MemoryCopies();
    const runtime = new SharedFormRuntime(copies, { submit: async () => ({ ok: true }) }, () => "2026-11-10T00:00:00.000Z", () => "operation-1");
    const opened = await runtime.open(definition, "trip-123");
    const edited = await runtime.update(definition, opened, "farePaise", 0);
    const reopened = await runtime.open(definition, "trip-123");
    expect(reopened).toMatchObject({ status: "in_progress", revision: 1, values: { farePaise: 0 }, operationId: "operation-1" });
    expect(reopened).toEqual(edited);
  });

  it("submits once and marks the working copy submitted only after durable success", async () => {
    const copies = new MemoryCopies();
    let submissions = 0;
    const runtime = new SharedFormRuntime(copies, {
      submit: async command => { submissions += 1; expect(command.action).toBe("submit"); return { operationId: command.operationId }; },
    }, () => "2026-11-10T00:00:00.000Z", () => "operation-2");
    let copy = await runtime.open(definition, "trip-456");
    copy = await runtime.update(definition, copy, "farePaise", 0);
    copy = await runtime.update(definition, copy, "tripDate", "2026-11-10");
    const result = await runtime.submit(definition, copy);
    expect(result).toEqual({ operationId: "operation-2" });
    expect(submissions).toBe(1);
    expect(await copies.get(definition.id, "trip-456")).toMatchObject({ status: "submitted", revision: 3 });
    await expect(runtime.submit(definition, copy)).rejects.toThrow("form_copy_revision_conflict");
    expect(submissions).toBe(1);
  });

  it("saves incomplete drafts, allows edits, and marks them saved only after Save succeeds", async () => {
    const copies = new MemoryCopies();
    const actions: string[] = [];
    const saveDefinition = { ...definition, id: "admin.vehicle", primaryAction: "save" as const };
    const runtime = new SharedFormRuntime(copies, { submit: async command => { actions.push(command.action); return "saved"; } },
      () => "2026-11-10T00:00:00.000Z", () => "operation-save");
    let copy = await runtime.open(saveDefinition, "vehicle-1");
    await runtime.save(saveDefinition, copy);
    copy = (await copies.get(saveDefinition.id, "vehicle-1"))!;
    expect(copy).toMatchObject({ status: "saved", revision: 1, values: {} });
    copy = await runtime.update(saveDefinition, copy, "farePaise", 0);
    expect(copy.status).toBe("in_progress");
    await runtime.save(saveDefinition, copy);
    expect(actions).toEqual(["save", "save"]);
    expect(await copies.get(saveDefinition.id, "vehicle-1")).toMatchObject({ status: "saved", revision: 3 });
  });

  it("does not submit invalid data or permit Submit on Save-only forms", async () => {
    let submissions = 0;
    const runtime = new SharedFormRuntime(new MemoryCopies(), { submit: async () => { submissions += 1; } }, undefined, () => "operation-3");
    const copy = await runtime.open(definition, "trip-789");
    await expect(runtime.submit(definition, copy)).rejects.toThrow("form_validation_failed");
    const saveOnly = { ...definition, id: "admin.vehicle", primaryAction: "save" as const };
    const draft = await runtime.open(saveOnly, "vehicle-1");
    await expect(runtime.submit(saveOnly, draft)).rejects.toThrow("form_primary_action_is_save");
    expect(submissions).toBe(0);
  });

  it("rejects stale working-copy revisions rather than overwriting newer values", async () => {
    const copies = new MemoryCopies();
    const runtime = new SharedFormRuntime(copies, { submit: async () => undefined }, undefined, () => "operation-4");
    const opened = await runtime.open(definition, "trip-conflict");
    await runtime.update(definition, opened, "farePaise", 12500);
    await expect(runtime.update(definition, opened, "farePaise", 999)).rejects.toThrow("form_copy_revision_conflict");
    expect(await copies.get(definition.id, "trip-conflict")).toMatchObject({ values: { farePaise: 12500 }, revision: 1 });
  });
});
