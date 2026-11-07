import type { AtomicRecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import {
  normalizeVehicleRegistrationNumber,
  type VehicleRecordV1,
} from "../../features/vehicle/records";
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

  getByRegistrationNumber(registrationNumber: string): Promise<RecordEnvelope<VehicleRecordV1> | undefined> {
    return this.records.get(vehicleRecordId(registrationNumber));
  }

  async update(input: {
    id: string;
    expectedRevision: number;
    data: VehicleRecordV1;
  }): Promise<RecordEnvelope<VehicleRecordV1>> {
    if (vehicleRecordId(input.data.registrationNumber) !== input.id) {
      throw new Error("vehicle_registration_identity_immutable");
    }
    return this.records.update(input);
  }

  list(): Promise<Array<RecordEnvelope<VehicleRecordV1>>> {
    return this.records.list();
  }
}
