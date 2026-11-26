import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { HistoricalTripBackfillServiceV1, historicalTripOperationalDateFromInstant } from "../packages/application/src/historical-trip-backfill-service";

class Records implements AtomicRecordRepository {
  private rows = new Map<string, RecordEnvelope<unknown>>();
  async get<T>(id: string) { return this.rows.get(id) as RecordEnvelope<T> | undefined; }
  async put<T>(row: RecordEnvelope<T>) { this.rows.set(row.id, row as RecordEnvelope<unknown>); }
  async list<T>() { return [...this.rows.values()] as RecordEnvelope<T>[]; }
  async remove(id: string) { this.rows.delete(id); }
  async compareAndSet<T>(id: string, revision: number | null, next: RecordEnvelope<T>) {
    if ((this.rows.get(id)?.revision ?? null) !== revision) return false;
    this.rows.set(id, next as RecordEnvelope<unknown>);
    return true;
  }
}

const input = {
  backfillId: "legacy-trip-1", driverId: "driver-1", vehicleId: "vehicle-1",
  operationalDate: "2026-11-10", startedAt: "2026-11-10T08:00:00.000Z",
  endedAt: "2026-11-10T08:35:00.000Z", farePaise: 12500,
  tollPaise: 500, tollPayer: "driver", parkingPaise: 300, parkingPayer: "customer",
  reason: "Trip was omitted during offline entry; reconciled from paper trip sheet",
};

describe("separately attributed historical trip backfill", () => {
  it("applies the Asia/Kolkata 04:00 operational-day boundary", () => {
    expect(historicalTripOperationalDateFromInstant("2026-11-10T22:29:59.999Z")).toBe("2026-11-10");
    expect(historicalTripOperationalDateFromInstant("2026-11-10T22:30:00.000Z")).toBe("2026-11-11");
  });

  it("stores a distinct admin-attributed record without manufacturing Work, GPS, odometer or shift evidence", async () => {
    const records = new Records();
    const service = new HistoricalTripBackfillServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-person" }),
    }, "web", () => "2026-11-11T10:00:00.000Z");
    const saved = await service.submit(input);
    expect(saved.id).toBe("historical-trip-backfill:legacy-trip-1");
    expect(saved.createdBy).toEqual({ personId: "admin-person", role: "admin" });
    expect(saved.data).toMatchObject({
      kind: "historical_trip_backfill", attribution: "admin_declared",
      driverId: "driver-1", vehicleId: "vehicle-1", farePaise: 12500,
      tollPaise: 500, tollPayer: "driver", parkingPaise: 300, parkingPayer: "customer",
      actor: { role: "admin", actorId: "admin-person" },
    });
    expect(saved.data).not.toHaveProperty("eventId");
    expect(saved.data).not.toHaveProperty("startEventId");
    expect(saved.data).not.toHaveProperty("endEventId");
    expect(saved.data).not.toHaveProperty("gps");
    expect(saved.data).not.toHaveProperty("shiftId");
    expect((await records.list()).map(row => row.id)).toEqual(["historical-trip-backfill:legacy-trip-1"]);
    expect(await service.list()).toHaveLength(1);
  });

  it("replays the same backfill command idempotently without changing its recorded timestamp", async () => {
    const records = new Records();
    let instant = "2026-11-11T10:00:00.000Z";
    const service = new HistoricalTripBackfillServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-person" }),
    }, "web", () => instant);
    const first = await service.submit(input);
    instant = "2026-11-12T10:00:00.000Z";
    const replay = await service.submit(input);
    expect(replay).toEqual(first);
    expect(await records.list()).toHaveLength(1);
  });

  it("rejects backfill payloads that attempt to attach Work, GPS, shift or odometer evidence", async () => {
    const { assertHistoricalTripBackfillV1 } = await import("../packages/domain/src/historical-trip-backfill");
    const valid = {
      schemaVersion: 1, kind: "historical_trip_backfill", backfillId: "paper-trip",
      status: "submitted", attribution: "admin_declared", driverId: "driver-1", vehicleId: "vehicle-1",
      operationalDate: "2026-11-10", startedAt: "2026-11-10T08:00:00.000Z",
      endedAt: "2026-11-10T08:30:00.000Z", farePaise: 1000, reason: "Paper log",
      recordedAt: "2026-11-11T10:00:00.000Z", actor: { role: "admin", actorId: "admin-1" },
    };
    expect(() => assertHistoricalTripBackfillV1({ ...valid, odometerKm: 550 })).toThrow("historical_trip_backfill_invalid");
    expect(() => assertHistoricalTripBackfillV1({ ...valid, tollPaise: 500, tollPayer: "operator" })).toThrow("historical_trip_backfill_invalid");
    expect(() => assertHistoricalTripBackfillV1({ ...valid, parkingPayer: "driver" })).toThrow("historical_trip_backfill_invalid");
    expect(() => assertHistoricalTripBackfillV1({ ...valid, tripContext: { shiftId: "made-up" } })).toThrow("historical_trip_backfill_invalid");
    expect(() => assertHistoricalTripBackfillV1({ ...valid, startGps: { latitude: 0, longitude: 0 } })).toThrow("historical_trip_backfill_invalid");
  });

  it("rejects Driver authority and invalid intervals", async () => {
    const records = new Records();
    const driverService = new HistoricalTripBackfillServiceV1(records, {
      currentActor: async () => ({ role: "driver", actorId: "driver-1" }),
    }, "web");
    await expect(driverService.submit(input)).rejects.toThrow("historical_trip_backfill_admin_required");
    const adminService = new HistoricalTripBackfillServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-person" }),
    }, "web");
    await expect(adminService.submit({ ...input, endedAt: input.startedAt }))
      .rejects.toThrow("historical_trip_backfill_interval_invalid");
    expect(await records.list()).toHaveLength(0);
  });

  it("rejects reused backfill IDs with changed business facts", async () => {
    const records = new Records();
    const service = new HistoricalTripBackfillServiceV1(records, {
      currentActor: async () => ({ role: "admin", actorId: "admin-person" }),
    }, "web", () => "2026-11-11T10:00:00.000Z");
    await service.submit(input);
    await expect(service.submit({ ...input, farePaise: 13000 }))
      .rejects.toThrow("historical_trip_backfill_id_reused");
    expect(await records.list()).toHaveLength(1);
  });
});
