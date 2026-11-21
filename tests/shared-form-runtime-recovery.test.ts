import { describe, expect, it } from "vitest";
import {
  SharedFormRuntime,
  type FormDefinition,
  type FormWorkingCopy,
  type FormWorkingCopyRepository,
} from "../packages/application/src/shared-form-runtime";

class MemoryCopies implements FormWorkingCopyRepository {
  private readonly rows = new Map<string, FormWorkingCopy>();
  async get(formId: string, instanceId: string) { return this.rows.get(formId + ":" + instanceId); }
  async list(formId: string) { return [...this.rows.values()].filter(copy => copy.formId === formId); }
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

describe("durable shared form submission recovery", () => {
  it("persists pending intent before dispatch and retries it after runtime recreation", async () => {
    const copies = new MemoryCopies();
    const commands: unknown[] = [];
    const firstRuntime = new SharedFormRuntime(copies, {
      submit: async command => { commands.push(command); throw new Error("failure_before_domain_commit"); },
    }, () => "2026-11-10T09:00:00.000Z", () => "durable-operation-1");
    let copy = await firstRuntime.open(definition, "trip-retry");
    copy = await firstRuntime.update(definition, copy, "farePaise", 2500);
    copy = await firstRuntime.update(definition, copy, "tripDate", "2026-11-10");
    await expect(firstRuntime.submit(definition, copy)).rejects.toThrow("failure_before_domain_commit");
    const pending = await copies.get(definition.id, "trip-retry");
    expect(pending).toMatchObject({ status: "pending", revision: 3, operationId: "durable-operation-1" });
    expect(pending?.submission).toMatchObject({ action: "submit", submittedAt: "2026-11-10T09:00:00.000Z" });

    const retryRuntime = new SharedFormRuntime(copies, {
      submit: async command => { commands.push(command); return { recordId: "record-1" }; },
    }, () => "2026-11-10T10:00:00.000Z", () => "must-not-replace-pending-operation");
    const reopened = await retryRuntime.open(definition, "trip-retry");
    const result = await retryRuntime.submit(definition, reopened);
    expect(result).toEqual({ recordId: "record-1" });
    expect(commands[1]).toEqual(commands[0]);
    expect(await copies.get(definition.id, "trip-retry")).toMatchObject({ status: "submitted", revision: 4 });
  });

  it("shares one in-flight durable submission result across concurrent taps", async () => {
    const copies = new MemoryCopies();
    let calls = 0;
    let release!: (value: unknown) => void;
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const runtime = new SharedFormRuntime(copies, {
      submit: async () => {
        calls += 1;
        markStarted();
        return new Promise(resolve => { release = resolve; });
      },
    }, () => "2026-11-10T09:00:00.000Z", () => "concurrent-operation");
    let copy = await runtime.open(definition, "trip-concurrent");
    copy = await runtime.update(definition, copy, "farePaise", 2500);
    copy = await runtime.update(definition, copy, "tripDate", "2026-11-10");
    const first = runtime.submit(definition, copy);
    const second = runtime.submit(definition, copy);
    await started;
    expect(calls).toBe(1);
    release({ recordId: "same-record" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { recordId: "same-record" }, { recordId: "same-record" },
    ]);
  });

  it("fails closed if a pending operation payload is changed under the same identity", async () => {
    const copies = new MemoryCopies();
    const runtime = new SharedFormRuntime(copies, {
      submit: async () => { throw new Error("simulated_interruption"); },
    }, () => "2026-11-10T09:00:00.000Z", () => "immutable-operation");
    let copy = await runtime.open(definition, "trip-payload-change");
    copy = await runtime.update(definition, copy, "farePaise", 2500);
    copy = await runtime.update(definition, copy, "tripDate", "2026-11-10");
    await expect(runtime.submit(definition, copy)).rejects.toThrow("simulated_interruption");
    const pending = (await copies.get(definition.id, "trip-payload-change"))!;
    await copies.put({
      ...pending, revision: pending.revision + 1,
      submission: { ...pending.submission!, values: { ...pending.submission!.values, farePaise: 9999 } },
    }, pending.revision);
    const reopened = await runtime.open(definition, "trip-payload-change");
    const retry = new SharedFormRuntime(copies, { submit: async () => ({}) });
    await expect(retry.submit(definition, reopened)).rejects.toThrow("form_submission_payload_identity_invalid");
  });

  it("includes durable pending submissions in the resumable working-copy list", async () => {
    const copies = new MemoryCopies();
    const runtime = new SharedFormRuntime(copies, {
      submit: async () => { throw new Error("interrupted"); },
    }, () => "2026-11-10T09:00:00.000Z", () => "pending-list-operation");
    let copy = await runtime.open(definition, "trip-pending-list");
    copy = await runtime.update(definition, copy, "farePaise", 500);
    copy = await runtime.update(definition, copy, "tripDate", "2026-11-10");
    await expect(runtime.submit(definition, copy)).rejects.toThrow("interrupted");
    const resumable = await runtime.listDrafts(definition);
    expect(resumable.map(item => item.instanceId)).toContain("trip-pending-list");
    expect(resumable.find(item => item.instanceId === "trip-pending-list"))
      .toMatchObject({ status: "pending", operationId: "pending-list-operation" });
  });
});
