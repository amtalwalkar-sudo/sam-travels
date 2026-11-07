import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { FeatureRecordService } from "./feature-record-service";

export type BusinessSettingsRecordV1 = Readonly<{
  schemaVersion: 1;
  businessStartDate: string;
}>;

export type BusinessSettingsRecordValidator = (value: unknown) => asserts value is BusinessSettingsRecordV1;

/** The business-wide singleton has a stable identity; edits never mint new records. */
export const BUSINESS_SETTINGS_RECORD_ID = "feature:business-settings:business";

/**
 * Application orchestration stays independent of feature packages.
 * The owning feature supplies its validator at the composition boundary.
 */
export class BusinessSettingsService {
  private readonly records: FeatureRecordService<BusinessSettingsRecordV1>;

  constructor(
    repository: AtomicRecordRepository,
    validate: BusinessSettingsRecordValidator,
    now?: () => string,
  ) {
    this.records = new FeatureRecordService(
      repository,
      {
        featureId: "business-settings",
        recordIdPrefix: "feature:business-settings:",
        validate,
      },
      now,
    );
  }

  async get(): Promise<RecordEnvelope<BusinessSettingsRecordV1> | undefined> {
    return this.records.get(BUSINESS_SETTINGS_RECORD_ID);
  }

  async setBusinessStartDate(
    businessStartDate: string,
    source: "web" | "android" | "import" | "integration",
  ): Promise<RecordEnvelope<BusinessSettingsRecordV1>> {
    const data: BusinessSettingsRecordV1 = { schemaVersion: 1, businessStartDate };
    const current = await this.get();
    if (!current) {
      return this.records.create({ id: BUSINESS_SETTINGS_RECORD_ID, data, source });
    }
    return this.records.update({
      id: BUSINESS_SETTINGS_RECORD_ID,
      expectedRevision: current.revision,
      data,
    });
  }
}
