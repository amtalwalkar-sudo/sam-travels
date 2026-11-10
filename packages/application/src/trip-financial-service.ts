import type { AtomicRecordRepository, RecordRepository } from "../../core/src/repositories";
import type { RecordEnvelope } from "../../core/src/types";
import { validateCancellationFeeSubmission, validateCompletedTripFinancialSubmission } from "./driver-form-definitions";

export type CancellationFeeObligation = Readonly<{
  schemaVersion: 1;
  tripId: string;
  kind: "cancellation_fee";
  status: "pending" | "submitted";
  cancellationEventId: string;
  createdAt: string;
  feePaise?: number;
  operationId?: string;
  submittedAt?: string;
}>;

export const TRIP_FINANCIAL_OBLIGATION_PREFIX = "work:trip-financial-obligation:";

export function cancellationFeeObligationId(tripId: string): string {
  return TRIP_FINANCIAL_OBLIGATION_PREFIX + tripId;
}

/** Application-owned, idempotent closeout over the shared authoritative record repository. */
export class TripFinancialService {
  constructor(
    private readonly records: RecordRepository & AtomicRecordRepository,
    private readonly source: RecordEnvelope<unknown>["source"],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async pendingCancellationFees(): Promise<readonly RecordEnvelope<CancellationFeeObligation>[]> {
    const rows = await this.records.list<CancellationFeeObligation>();
    return rows.filter(row =>
      row.id.startsWith(TRIP_FINANCIAL_OBLIGATION_PREFIX) &&
      !row.deletedAt &&
      row.data.schemaVersion === 1 &&
      row.data.kind === "cancellation_fee" &&
      row.data.status === "pending"
    );
  }

  async submitCancellationFee(tripId: string, feePaise: number, operationId: string): Promise<RecordEnvelope<CancellationFeeObligation>> {
    const values = { tripId, cancellationFeePaise: feePaise };
    const issues = validateCancellationFeeSubmission(values);
    if (issues.length) throw new Error(issues[0]);
    if (typeof operationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(operationId)) {
      throw new Error("form_operation_identity_invalid");
    }

    const id = cancellationFeeObligationId(tripId);
    const current = await this.records.get<CancellationFeeObligation>(id);
    if (!current || current.deletedAt || current.data.schemaVersion !== 1 ||
        current.data.tripId !== tripId || current.data.kind !== "cancellation_fee") {
      throw new Error("cancellation_fee_obligation_missing");
    }
    if (current.data.status === "submitted") {
      if (current.data.operationId === operationId && current.data.feePaise === feePaise) return current;
      throw new Error("cancellation_fee_already_submitted");
    }
    if (current.data.status !== "pending") throw new Error("cancellation_fee_obligation_invalid");

    const submittedAt = this.now();
    const next: RecordEnvelope<CancellationFeeObligation> = {
      ...current,
      revision: current.revision + 1,
      updatedAt: submittedAt,
      source: this.source,
      data: {
        ...current.data,
        status: "submitted",
        feePaise,
        operationId,
        submittedAt,
      },
    };
    if (!await this.records.compareAndSet(id, current.revision, next)) {
      const latest = await this.records.get<CancellationFeeObligation>(id);
      if (latest?.data.status === "submitted" &&
          latest.data.operationId === operationId && latest.data.feePaise === feePaise) return latest;
      throw new Error("cancellation_fee_revision_conflict");
    }
    return next;
  }
}


export type CompletedTripFinancialObligation = Readonly<{
  schemaVersion: 1; tripId: string; kind: "completed_ride_financials"; status: "pending" | "submitted";
  endRideEventId: string; createdAt: string; farePaise?: number; tollPaise?: number;
  tollPayer?: "driver" | "customer"; parkingPaise?: number; parkingPayer?: "driver" | "customer";
  operationId?: string; submittedAt?: string;
}>;
export type CompletedTripFinancialValues = Readonly<{
  farePaise: number; tollPaise?: number; tollPayer?: "driver" | "customer";
  parkingPaise?: number; parkingPayer?: "driver" | "customer";
}>;
export function calculateTripFinancialSummary(values: CompletedTripFinancialValues) {
  const customerCharge = values.farePaise + (values.tollPayer === "customer" ? values.tollPaise ?? 0 : 0) +
    (values.parkingPayer === "customer" ? values.parkingPaise ?? 0 : 0);
  const driverExpenses = (values.tollPayer === "driver" ? values.tollPaise ?? 0 : 0) +
    (values.parkingPayer === "driver" ? values.parkingPaise ?? 0 : 0);
  return Object.freeze({ customerChargePaise: customerCharge, driverExpensesPaise: driverExpenses,
    netTripEarningsBeforeFuelPaise: values.farePaise - driverExpenses });
}
export async function submitCompletedTripFinancials(
  records: AtomicRecordRepository, source: RecordEnvelope<unknown>["source"], tripId: string,
  values: CompletedTripFinancialValues, operationId: string, now: () => string = () => new Date().toISOString(),
): Promise<RecordEnvelope<CompletedTripFinancialObligation>> {
  const issues = validateCompletedTripFinancialSubmission({ tripId, ...values });
  if (issues.length) throw new Error(issues[0]);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(operationId)) throw new Error("form_operation_identity_invalid");
  const id = cancellationFeeObligationId(tripId);
  const current = await records.get<CompletedTripFinancialObligation>(id);
  if (!current || current.deletedAt || current.data.schemaVersion !== 1 || current.data.tripId !== tripId ||
      current.data.kind !== "completed_ride_financials") throw new Error("completed_trip_financial_obligation_missing");
  const sameValues = current.data.farePaise === values.farePaise && current.data.tollPaise === values.tollPaise &&
    current.data.tollPayer === values.tollPayer && current.data.parkingPaise === values.parkingPaise &&
    current.data.parkingPayer === values.parkingPayer;
  if (current.data.status === "submitted") {
    if (current.data.operationId === operationId && sameValues) return current;
    throw new Error("completed_trip_financials_already_submitted");
  }
  if (current.data.status !== "pending") throw new Error("completed_trip_financial_obligation_invalid");
  const submittedAt = now();
  const next: RecordEnvelope<CompletedTripFinancialObligation> = {
    ...current, revision: current.revision + 1, updatedAt: submittedAt, source,
    data: { ...current.data, ...values, status: "submitted", operationId, submittedAt },
  };
  if (!await records.compareAndSet(id, current.revision, next)) {
    const latest = await records.get<CompletedTripFinancialObligation>(id);
    const latestMatchesValues = latest?.data.farePaise === values.farePaise &&
      latest.data.tollPaise === values.tollPaise && latest.data.tollPayer === values.tollPayer &&
      latest.data.parkingPaise === values.parkingPaise && latest.data.parkingPayer === values.parkingPayer;
    if (latest?.data.status === "submitted" && latest.data.operationId === operationId && latestMatchesValues) {
      return latest;
    }
    throw new Error("completed_trip_financials_revision_conflict");
  }
  return next;
}
