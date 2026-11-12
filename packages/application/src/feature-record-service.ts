import { assertRecordEnvelope, RECORD_ENVELOPE_SCHEMA_VERSION } from "../../core/src/persistence-contract";
import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordAuthorV1, RecordEnvelope } from "../../core/src/types";

export type FeatureRecordDefinition<Data> = Readonly<{
  featureId: string;
  recordIdPrefix: string;
  validate(data: unknown): asserts data is Data;
}>;

export type FeatureRecordSource = RecordEnvelope<unknown>["source"];

type FeatureRecordAuthorResolver = () => Promise<RecordAuthorV1>;

/**
 * The only generic persistence entry point for feature-owned records.
 *
 * It enforces namespace ownership, the shared record envelope, feature payload
 * validation, and atomic revision checks. Domain workflows still belong to the
 * owning feature; this service deliberately knows nothing about Admin screens
 * or cross-feature relationships.
 */
export class FeatureRecordService<Data> {
  private static authorResolver?: FeatureRecordAuthorResolver;
  static setAuthorResolver(resolver: FeatureRecordAuthorResolver): void { FeatureRecordService.authorResolver = resolver; }
  constructor(
    private readonly repository: AtomicRecordRepository,
    private readonly definition: FeatureRecordDefinition<Data>,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    const expectedPrefix = "feature:" + definition.featureId + ":";
    if (!definition.featureId?.trim() ||
        (definition.recordIdPrefix !== expectedPrefix && !definition.recordIdPrefix.startsWith(expectedPrefix)) ||
        typeof definition.validate !== "function") {
      throw new Error("feature_record_definition_invalid");
    }
  }

  private assertOwnedId(id: string): void {
    if (typeof id !== "string" || !id.startsWith(this.definition.recordIdPrefix) ||
        id.length <= this.definition.recordIdPrefix.length || id.trim() !== id) {
      throw new Error("feature_record_namespace_mismatch:" + this.definition.featureId);
    }
  }

  private assertOwnedRecord(record: RecordEnvelope<unknown>): asserts record is RecordEnvelope<Data> {
    assertRecordEnvelope(record);
    this.assertOwnedId(record.id);
    this.definition.validate(record.data);
  }

  async create(input: {
    id: string;
    data: Data;
    source: FeatureRecordSource;
    businessDate?: string;
    now?: string;
    createdBy?: RecordAuthorV1;
  }): Promise<RecordEnvelope<Data>> {
    this.assertOwnedId(input.id);
    this.definition.validate(input.data);
    const timestamp = input.now ?? this.now();
    const createdBy = input.createdBy ?? (FeatureRecordService.authorResolver ? await FeatureRecordService.authorResolver() : undefined);
    if (FeatureRecordService.authorResolver && !createdBy) throw new Error("business_actor_not_active");
    const record: RecordEnvelope<Data> = {
      id: input.id,
      schemaVersion: RECORD_ENVELOPE_SCHEMA_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
      businessDate: input.businessDate,
      source: input.source,
      revision: 1,
      ...(createdBy ? { createdBy } : {}),
      data: input.data,
    };
    assertRecordEnvelope(record);
    const committed = await this.repository.compareAndSet(input.id, null, record);
    if (!committed) throw new Error("feature_record_already_exists:" + input.id);
    return record;
  }

  async update(input: {
    id: string;
    expectedRevision: number;
    data: Data;
    now?: string;
  }): Promise<RecordEnvelope<Data>> {
    this.assertOwnedId(input.id);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new Error("feature_record_expected_revision_invalid");
    }
    this.definition.validate(input.data);
    const current = await this.repository.get<unknown>(input.id);
    if (!current) throw new Error("feature_record_not_found:" + input.id);
    this.assertOwnedRecord(current);
    if (current.revision !== input.expectedRevision) {
      throw new Error("feature_record_stale_revision:" + input.id);
    }
    const next: RecordEnvelope<Data> = {
      ...current,
      updatedAt: input.now ?? this.now(),
      revision: current.revision + 1,
      data: input.data,
    };
    assertRecordEnvelope(next);
    const committed = await this.repository.compareAndSet(input.id, input.expectedRevision, next);
    if (!committed) throw new Error("feature_record_stale_revision:" + input.id);
    return next;
  }

  async get(id: string): Promise<RecordEnvelope<Data> | undefined> {
    this.assertOwnedId(id);
    const record = await this.repository.get<unknown>(id);
    if (!record) return undefined;
    this.assertOwnedRecord(record);
    return record;
  }

  async list(): Promise<Array<RecordEnvelope<Data>>> {
    const records = await this.repository.list<unknown>();
    return records
      .filter(record => record.id.startsWith(this.definition.recordIdPrefix))
      .map(record => {
        this.assertOwnedRecord(record);
        return record;
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
