import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { DexieRecordRepository } from "../packages/storage-browser/src";
import { RecordFormWorkingCopyRepository } from "../packages/application/src/record-form-working-copy-repository";
import { SharedFormRuntime, type FormDefinition } from "../packages/application/src/shared-form-runtime";
import { FeatureRecordService } from "../packages/application/src/feature-record-service";
import type { FormSubmissionCommand } from "../packages/application/src/form-submission-port";
import type { FormWorkingCopy } from "../packages/application/src/shared-form-runtime";

describe("authoritative record-backed form working copies", () => {
  beforeEach(async () => {
    await browserDatabase.close();
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("persists and restores a form working copy from the same record repository", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web", () => "2026-11-10T00:00:00.000Z");
    const copy: FormWorkingCopy = {
      formId: "work.trip-fare", formVersion: 1, instanceId: "trip-1", revision: 0,
      status: "in_progress", values: { farePaise: 12500 }, operationId: "op-1",
      updatedAt: "2026-11-10T00:00:00.000Z",
    };
    await copies.put(copy);
    const restored = await new RecordFormWorkingCopyRepository(records, "web").get("work.trip-fare", "trip-1");
    expect(restored).toEqual(copy);
    expect(await browserDatabase.records.count()).toBe(1);
  });

  it("lists only persisted working copies for the requested form", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web");
    const makeCopy = (formId: string, instanceId: string): FormWorkingCopy => ({
      formId, formVersion: 1, instanceId, revision: 0, status: "in_progress",
      values: { description: instanceId }, operationId: "op-" + instanceId, updatedAt: new Date().toISOString(),
    });
    await copies.put(makeCopy("admin.maintenance-visit", "visit-1"));
    await copies.put(makeCopy("admin.maintenance-expense", "expense-1"));
    await copies.put(makeCopy("admin.maintenance-visit", "visit-2"));
    expect((await copies.list("admin.maintenance-visit")).map(copy => copy.instanceId))
      .toEqual(["visit-1", "visit-2"]);
  });

  it("uses atomic revisions to reject stale writes", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web");
    const copy: FormWorkingCopy = {
      formId: "admin.vehicle", formVersion: 1, instanceId: "vehicle-1", revision: 0,
      status: "in_progress", values: {}, operationId: "op-2", updatedAt: new Date().toISOString(),
    };
    await copies.put(copy);
    await copies.put({ ...copy, revision: 1, values: { make: "Tata" } }, 0);
    await expect(copies.put({ ...copy, revision: 1, values: { make: "Other" } }, 0))
      .rejects.toThrow("form_copy_revision_conflict");
    expect(await copies.get(copy.formId, copy.instanceId)).toMatchObject({ revision: 1, values: { make: "Tata" } });
  });

  it("recovers the same committed Admin record after process death before working-copy completion", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web", () => "2026-11-19T04:00:00.000Z");
    type Data = { label: string; amountPaise: number };
    const validate = (value: unknown): asserts value is Data => {
      const data = value as Data;
      if (!data || typeof data.label !== "string" || !Number.isSafeInteger(data.amountPaise)) {
        throw new Error("form_test_record_invalid");
      }
    };
    const feature = new FeatureRecordService<Data>(records, {
      featureId: "form-submission-test", recordIdPrefix: "feature:form-submission-test:", validate,
    }, () => "2026-11-19T04:00:00.000Z");
    const definition: FormDefinition = {
      id: "admin.form-submission-test", version: 1, owner: "test", purpose: "Verify durable submission recovery",
      primaryAction: "save", fields: [
        { id: "label", label: "Label", type: "text", required: true },
        { id: "amountPaise", label: "Amount", type: "number", required: true },
      ],
    };
    let loseFirstResponse = true;
    const submit = async (command: FormSubmissionCommand) => {
      const result = await feature.create({
        id: "feature:form-submission-test:" + command.instanceId,
        data: { label: String(command.values.label), amountPaise: Number(command.values.amountPaise) },
        source: "web", now: command.submittedAt,
        operation: { operationId: command.operationId, payloadFingerprint: command.payloadFingerprint },
      });
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new Error("simulated_process_death_after_domain_commit");
      }
      return result;
    };

    let runtime = new SharedFormRuntime(copies, { submit }, () => "2026-11-19T04:00:00.000Z", () => "admin-save-operation");
    let copy = await runtime.open(definition, "record-1");
    copy = await runtime.update(definition, copy, "label", "Maintenance");
    copy = await runtime.update(definition, copy, "amountPaise", 12500);
    await expect(runtime.save(definition, copy)).rejects.toThrow("simulated_process_death_after_domain_commit");
    const committedBeforeRestart = await feature.get("feature:form-submission-test:record-1");
    expect(committedBeforeRestart).toMatchObject({
      createdAt: "2026-11-19T04:00:00.000Z",
      data: { label: "Maintenance", amountPaise: 12500 },
    });
    expect(await copies.get(definition.id, "record-1")).toMatchObject({
      status: "pending", operationId: "admin-save-operation",
    });

    await browserDatabase.close();
    await browserDatabase.open();
    runtime = new SharedFormRuntime(
      new RecordFormWorkingCopyRepository(new DexieRecordRepository(), "web"),
      { submit }, () => "2026-11-19T05:00:00.000Z", () => "new-operation-must-not-be-used",
    );
    const reopened = await runtime.open(definition, "record-1");
    const replayed = await runtime.save(definition, reopened);
    expect(replayed).toEqual(committedBeforeRestart);
    const all = await new DexieRecordRepository().list();
    expect(all.filter(row => row.id === "feature:form-submission-test:record-1")).toHaveLength(1);
    expect(all.filter(row => row.id.startsWith("__sam_travels_feature_operation__:"))).toHaveLength(1);
    expect(await new RecordFormWorkingCopyRepository(new DexieRecordRepository(), "web").get(definition.id, "record-1"))
      .toMatchObject({ status: "saved", revision: 4 });
  });

  it("removes a working copy without touching unrelated records", async () => {
    const records = new DexieRecordRepository();
    const copies = new RecordFormWorkingCopyRepository(records, "web");
    const copy: FormWorkingCopy = {
      formId: "admin.driver", formVersion: 1, instanceId: "driver-1", revision: 0,
      status: "in_progress", values: {}, operationId: "op-3", updatedAt: new Date().toISOString(),
    };
    await copies.put(copy);
    await records.put({ id: "unrelated", schemaVersion: 1, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), source: "web", revision: 1, data: { retained: true } });
    await copies.remove(copy.formId, copy.instanceId);
    expect(await copies.get(copy.formId, copy.instanceId)).toBeUndefined();
    expect(await records.get("unrelated")).toBeDefined();
  });
});
