import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import type { PreBusinessRecoverySourceV1 } from "../../domain/src/performance-calculation-v1";
import type { BusinessSettingsService } from "./business-settings-service";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";
import type {
  PerformanceBusinessSettingsReadModel,
  PerformanceDriverTargetReadModel,
  PerformanceManualPreBusinessCostReadModel,
} from "./performance-calculation-service";

export const PERFORMANCE_ADMIN_SETTINGS_RECORD_ID = "feature:performance:settings";
const PERFORMANCE_RECORD_PREFIX = "feature:performance:";
const PRE_BUSINESS_COST_PREFIX = PERFORMANCE_RECORD_PREFIX + "pre-business-cost:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PerformanceAdminSettingsRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: "settings";
  monthlyDriverTargetPaise: number;
}>;
export type PerformancePreBusinessCostRecordV1 = Readonly<{
  schemaVersion: 1;
  kind: "pre_business_cost";
  amountPaise: number;
  note: string;
  commandId: string;
}>;
type PerformanceAdminRecordV1 = PerformanceAdminSettingsRecordV1 | PerformancePreBusinessCostRecordV1;

function validatePerformanceAdminRecord(value: unknown): asserts value is PerformanceAdminRecordV1 {
  if (!value || typeof value !== "object" || (value as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error("performance_admin_record_invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "settings") {
    if (!Number.isSafeInteger(record.monthlyDriverTargetPaise) ||
        (record.monthlyDriverTargetPaise as number) < 0) {
      throw new Error("performance_driver_target_invalid");
    }
    return;
  }
  if (record.kind === "pre_business_cost") {
    if (!Number.isSafeInteger(record.amountPaise) || (record.amountPaise as number) <= 0 ||
        typeof record.note !== "string" || !record.note.trim() ||
        typeof record.commandId !== "string" || !UUID.test(record.commandId)) {
      throw new Error("performance_pre_business_cost_invalid");
    }
    return;
  }
  throw new Error("performance_admin_record_kind_invalid");
}

/** Admin-owned, revisioned target and append-only pre-business cost source records. */
export class PerformanceAdminSettingsServiceV1
implements PerformanceDriverTargetReadModel, PerformanceManualPreBusinessCostReadModel {
  private readonly records: FeatureRecordService<PerformanceAdminRecordV1>;

  constructor(repository: AtomicRecordRepository, now?: () => string) {
    this.records = new FeatureRecordService(repository, {
      featureId: "performance",
      recordIdPrefix: PERFORMANCE_RECORD_PREFIX,
      validate: validatePerformanceAdminRecord,
    }, now);
  }

  async getSettings(): Promise<RecordEnvelope<PerformanceAdminSettingsRecordV1> | undefined> {
    const record = await this.records.get(PERFORMANCE_ADMIN_SETTINGS_RECORD_ID);
    if (!record) return undefined;
    if (record.data.kind !== "settings") throw new Error("performance_admin_settings_identity_mismatch");
    return record as RecordEnvelope<PerformanceAdminSettingsRecordV1>;
  }

  async setMonthlyDriverTargetPaise(
    monthlyDriverTargetPaise: number,
    source: FeatureRecordSource,
  ): Promise<RecordEnvelope<PerformanceAdminSettingsRecordV1>> {
    if (!Number.isSafeInteger(monthlyDriverTargetPaise) || monthlyDriverTargetPaise < 0) {
      throw new Error("performance_driver_target_invalid");
    }
    const data: PerformanceAdminSettingsRecordV1 = {
      schemaVersion: 1, kind: "settings", monthlyDriverTargetPaise,
    };
    const current = await this.getSettings();
    if (!current) {
      return this.records.create({
        id: PERFORMANCE_ADMIN_SETTINGS_RECORD_ID, data, source,
      }) as Promise<RecordEnvelope<PerformanceAdminSettingsRecordV1>>;
    }
    return this.records.update({
      id: PERFORMANCE_ADMIN_SETTINGS_RECORD_ID, expectedRevision: current.revision, data,
    }) as Promise<RecordEnvelope<PerformanceAdminSettingsRecordV1>>;
  }

  async getMonthlyTargetPaise(): Promise<number> {
    const settings = await this.getSettings();
    if (!settings) throw new Error("performance_driver_target_not_configured");
    return settings.data.monthlyDriverTargetPaise;
  }

  async createPreBusinessCost(input: {
    commandId: string;
    amountPaise: number;
    note: string;
    source: FeatureRecordSource;
  }): Promise<RecordEnvelope<PerformancePreBusinessCostRecordV1>> {
    if (!UUID.test(input.commandId) || !Number.isSafeInteger(input.amountPaise) ||
        input.amountPaise <= 0 || typeof input.note !== "string" || !input.note.trim()) {
      throw new Error("performance_pre_business_cost_invalid");
    }
    const commandId = input.commandId.toLowerCase();
    const id = PRE_BUSINESS_COST_PREFIX + commandId;
    const existing = await this.records.get(id);
    if (existing) {
      if (existing.data.kind !== "pre_business_cost" ||
          existing.data.amountPaise !== input.amountPaise || existing.data.note !== input.note.trim() ||
          existing.data.commandId !== commandId) {
        throw new Error("performance_pre_business_cost_idempotency_conflict");
      }
      return existing as RecordEnvelope<PerformancePreBusinessCostRecordV1>;
    }
    const data: PerformancePreBusinessCostRecordV1 = {
      schemaVersion: 1, kind: "pre_business_cost",
      amountPaise: input.amountPaise, note: input.note.trim(), commandId,
    };
    return this.records.create({ id, data, source: input.source }) as Promise<RecordEnvelope<PerformancePreBusinessCostRecordV1>>;
  }

  async listEntries(): Promise<readonly PreBusinessRecoverySourceV1[]> {
    const records = await this.records.list();
    return Object.freeze(records.flatMap(record => {
      if (record.data.kind !== "pre_business_cost") return [];
      return [Object.freeze({
        sourceId: record.id, revision: record.revision,
        amountPaise: record.data.amountPaise, note: record.data.note, origin: "manual" as const,
      })];
    }));
  }
}

/** Small adapter so the calculation service reads the authoritative business-wide start date. */
export class PerformanceBusinessSettingsAdapterV1 implements PerformanceBusinessSettingsReadModel {
  constructor(private readonly settings: Pick<BusinessSettingsService, "get">) {}
  async getBusinessStartDate(): Promise<string> {
    const settings = await this.settings.get();
    if (!settings) throw new Error("business_start_date_not_configured");
    return settings.data.businessStartDate;
  }
}
