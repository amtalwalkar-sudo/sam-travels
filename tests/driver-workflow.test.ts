import "fake-indexeddb/auto";
import {beforeEach,describe,expect,it} from "vitest";
import {browserDatabase} from "../packages/storage-browser/src/database";
import {DexieDriverWorkflowRepository} from "../packages/storage-browser/src/driver-workflow";
import {createDriverCommand,DriverWorkflowService} from "../packages/features/work-shift";
import type {GpsFix} from "../packages/core/src/types";
import {
 LOGBOOK_FEATURE_EXTENSION,
 LOGBOOK_WORK_EVENT_INTEGRATION,
 rebuildTripHistoryProjection,
 readTripHistoryProjection,
 TRIP_DURATION_CALCULATION,
} from "../packages/features/logbook";
import {
 createApplicationRuntimeRegistry,
 dispatchCommittedFeatureEvent,
} from "../packages/application/src";
import { executeRegisteredCalculation } from "../packages/core/src/feature-contracts";
import { assertDriverCommandContract, resolveDriverContextV1 } from "../packages/domain/src/driver-workflow";

const gps:GpsFix={latitude:19.076,longitude:72.8777,horizontalAccuracyM:8,fixAt:"2026-11-03T10:00:00.000Z",provider:"browser-geolocation"};
describe("durable single-driver workflow",()=>{
 beforeEach(async()=>{await browserDatabase.delete();await browserDatabase.open()});
 it("validates the exact immutable driverContext shape and event placement",()=>{
  const base=createDriverCommand({schemaVersion:1,revision:1,state:"shift_active"},"trip_start","pwa","trip-context","2026-11-08T10:00:00.000Z");
  const context={schemaVersion:1 as const,driverId:"driver-001",assignmentId:"assignment-001",vehicleId:"feature:vehicle:MH01AB1234"};
  expect(()=>assertDriverCommandContract({...base,driverContext:context})).not.toThrow();
  expect(()=>assertDriverCommandContract({...base,driverContext:{...context,driverName:"Example Driver"}})).toThrow("invalid_driver_context");
  expect(()=>assertDriverCommandContract({...base,eventType:"shift_start",driverContext:context})).toThrow("invalid_driver_context");
 });
 it("resolves one active selected driver, assignment identity and active vehicle",()=>{
  const timestamp="2026-11-08T00:00:00.000Z";
  const records=[
   {id:"feature:driver-records:driver:driver-001",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web" as const,revision:1,data:{schemaVersion:1,driverId:"driver-001",name:"Example Driver",lifecycleState:"active",selectedForWork:true}},
   {id:"feature:driver-records:assignment:driver-001",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web" as const,revision:1,data:{schemaVersion:1,driverId:"driver-001",assignments:[{assignmentId:"assignment-001",vehicleId:"feature:vehicle:MH01AB1234",assignedAt:timestamp}]}},
   {id:"feature:vehicle:MH01AB1234",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web" as const,revision:1,data:{schemaVersion:1,registrationNumber:"MH01AB1234",make:"Make",model:"Model",vehicleType:"Sedan",fuelType:"Petrol",yearOfManufacture:2024,ownership:"Owned",lifecycleState:"active"}},
  ];
  expect(resolveDriverContextV1(records)).toEqual({schemaVersion:1,driverId:"driver-001",assignmentId:"assignment-001",vehicleId:"feature:vehicle:MH01AB1234"});
  expect(()=>resolveDriverContextV1(records.slice(1))).toThrow("work_driver_selection_missing");
 });
 it("queues first and atomically commits event, projection, status and outbox",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot(),command=createDriverCommand(state,"shift_start","pwa","cmd-1","2026-11-03T10:00:00.000Z");
  const intent=await repo.queueIntent({command,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt});
  expect(intent.status).toBe("pending_location");expect((await repo.getSnapshot()).state).toBe("idle");
  const next=await repo.completeIntent(command.eventId,gps,command.transitionAt);
  expect(next.state).toBe("shift_active");expect(next.revision).toBe(1);
  expect(await repo.listEvents()).toHaveLength(1);expect((await repo.getIntent(command.eventId))?.status).toBe("recorded");
  const replayed=await repo.completeIntent(command.eventId,gps,command.transitionAt);
  expect(replayed).toEqual(next);
  expect((await repo.getSnapshot()).revision).toBe(1);
  const outbox=await browserDatabase.table("driverOutbox").toArray();
  expect(outbox).toHaveLength(1);
  expect(outbox[0]).toMatchObject({integrationId:"logbook.work-driver-events.v1",contractVersion:1,eventName:"work.driver-event-committed",payloadVersion:1,delivered:false});
 });
 it("rejects stale competing commands rather than last-write-wins",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot();
  const first=createDriverCommand(state,"shift_start","pwa","cmd-a","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command:first,status:"pending_location",createdAt:first.transitionAt,updatedAt:first.transitionAt});
  const second=createDriverCommand(state,"shift_start","native_overlay","cmd-b","2026-11-03T10:00:01.000Z");
  await expect(repo.queueIntent({command:second,status:"pending_location",createdAt:second.transitionAt,updatedAt:second.transitionAt})).rejects.toThrow("competing_transition_pending");
  await repo.completeIntent(first.eventId,gps,first.transitionAt);
  expect((await repo.getSnapshot()).revision).toBe(1);
 });
 it("retains failed location intents for recovery without advancing state",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot(),command=createDriverCommand(state,"shift_start","pwa","cmd-pending","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt});
  await repo.markNeedsAttention(command.eventId,"permission_denied");
  expect((await repo.listPending())[0].status).toBe("needs_attention");
  expect((await repo.getSnapshot()).revision).toBe(0);
 });
 it("restores a pending intent after the IndexedDB connection is closed and reopened",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot();
  const command=createDriverCommand(state,"shift_start","pwa","cmd-reopen","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt});
  await repo.markNeedsAttention(command.eventId,"permission_denied");
  browserDatabase.close();
  await browserDatabase.open();

  const recoveredRepository=new DexieDriverWorkflowRepository();
  const recovered=await recoveredRepository.getIntent(command.eventId);
  expect(recovered?.status).toBe("needs_attention");
  expect((await recoveredRepository.getSnapshot()).revision).toBe(0);
  await recoveredRepository.reactivateIntent(command.eventId);
  const next=await recoveredRepository.completeIntent(command.eventId,gps,command.transitionAt);
  expect(next.state).toBe("shift_active");
  expect(next.revision).toBe(1);
  expect((await recoveredRepository.getIntent(command.eventId))?.status).toBe("recorded");
 });
 it("serializes simultaneous PWA/native enqueue attempts at one revision",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot();
  const first=createDriverCommand(state,"shift_start","pwa","race-a","2026-11-03T10:00:00.000Z");
  const second=createDriverCommand(state,"shift_start","native_overlay","race-b","2026-11-03T10:00:01.000Z");
  const results=await Promise.allSettled([
   repo.queueIntent({command:first,status:"pending_location",createdAt:first.transitionAt,updatedAt:first.transitionAt}),
   repo.queueIntent({command:second,status:"pending_location",createdAt:second.transitionAt,updatedAt:second.transitionAt}),
  ]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
  expect(await repo.listPending()).toHaveLength(1);
 });
 it("never reactivates a recorded event or changes it back to attention",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot();
  const command=createDriverCommand(state,"shift_start","pwa","cmd-immutable","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt});
  await repo.completeIntent(command.eventId,gps,command.transitionAt);
  await expect(repo.reactivateIntent(command.eventId)).rejects.toThrow("intent_not_recoverable");
  await repo.markNeedsAttention(command.eventId,"late_failure");
  expect((await repo.getIntent(command.eventId))?.status).toBe("recorded");
  expect(await repo.listEvents()).toHaveLength(1);
 });
 it("rejects reuse of an event identity with a changed command payload",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot();
  const command=createDriverCommand(state,"shift_start","pwa","same-id","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt});
  const changed={...command,eventType:"shift_end" as const};
  await expect(repo.queueIntent({command:changed,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt})).rejects.toThrow("duplicate_command_id_conflict");
 });
 it("does not let an expired pending event block a newly issued action",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot();
  const expired=createDriverCommand(state,"shift_start","pwa","cmd-expired","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command:expired,status:"pending_location",createdAt:expired.transitionAt,updatedAt:expired.transitionAt});
  await repo.markNeedsAttention(expired.eventId,"gps_recovery_window_expired");
  const replacement=createDriverCommand(state,"shift_start","pwa","cmd-replacement",new Date().toISOString());
  const queued=await repo.queueIntent({command:replacement,status:"pending_location",createdAt:replacement.transitionAt,updatedAt:replacement.transitionAt});
  expect(queued.command.eventId).toBe("cmd-replacement");
  expect((await repo.getIntent(expired.eventId))?.reason).toBe("gps_recovery_window_expired");
 });

 it("automatically publishes committed Work events and retries failed consumer delivery",async()=>{
  const repo=new DexieDriverWorkflowRepository();
  const transitionAt=new Date().toISOString();
  const command=createDriverCommand(await repo.getSnapshot(),"shift_start","pwa","cmd-publish",transitionAt);
  const delivered:string[]=[];
  let failFirst=true;
  const service=new DriverWorkflowService(repo,{capture:async()=>({...gps,fixAt:transitionAt})},async event=>{
   if(failFirst){failFirst=false;throw new Error("consumer_temporarily_unavailable")}
   delivered.push(event.eventId);
  });
  const result=await service.dispatch(command);
  expect(result.status).toBe("recorded");
  expect(result.integrationPending).toBe(true);
  expect((await repo.getSnapshot()).revision).toBe(1);
  expect((await service.retryPendingIntegrations()).pending).toBe(0);
  expect(delivered).toEqual(["cmd-publish"]);
 });


 it("proves Work-to-Log Book calculation and projection recovery across a database restart",async()=>{
  const repo=new DexieDriverWorkflowRepository();
  const timestamp="2026-11-08T00:00:00.000Z";
  await browserDatabase.records.bulkPut([
    {id:"feature:driver-records:driver:driver-001",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:1,data:{schemaVersion:1,driverId:"driver-001",name:"Example Driver",lifecycleState:"active",selectedForWork:true}},
    {id:"feature:driver-records:assignment:driver-001",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:1,data:{schemaVersion:1,driverId:"driver-001",assignments:[{assignmentId:"assignment-001",vehicleId:"feature:vehicle:MH01AB1234",assignedAt:timestamp}]}},
    {id:"feature:vehicle:MH01AB1234",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:1,data:{schemaVersion:1,registrationNumber:"MH01AB1234",make:"Make",model:"Model",vehicleType:"Sedan",fuelType:"Petrol",yearOfManufacture:2024,ownership:"Owned",lifecycleState:"active"}},
  ]);

  const runtime=createApplicationRuntimeRegistry({extensions:[LOGBOOK_FEATURE_EXTENSION]});
  let captureAt="2026-11-03T10:00:00.000Z";
  const delivered:string[]=[];
  const service=new DriverWorkflowService(repo,{capture:async()=>({...gps,fixAt:captureAt})},async event=>{
   await dispatchCommittedFeatureEvent(runtime,LOGBOOK_WORK_EVENT_INTEGRATION,event,async message=>{
    delivered.push(message.eventId);
    rebuildTripHistoryProjection(await repo.listEvents());
   });
  });
  const transitions=[
   {type:"shift_start" as const,at:"2026-11-03T10:00:00.000Z"},
   {type:"trip_start" as const,at:"2026-11-03T10:05:00.000Z"},
   {type:"trip_end" as const,at:"2026-11-03T10:35:30.000Z"},
  ];
  for(const transition of transitions){
   captureAt=transition.at;
   const snapshot=await repo.getSnapshot();
   const command=createDriverCommand(snapshot,transition.type,"pwa","e2e-"+transition.type,transition.at);
   const result=await service.dispatch(command);
   expect(result.status).toBe("recorded");
   expect(result.integrationPending).toBe(false);
  }
  expect(delivered).toEqual(["e2e-shift_start","e2e-trip_start","e2e-trip_end"]);
  expect(readTripHistoryProjection()).toMatchObject([{status:"completed",startedAt:"2026-11-03T10:05:00.000Z",endedAt:"2026-11-03T10:35:30.000Z"}]);

  const duration=executeRegisteredCalculation(runtime.calculations,TRIP_DURATION_CALCULATION.id,{
   businessDate:"2026-11-03",
   startedAt:readTripHistoryProjection()[0].startedAt!,
   endedAt:readTripHistoryProjection()[0].endedAt!,
  },{version:1,inputSchemaVersion:1,outputSchemaVersion:1});
  expect(duration.value).toBe(30.5);

  browserDatabase.close();
  await browserDatabase.open();
  const recoveredRepository=new DexieDriverWorkflowRepository();
  const recoveredEvents=await recoveredRepository.listEvents();
  expect(recoveredEvents).toHaveLength(3);
  rebuildTripHistoryProjection(recoveredEvents);
  expect(readTripHistoryProjection()).toMatchObject([{status:"completed",startedAt:"2026-11-03T10:05:00.000Z",endedAt:"2026-11-03T10:35:30.000Z"}]);

  const replayed:string[]=[];
  const recoveredService=new DriverWorkflowService(recoveredRepository,{capture:async()=>({...gps,fixAt:captureAt})},async event=>{
   await dispatchCommittedFeatureEvent(runtime,LOGBOOK_WORK_EVENT_INTEGRATION,event,async message=>{
    replayed.push(message.eventId);
    rebuildTripHistoryProjection(await recoveredRepository.listEvents());
   });
  });
  const replay=await recoveredService.replayCommittedEvents();
  expect(replay).toEqual({delivered:3,pending:0});
  expect(replayed).toEqual(["e2e-shift_start","e2e-trip_start","e2e-trip_end"]);
  expect(readTripHistoryProjection()).toHaveLength(1);
  expect(readTripHistoryProjection()[0].status).toBe("completed");
 });

 it("returns a saved driver action before GPS finishes and commits it in the background",async()=>{
  const repo=new DexieDriverWorkflowRepository();
  const transitionAt=new Date().toISOString();
  const command=createDriverCommand(await repo.getSnapshot(),"shift_start","pwa","cmd-background",transitionAt);
  let finishGps:(fix:GpsFix)=>void=()=>{throw new Error("GPS resolver not initialized")};
  const service=new DriverWorkflowService(repo,{capture:()=>new Promise(resolve=>{finishGps=resolve})});
  const statusChanges:number[]=[];
  const unsubscribe=service.subscribeStatus(()=>statusChanges.push(Date.now()));
  const result=await service.dispatchBackground(command);

  expect(result.status).toBe("pending_location");
  expect((await repo.getSnapshot()).revision).toBe(0);
  expect((await repo.getIntent(command.eventId))?.status).toBe("pending_location");

  finishGps({...gps,fixAt:transitionAt});
  for(let attempt=0;attempt<20&&(await repo.getSnapshot()).revision===0;attempt++){
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  expect((await repo.getSnapshot()).revision).toBe(1);
  expect((await repo.getIntent(command.eventId))?.status).toBe("recorded");
  expect(statusChanges.length).toBeGreaterThan(0);
  unsubscribe();
 });


});
