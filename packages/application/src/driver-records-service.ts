import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { driverRecordId } from "../../domain/src/driver-record-identity";
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

export type DriverLifecycleState = "active" | "inactive";
export type DriverRecordV1 = Readonly<{
  schemaVersion: 1;
  driverId: string;
  name: string;
  licenceNumber?: string;
  licenceExpiryDate?: string;
  mobileNumber?: string;
  lifecycleState: DriverLifecycleState;
}>;
export type DriverRecordValidator = (value: unknown) => asserts value is DriverRecordV1;

/** Driver profile persistence is isolated from Work's operational state machine. */
export class DriverRecordsService {
  private readonly records: FeatureRecordService<DriverRecordV1>;

  constructor(repository: AtomicRecordRepository, validate: DriverRecordValidator, now?: () => string) {
    this.records = new FeatureRecordService(repository, {
      featureId: "driver-records",
      recordIdPrefix: "feature:driver-records:driver:",
      validate,
    }, now);
  }

  async create(
    data: DriverRecordV1,
    source: FeatureRecordSource,
  ): Promise<RecordEnvelope<DriverRecordV1>> {
    return this.records.create({ id: driverRecordId(data.driverId), data, source });
  }

  async get(driverId: string): Promise<RecordEnvelope<DriverRecordV1> | undefined> {
    return this.records.get(driverRecordId(driverId));
  }

  async update(input: {
    driverId: string;
    expectedRevision: number;
    data: DriverRecordV1;
  }): Promise<RecordEnvelope<DriverRecordV1>> {
    const id = driverRecordId(input.driverId);
    if (input.data.driverId !== input.driverId) throw new Error("driver_identity_immutable");
    return this.records.update({ id, expectedRevision: input.expectedRevision, data: input.data });
  }

  async list(): Promise<Array<RecordEnvelope<DriverRecordV1>>> {
    const records = await this.records.list();
    for (const record of records) {
      if (record.id !== driverRecordId(record.data.driverId)) throw new Error("driver_record_identity_mismatch");
    }
    return records;
  }
}
