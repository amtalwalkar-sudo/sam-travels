import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { registerVehicleBrowserBackupParticipant } from "../apps/web/src/vehicle-backup";
import { exportBrowserSnapshot, restoreBrowserSnapshot } from "../packages/storage-browser/src";

describe("completed trip financial backup and restore",()=>{
 let unregisterVehicle:(()=>void)|undefined;
 beforeEach(async()=>{unregisterVehicle=registerVehicleBrowserBackupParticipant();await browserDatabase.delete();await browserDatabase.open();});
 afterEach(()=>{unregisterVehicle?.();unregisterVehicle=undefined;});
 it("restores a pending Fare obligation and its in-progress zero-valid working copy",async()=>{
  const timestamp="2026-11-10T04:30:00.000Z",tripId="completed-trip-backup-1";
  const obligationId="work:trip-financial-obligation:"+tripId;
  const draftId="__sam_travels_form_working_copy__:work.trip-completed-financials:"+tripId;
  await browserDatabase.records.bulkPut([
   {id:obligationId,schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:1,
    data:{schemaVersion:1,tripId,kind:"completed_ride_financials",status:"pending",endRideEventId:"end-event-1",createdAt:timestamp}},
   {id:draftId,schemaVersion:1,createdAt:timestamp,updatedAt:timestamp,source:"web",revision:2,
    data:{formId:"work.trip-completed-financials",formVersion:1,instanceId:tripId,revision:1,status:"in_progress",
     values:{tripId,farePaise:0,tollPaise:32000,tollPayer:"driver"},operationId:"completed-trip-op-1",updatedAt:timestamp}},
  ]);
  const snapshot=await exportBrowserSnapshot("0.1.0");
  await browserDatabase.records.clear();
  await restoreBrowserSnapshot({data:snapshot.data,manifest:snapshot.manifest,confirmed:true});
  expect((await browserDatabase.records.get(obligationId))?.data).toMatchObject({
   kind:"completed_ride_financials",status:"pending",endRideEventId:"end-event-1",
  });
  expect((await browserDatabase.records.get(draftId))?.data).toMatchObject({
   formId:"work.trip-completed-financials",status:"in_progress",values:{tripId,farePaise:0,tollPaise:32000,tollPayer:"driver"},
  });
 });
});
