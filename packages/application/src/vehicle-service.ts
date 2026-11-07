import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { normalizeVehicleRegistrationNumber } from "../../domain/src/vehicle-identity";

export type VehicleLifecycleState = "active" | "inactive" | "sold";
export type VehicleRecordV1 = Readonly<{
  schemaVersion: 1;
  registrationNumber: string;
  make: string;
  model: string;
  vehicleType: string;
  fuelType: string;
  yearOfManufacture: number;
  ownership: string;
  lifecycleState: VehicleLifecycleState;
}>;
import { FeatureRecordService, type FeatureRecordSource } from "./feature-record-service";

export const VEHICLE_RECORD_ID_PREFIX = "feature:vehicle:";
export type VehicleRecordValidator = (value: unknown) => asserts value is VehicleRecordV1;

export function vehicleRecordId(registrationNumber: string): string {
  return VEHICLE_RECORD_ID_PREFIX + normalizeVehicleRegistrationNumber(registrationNumber);
}

/** Vehicle records use canonical registration identity and atomic duplicate protection. */
export class VehicleService {
  private readonly records: FeatureRecordService<VehicleRecordV1>;

  constructor(repository: AtomicRecordRepository, validate: VehicleRecordValidator, now?: () => string) {
    this.records = new FeatureRecordService(repository, {
      featureId: "vehicle",
      recordIdPrefix: VEHICLE_RECORD_ID_PREFIX,
      validate,
    }, now);
  }

  async create(
    input: Omit<VehicleRecordV1, "registrationNumber"> & { registrationNumber: string },
    source: FeatureRecordSource,
  ): Promise<RecordEnvelope<VehicleRecordV1>> {
    const registrationNumber = normalizeVehicleRegistrationNumber(input.registrationNumber);
    const data: VehicleRecordV1 = { ...input, registrationNumber };
    return this.records.create({ id: vehicleRecordId(registrationNumber), data, source });
  }

  private assertIdentity(record: RecordEnvelope<VehicleRecordV1>): void {
    if (record.id !== vehicleRecordId(record.data.registrationNumber)) {
      throw new Error("vehicle_record_identity_mismatch");
    }
  }

  async getById(id: string): Promise<RecordEnvelope<VehicleRecordV1> | undefined> {
    if (!id.startsWith(VEHICLE_RECORD_ID_PREFIX)) throw new Error("vehicle_record_identity_invalid");
    const record = await this.records.get(id);
    if (record) this.assertIdentity(record);
    return record;
  }

  async getByRegistrationNumber(registrationNumber: string): Promise<RecordEnvelope<VehicleRecordV1> | undefined> {
    const record = await this.records.get(vehicleRecordId(registrationNumber));
    if (record) this.assertIdentity(record);
    return record;
  }

  async update(input: {
    id: string;
    expectedRevision: number;
    data: VehicleRecordV1;
  }): Promise<RecordEnvelope<VehicleRecordV1>> {
    const registrationNumber = normalizeVehicleRegistrationNumber(input.data.registrationNumber);
    if (VEHICLE_RECORD_ID_PREFIX + registrationNumber !== input.id) {
      throw new Error("vehicle_registration_identity_immutable");
    }
    const current = await this.records.get(input.id);
    if (!current) throw new Error("feature_record_not_found:" + input.id);
    this.assertIdentity(current);
    return this.records.update({ ...input, data: { ...input.data, registrationNumber } });
  }

  async list(): Promise<Array<RecordEnvelope<VehicleRecordV1>>> {
    const records = await this.records.list();
    records.forEach(record => this.assertIdentity(record));
    return records;
  }
}
