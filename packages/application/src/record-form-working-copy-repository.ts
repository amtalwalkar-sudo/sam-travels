import type { AtomicRecordRepository, RecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { FormWorkingCopy, FormWorkingCopyRepository } from "./shared-form-runtime";

const PREFIX = "__sam_travels_form_working_copy__:";
function recordId(formId: string, instanceId: string) {
  return PREFIX + encodeURIComponent(formId) + ":" + encodeURIComponent(instanceId);
}

/** Stores form working copies in the same authoritative record store used by both platforms. */
export class RecordFormWorkingCopyRepository implements FormWorkingCopyRepository {
  constructor(
    private readonly records: RecordRepository & AtomicRecordRepository,
    private readonly source: RecordEnvelope<unknown>["source"],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async get(formId: string, instanceId: string): Promise<FormWorkingCopy | undefined> {
    const record = await this.records.get<FormWorkingCopy>(recordId(formId, instanceId));
    if (!record || record.deletedAt) return undefined;
    const copy = record.data;
    if (copy.formId !== formId || copy.instanceId !== instanceId ||
        !Number.isSafeInteger(copy.formVersion) || copy.formVersion < 1 ||
        !Number.isSafeInteger(copy.revision) || copy.revision < 0 ||
        !["in_progress", "pending", "saved", "submitted"].includes(copy.status) ||
        !copy.operationId || !copy.values || typeof copy.values !== "object" || Array.isArray(copy.values)) {
      throw new Error("form_working_copy_invalid");
    }
    return copy;
  }

  async put(copy: FormWorkingCopy, expectedRevision?: number): Promise<void> {
    const id = recordId(copy.formId, copy.instanceId);
    const previous = await this.records.get<FormWorkingCopy>(id);
    const expectedEnvelopeRevision = expectedRevision === undefined ? null : expectedRevision + 1;
    if ((expectedRevision === undefined && previous && !previous.deletedAt) ||
        (expectedRevision !== undefined && (previous?.deletedAt || previous?.revision !== expectedEnvelopeRevision))) {
      throw new Error("form_copy_revision_conflict");
    }
    const timestamp = this.now();
    const next: RecordEnvelope<FormWorkingCopy> = {
      id, schemaVersion: 1, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp,
      source: this.source, revision: (previous?.revision ?? 0) + 1, data: copy,
    };
    const saved = await this.records.compareAndSet(id, previous?.revision ?? null, next);
    if (!saved) throw new Error("form_copy_revision_conflict");
  }

  async remove(formId: string, instanceId: string): Promise<void> {
    await this.records.remove(recordId(formId, instanceId));
  }
}
