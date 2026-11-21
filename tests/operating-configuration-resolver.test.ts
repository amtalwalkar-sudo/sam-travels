import { describe, expect, it } from "vitest";
import type { RecordEnvelope } from "../packages/core/src/types";
import { resolveOperatingConfiguration, resolveWorkDriverContext } from "../packages/domain/src/work-driver-context";

const at = "2026-11-19T08:00:00.000Z";
type Row = RecordEnvelope<unknown>;
const row = (id: string, data: unknown, revision = 1): Row =>
  ({ id, schemaVersion: 1, createdAt: at, updatedAt: at, source: "web", revision, data });
const driver = (id = "driver-1", lifecycleState = "active"): Row =>
  row("feature:driver-records:driver:" + id, { schemaVersion: 1, driverId: id, name: "Driver " + id, lifecycleState });
const vehicle = (registration = "MH01AB1234", lifecycleState = "active"): Row =>
  row("feature:vehicle:" + registration, { schemaVersion: 1, registrationNumber: registration,
    make: "Make", model: "Model", vehicleType: "Sedan", fuelType: "CNG",
    yearOfManufacture: 2024, ownership: "Owned", lifecycleState });
const assignment = (driverId = "driver-1", vehicleId = "feature:vehicle:MH01AB1234",
  assignmentId = "assignment-1", assignedAt = at): Row =>
  row("feature:driver-records:assignment:" + driverId,
    { schemaVersion: 1, driverId, assignments: [{ assignmentId, vehicleId, assignedAt }] });
const selection = (driverId = "driver-1", lockedShiftId?: string): Row =>
  row("work:selected-driver", { schemaVersion: 1, driverId, ...(lockedShiftId ? { lockedShiftId } : {}) });
const valid = (): Row[] => [driver(), vehicle(), assignment(), selection()];
const fails = (rows: Row[], reason: string, transitionAt?: string) =>
  expect(() => resolveOperatingConfiguration(rows, transitionAt)).toThrow(reason);

describe("authoritative single operating configuration resolver", () => {
  it("resolves the sole pair and returns source revisions", () => {
    const rows = valid().map((item, index) => ({ ...item, revision: [3, 4, 5, 2][index] }));
    expect(resolveOperatingConfiguration(rows, at)).toEqual({
      schemaVersion: 1, driverId: "driver-1", vehicleId: "feature:vehicle:MH01AB1234",
      assignmentId: "assignment-1", selectionRevision: 2, driverRevision: 3,
      vehicleRevision: 4, assignmentRevision: 5,
    });
    expect(resolveWorkDriverContext(rows, at)).toEqual({
      schemaVersion: 1, driverId: "driver-1", vehicleId: "feature:vehicle:MH01AB1234", assignmentId: "assignment-1",
    });
  });

  it("rejects missing and ambiguous active Driver or Vehicle profiles", () => {
    const rows = valid();
    fails(rows.filter(item => !item.id.startsWith("feature:driver-records:driver:")), "operating_driver_missing");
    fails([...rows, driver("driver-2")], "operating_driver_ambiguous");
    fails(rows.filter(item => !item.id.startsWith("feature:vehicle:")), "operating_vehicle_missing");
    fails([...rows, vehicle("MH02CD5678")], "operating_vehicle_ambiguous");
  });

  it("requires one Work selection naming the sole active Driver and rejects locked shifts", () => {
    const rows = valid();
    fails(rows.filter(item => item.id !== "work:selected-driver"), "work_driver_not_selected");
    fails([...rows, selection()], "operating_driver_selection_ambiguous");
    fails([...rows.filter(item => item.id !== "work:selected-driver"), selection("driver-2")], "operating_driver_selection_mismatch");
    fails([...rows.filter(item => item.id !== "work:selected-driver"), selection("driver-1", "shift-1")], "operating_driver_selection_locked");
  });

  it("requires one current assignment connecting the configured pair", () => {
    const rows = valid();
    fails(rows.filter(item => !item.id.startsWith("feature:driver-records:assignment:")), "operating_assignment_missing");
    fails([...rows, assignment("driver-2", "feature:vehicle:MH01AB1234", "assignment-2")], "operating_assignment_ambiguous");
    fails([driver(), vehicle(), assignment("driver-1", "feature:vehicle:MH02CD5678"), selection()], "operating_assignment_pair_mismatch");
    fails([driver(), vehicle(), assignment(), row("feature:driver-records:assignment:driver-2", {
      schemaVersion: 1, driverId: "driver-2", assignments: [{
        assignmentId: "assignment-2", vehicleId: "feature:vehicle:MH01AB1234", assignedAt: at,
      }],
    }), selection()], "operating_assignment_ambiguous");
  });

  it("rejects an assignment that was not effective at the event timestamp", () => {
    fails(valid(), "operating_assignment_not_effective", "2026-11-19T07:59:59.000Z");
  });

  it("ignores valid inactive history and rejects malformed active profile identity", () => {
    expect(resolveOperatingConfiguration([...valid(), driver("old-driver", "inactive"), vehicle("MH02CD5678", "sold")]).driverId)
      .toBe("driver-1");
    const rows = valid();
    rows[0] = row("feature:driver-records:driver:driver-1", {
      schemaVersion: 1, driverId: "wrong-id", name: "Driver", lifecycleState: "active",
    });
    fails(rows, "operating_driver_invalid");
  });
});
