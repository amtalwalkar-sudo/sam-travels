import "fake-indexeddb/auto";
import {beforeEach,describe,expect,it} from "vitest";
import {browserDatabase} from "../packages/storage-browser/src/database";
import {DexieDriverWorkflowRepository} from "../packages/storage-browser/src/driver-workflow";
import {DexieRecordRepository} from "../packages/storage-browser/src";
import {WorkDriverSelectionService} from "../packages/application/src/work-driver-selection-service";
import {createDriverCommandV2,DriverWorkflowService} from "../packages/features/work-shift";
import {buildTripHistory} from "../packages/domain/src/trip-history";
import {TripFinancialService} from "../packages/application/src/trip-financial-service";
import {operationalDateAt} from "../packages/domain/src/work-driver-context";
import type {GpsFix} from "../packages/core/src/types";

const base=Date.now()-20_000;
const timestamp=new Date(base-60_000).toISOString();
const records=[
 {id:"feature:driver-records:driver:driver-v2",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web" as const,revision:1,data:{schemaVersion:1,driverId:"driver-v2",name:"Driver V2",lifecycleState:"active"}},
 {id:"feature:driver-records:assignment:driver-v2",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web" as const,revision:1,data:{schemaVersion:1,driverId:"driver-v2",assignments:[{assignmentId:"assignment-v2",vehicleId:"feature:vehicle:MH01AB1234",assignedAt:timestamp}]}},
 {id:"feature:vehicle:MH01AB1234",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web" as const,revision:1,data:{schemaVersion:1,registrationNumber:"MH01AB1234",make:"Make",model:"Model",vehicleType:"Sedan",fuelType:"Petrol",yearOfManufacture:2024,ownership:"Owned",lifecycleState:"active"}},
];
const gpsAt=(fixAt:string):GpsFix=>({latitude:19.076,longitude:72.8777,horizontalAccuracyM:8,fixAt,provider:"browser-geolocation"});

describe("version 2 Work trip lifecycle",()=>{
 it("applies the Asia/Kolkata 04:00 operational date boundary exactly",()=>{
  expect(operationalDateAt("2026-11-08T22:29:59.000Z")).toBe("2026-11-08");
  expect(operationalDateAt("2026-11-08T22:30:00.000Z")).toBe("2026-11-09");
 });
 beforeEach(async()=>{await browserDatabase.delete();await browserDatabase.open();});
 it("captures Work Driver context at shift start and immutable trip context at trip creation",async()=>{
  await browserDatabase.records.bulkPut(records);
  const repository=new DexieDriverWorkflowRepository();
  const recordsRepository=new DexieRecordRepository();
  const selection=new WorkDriverSelectionService(recordsRepository,repository);
  await selection.selectDriver("driver-v2");
  let fixAt=new Date(base).toISOString();
  const service=new DriverWorkflowService(repository,{capture:async()=>gpsAt(fixAt)});
  const send=async(type:"shift_start"|"shift_end"|"trip_create"|"start_ride"|"end_ride"|"cancel_ride",id:string,offset:number)=>{
   fixAt=new Date(base+offset).toISOString();
   const snapshot=await repository.getSnapshot();
   const command=createDriverCommandV2(snapshot,type,"pwa",id,fixAt);
   const result=await service.dispatch(command);
   expect(result.status).toBe("recorded");
   return result.snapshot;
  };
  await send("shift_start","shift-v2",0);
  const afterShift=await repository.getSnapshot();
  expect(afterShift.shiftId).toBe("shift-v2");
  expect(afterShift.shiftContext).toEqual({schemaVersion:1,driverId:"driver-v2",assignmentId:"assignment-v2",vehicleId:"feature:vehicle:MH01AB1234"});
  expect((await recordsRepository.get<{schemaVersion:1;driverId:string;lockedShiftId?:string}>("work:selected-driver"))?.data.lockedShiftId).toBe("shift-v2");
  await expect(selection.selectDriver("driver-v2")).rejects.toThrow("work_driver_selection_locked_during_shift");
  const driverRow=await browserDatabase.records.get("feature:driver-records:driver:driver-v2");
  const vehicleRow=await browserDatabase.records.get("feature:vehicle:MH01AB1234");
  expect(driverRow&&vehicleRow).toBeTruthy();
  await browserDatabase.records.put({...driverRow!,revision:driverRow!.revision+1,updatedAt:new Date(base+500).toISOString(),
   data:{...(driverRow!.data as Record<string,unknown>),lifecycleState:"inactive"}});
  await browserDatabase.records.put({...vehicleRow!,revision:vehicleRow!.revision+1,updatedAt:new Date(base+500).toISOString(),
   data:{...(vehicleRow!.data as Record<string,unknown>),lifecycleState:"inactive"}});

  await send("trip_create","trip-v2-1",1_000);
  const pickup=await repository.getSnapshot();
  expect(pickup.state).toBe("going_to_pickup");
  expect(pickup.activeTripId).toBe("trip-v2-1");
  expect(pickup.tripContext).toMatchObject({schemaVersion:1,shiftId:"shift-v2",driverId:"driver-v2",assignmentId:"assignment-v2",vehicleId:"feature:vehicle:MH01AB1234"});
  expect(pickup.tripContext?.operationalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await send("start_ride","ride-v2-1-start",2_000);
  expect((await repository.getSnapshot()).state).toBe("trip_active");
  await send("end_ride","ride-v2-1-end",3_000);
  expect((await repository.getSnapshot()).state).toBe("shift_active");

  await send("trip_create","trip-v2-2",4_000);
  await send("cancel_ride","trip-v2-2-cancel",5_000);
  expect((await repository.getSnapshot()).state).toBe("shift_active");
  const cancellationObligation=await recordsRepository.get<{schemaVersion:number;tripId:string;kind:string;status:string;cancellationEventId:string}>(
   "work:trip-financial-obligation:trip-v2-2",
  );
  expect(cancellationObligation?.data).toMatchObject({
   schemaVersion:1,tripId:"trip-v2-2",kind:"cancellation_fee",status:"pending",cancellationEventId:"trip-v2-2-cancel",
  });
  expect(cancellationObligation?.data).not.toHaveProperty("toll");
  expect(cancellationObligation?.data).not.toHaveProperty("parking");
  fixAt=new Date(base+6_000).toISOString();
  const blockedEnd=createDriverCommandV2(await repository.getSnapshot(),"shift_end","pwa","shift-v2-end",fixAt);
  await expect(service.dispatch(blockedEnd)).rejects.toThrow("trip_cancellation_fee_required");
  expect(await repository.getIntent("shift-v2-end")).toBeUndefined();
  const financial=new TripFinancialService(recordsRepository,"web");
  await financial.submitCancellationFee("trip-v2-2",0,"cancellation-fee-op");
  await send("shift_end","shift-v2-end",6_000);
  expect((await repository.getSnapshot()).state).toBe("idle");
  expect((await recordsRepository.get<{schemaVersion:1;driverId:string;lockedShiftId?:string}>("work:selected-driver"))?.data.lockedShiftId).toBeUndefined();

  const events=await repository.listEvents();
  const shiftEvent=events.find(event=>event.eventId==="shift-v2")!;
  const createEvent=events.find(event=>event.eventId==="trip-v2-1")!;
  expect(shiftEvent.command.driverContext).toEqual(afterShift.shiftContext);
  expect(createEvent.command.tripContext).toEqual(pickup.tripContext);
  const history=buildTripHistory(events);
  expect(history).toHaveLength(2);
  expect(history.find(trip=>trip.id==="trip-v2-1")).toMatchObject({status:"completed",tripContext:pickup.tripContext});
  expect(history.find(trip=>trip.id==="trip-v2-2")).toMatchObject({status:"cancelled"});
 });

 it("does not advance a shift or write an event when Work Driver selection is missing",async()=>{
  await browserDatabase.records.bulkPut(records);
  const repository=new DexieDriverWorkflowRepository();
  const at=new Date(base).toISOString();
  const service=new DriverWorkflowService(repository,{capture:async()=>gpsAt(at)});
  const command=createDriverCommandV2(await repository.getSnapshot(),"shift_start","pwa","missing-selection",at);
  const result=await service.dispatch(command);
  expect(result.status).toBe("needs_attention");
  expect(result.snapshot).toMatchObject({state:"idle",revision:0});
  expect(await repository.listEvents()).toHaveLength(0);
  expect(await repository.getIntent("missing-selection")).toMatchObject({status:"needs_attention"});
  expect(await browserDatabase.driverOutbox.count()).toBe(0);
 });

 it("keeps v1 trip-start history readable without reinterpreting it as v2",()=>{
  const command={schemaVersion:1 as const,commandId:"legacy-start",eventId:"legacy-start",eventType:"trip_start" as const,
   originSurface:"pwa" as const,transitionAt:"2026-11-08T10:00:00.000Z",expectedPriorState:"shift_active" as const,expectedRevision:1,idempotencyKey:"legacy-start"};
  const event={eventId:"legacy-start",command,gps:gpsAt(command.transitionAt),committedAt:command.transitionAt,revision:2};
  expect(buildTripHistory([event])).toMatchObject([{id:"legacy-start",status:"active",startedAt:command.transitionAt}]);
 });
});
