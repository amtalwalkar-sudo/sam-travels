import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { assertBusinessSettingsRecordV1, type BusinessSettingsRecordV1 } from "../../features/business-settings";
import { FeatureRecordService } from "./feature-record-service";

/** The business-wide singleton has a stable identity; edits never mint new records. */
export const BUSINESS_SETTINGS_RECORD_ID = "feature:business-settings:business";

export class BusinessSettingsService {
  private readonly records: FeatureRecordService<BusinessSettingsRecordV1>;

  constructor(repository: AtomicRecordRepository, now?: () => string) {
    this.records = new FeatureRecordService(
      repository,
      {
        featureId: "business-settings",
        recordIdPrefix: "feature:business-settings:",
        validate: assertBusinessSettingsRecordV1,
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
    assertBusinessSettingsRecordV1(data);
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
