import type { RecordEnvelope } from "../../core/src/types";

export type FullCostWorkDistanceBucketV1 = {
  businessKm: number;
  fuelCostPaise: number;
  maintenanceCostPaise: number;
  activeDrivingDay: boolean;
  refs: { sourceId: string; revision: number }[];
  fuelRefs: { sourceId: string; revision: number }[];
  maintenanceRefs: { sourceId: string; revision: number }[];
};

export type FullCostWorkDistanceRecordV1 = Readonly<{
  record: RecordEnvelope<unknown>;
  businessKm: number;
  entries: Array<{
    shiftId?: string;
    businessKm: number;
    personalKm?: number;
    allocationStatus: string;
  }>;
  complete: boolean;
}>;

export type FullCostWorkDistanceProjectionV1 = Readonly<{
  activityByDate: Map<string, FullCostWorkDistanceBucketV1>;
  distanceByDate: Map<string, FullCostWorkDistanceRecordV1>;
  activeDaySourceIssues: readonly string[];
}>;

function newBucket(): FullCostWorkDistanceBucketV1 {
  return {
    businessKm: 0, fuelCostPaise: 0, maintenanceCostPaise: 0, activeDrivingDay: false,
    refs: [], fuelRefs: [], maintenanceRefs: [],
  };
}

/**
 * Projects only finalized, fully allocated Work daily-distance rows. A trip
 * context can prove an active shift while its distance row is still pending;
 * when a finalized row exists, its exact shift identity must agree.
 */
export function buildFullCostWorkDistanceProjectionV1(input: {
  dailyDistanceRecords: readonly RecordEnvelope<unknown>[];
  tripFinancialRecords: readonly RecordEnvelope<unknown>[];
  vehicleId: string;
  from: string;
  to: string;
}): FullCostWorkDistanceProjectionV1 {
  const activityByDate = new Map<string, FullCostWorkDistanceBucketV1>();
  const distanceByDate = new Map<string, FullCostWorkDistanceRecordV1>();
  const activeDaySourceIssues: string[] = [];

  for (const daily of input.dailyDistanceRecords) {
    const data = daily.data as {
      schemaVersion?: number; kind?: string; vehicleId?: string; operationalDate?: string;
      entries?: Array<{ shiftId?: string; businessKm?: number; personalKm?: number; allocationStatus?: string }>;
      totalBusinessKm?: number; unallocatedBusinessKm?: number;
    };
    if (data.vehicleId !== input.vehicleId) continue;
    const date = data.operationalDate;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
        new Date(Date.parse(date + "T00:00:00Z")).toISOString().slice(0, 10) !== date) {
      activeDaySourceIssues.push(daily.id + " has no valid operational date");
      continue;
    }
    if (date < input.from || date > input.to) continue;
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const shiftIds = new Set<string>();
    let totalBusinessKm = 0;
    let unallocatedBusinessKm = 0;
    let validEntries = Array.isArray(data.entries);
    for (const entry of entries) {
      if (typeof entry.shiftId !== "string" || !entry.shiftId.trim() || shiftIds.has(entry.shiftId) ||
          !Number.isSafeInteger(entry.businessKm) || (entry.businessKm ?? -1) < 0 ||
          (entry.personalKm !== undefined && (!Number.isSafeInteger(entry.personalKm) || entry.personalKm < 0))) {
        validEntries = false;
        continue;
      }
      shiftIds.add(entry.shiftId);
      totalBusinessKm += entry.businessKm!;
      if (!Number.isSafeInteger(totalBusinessKm)) validEntries = false;
      if (entry.allocationStatus === "awaiting_operational_boundary") {
        unallocatedBusinessKm += entry.businessKm!;
      } else if (entry.allocationStatus !== "allocated") {
        validEntries = false;
      }
      if (!Number.isSafeInteger(unallocatedBusinessKm)) validEntries = false;
    }
    const canonicalId = "work:daily-business-km:" + encodeURIComponent(input.vehicleId) + ":" + date;
    const duplicateDate = distanceByDate.has(date);
    const complete = !duplicateDate && data.schemaVersion === 1 &&
      data.kind === "daily_business_kilometres" && daily.id === canonicalId &&
      validEntries && entries.every(entry => entry.allocationStatus === "allocated") &&
      data.unallocatedBusinessKm === 0 && unallocatedBusinessKm === 0 &&
      data.totalBusinessKm === totalBusinessKm;
    const businessKm = complete ? totalBusinessKm : 0;
    const distance: FullCostWorkDistanceRecordV1 = {
      record: daily, businessKm,
      entries: entries as FullCostWorkDistanceRecordV1["entries"],
      complete,
    };
    distanceByDate.set(date, distance);
    const bucket = activityByDate.get(date) ?? newBucket();
    bucket.businessKm = businessKm;
    bucket.refs.push({ sourceId: daily.id, revision: daily.revision });
    if (!complete) activeDaySourceIssues.push(daily.id + " has unallocated, duplicate or invalid distance contributions");
    activityByDate.set(date, bucket);
  }

  for (const trip of input.tripFinancialRecords) {
    const data = trip.data as {
      kind?: string; status?: string;
      tripContext?: {
        schemaVersion?: number; shiftId?: string; driverId?: string; assignmentId?: string;
        vehicleId?: string; operationalDate?: string;
      };
    };
    if ((data.kind !== "completed_ride_financials" && data.kind !== "cancellation_fee") ||
        data.status !== "submitted") continue;
    const context = data.tripContext;
    if (!context || context.schemaVersion !== 1 ||
        typeof context.shiftId !== "string" || !context.shiftId.trim() ||
        typeof context.driverId !== "string" || !context.driverId.trim() ||
        typeof context.assignmentId !== "string" || !context.assignmentId.trim() ||
        typeof context.vehicleId !== "string" || !context.vehicleId.trim() ||
        typeof context.operationalDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(context.operationalDate) ||
        !Number.isFinite(Date.parse(context.operationalDate + "T00:00:00Z")) ||
        new Date(Date.parse(context.operationalDate + "T00:00:00Z")).toISOString().slice(0, 10) !== context.operationalDate ||
        context.operationalDate < input.from || context.operationalDate > input.to) {
      if (context || data.status === "submitted") activeDaySourceIssues.push(trip.id);
      continue;
    }
    if (context.vehicleId !== input.vehicleId) {
      activeDaySourceIssues.push(trip.id + " belongs to a different vehicle");
      continue;
    }
    const distance = distanceByDate.get(context.operationalDate);
    const matchingShift = distance?.entries.find(entry => entry.shiftId === context.shiftId);
    const bucket = activityByDate.get(context.operationalDate) ?? newBucket();
    if (distance?.complete && !matchingShift) {
      activeDaySourceIssues.push(trip.id + " does not match a shift in the finalized daily-distance record");
    } else {
      bucket.activeDrivingDay = true;
      if (!distance?.complete || !matchingShift) {
        activeDaySourceIssues.push(trip.id + " has immutable shift context but no matching finalized distance contribution");
      }
    }
    bucket.refs.push({ sourceId: trip.id, revision: trip.revision });
    activityByDate.set(context.operationalDate, bucket);
  }

  return { activityByDate, distanceByDate, activeDaySourceIssues };
}
