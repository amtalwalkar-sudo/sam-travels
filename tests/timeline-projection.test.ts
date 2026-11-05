import {describe,expect,it} from "vitest";
import {buildTimelineProjection,TIMELINE_V1_METRIC_IDS,type TimelineFinancialRecord,type TimelineOdometerReading} from "../packages/domain/src/timeline";
import type {DriverEvent} from "../packages/domain/src/driver-workflow";
function event(id:string,revision:number,eventType:DriverEvent["command"]["eventType"],at:string,expectedPriorState:DriverEvent["command"]["expectedPriorState"]="shift_active"):DriverEvent {
 return {eventId:id,command:{schemaVersion:1,commandId:id,eventId:id,eventType,originSurface:"pwa",transitionAt:at,expectedPriorState,expectedRevision:revision-1,idempotencyKey:id},
 gps:{latitude:19.076,longitude:72.8777,horizontalAccuracyM:8,fixAt:at,provider:"test"},committedAt:at,revision};
}
const shiftStart="2026-11-04T18:00:00.000Z",shiftEnd="2026-11-04T23:30:00.000Z";
describe("headless Timeline domain projection",()=>{
 it("exposes all ten stable v1 metrics",()=>{const p=buildTimelineProjection({events:[]});expect(TIMELINE_V1_METRIC_IDS).toHaveLength(10);expect(p.logicalShifts).toEqual([]);});
 it("groups calendar days at midnight independently from the 04:00 logical shift",()=>{
  const p=buildTimelineProjection({events:[event("ss",1,"shift_start",shiftStart,"idle"),event("se",2,"shift_end",shiftEnd)]});
  expect(p.calendarDays.map(x=>x.date)).toEqual(["2026-11-04","2026-11-05"]);
  expect(p.logicalShifts.map(x=>x.id)).toEqual(["logical-shift:2026-11-04","logical-shift:2026-11-05"]);
  expect(p.logicalShifts.map(x=>x.metrics.shift_duration)).toEqual([{status:"available",value:270,unit:"minutes"},{status:"available",value:60,unit:"minutes"}]);
 });
 it("allocates a 03:50–04:20 trip by overlap but owns its count at trip start",()=>{
  const p=buildTimelineProjection({events:[event("ts",1,"trip_start","2026-11-04T22:20:00.000Z"),event("te",2,"trip_end","2026-11-04T22:50:00.000Z","trip_active")]});
  const [before,after]=p.logicalShifts;
  expect(before.metrics.passenger_trip_time).toEqual({status:"available",value:10,unit:"minutes"});
  expect(after.metrics.passenger_trip_time).toEqual({status:"available",value:20,unit:"minutes"});
  expect(before.metrics.completed_ride_count).toEqual({status:"available",value:1,unit:"count"});
  expect(after.metrics.completed_ride_count).toEqual({status:"available",value:0,unit:"count"});
 });
 it("deduplicates identical delivery and counts cancellations on the originating shift",()=>{
  const start=event("ts",1,"trip_start","2026-11-04T21:00:00.000Z"),cancel=event("cancel",2,"ride_cancel","2026-11-04T21:05:00.000Z","trip_active");
  const p=buildTimelineProjection({events:[start,cancel,start]});expect(p.logicalShifts).toHaveLength(1);
  expect(p.logicalShifts[0].metrics.cancelled_attempt_count).toEqual({status:"available",value:1,unit:"count"});expect(p.integrityIssues).toEqual([]);
 });
 it("keeps missing sources unavailable and known event counts at zero",()=>{
  const p=buildTimelineProjection({events:[event("ss",1,"shift_start",shiftStart,"idle"),event("se",2,"shift_end",shiftEnd)]});
  const m=p.logicalShifts[0].metrics;expect(Object.keys(m).sort()).toEqual([...TIMELINE_V1_METRIC_IDS].sort());
  for(const id of ["pickup_time","idle_time","total_fare","toll_total","parking_total","business_km"] as const)expect(m[id].status).toBe("unavailable");
  expect(m.completed_ride_count).toEqual({status:"available",value:0,unit:"count"});
  expect(m.cancelled_attempt_count).toEqual({status:"available",value:0,unit:"count"});
 });
 it("calculates completed fares plus cancellation fees and trip-owned toll and parking",()=>{
  const events=[event("cs",1,"trip_start","2026-11-04T20:00:00.000Z"),event("ce",2,"trip_end","2026-11-04T20:30:00.000Z","trip_active"),event("xs",3,"trip_start","2026-11-04T21:00:00.000Z"),event("xc",4,"ride_cancel","2026-11-04T21:05:00.000Z","trip_active")];
  const records:TimelineFinancialRecord[]=[
   {id:"fare",tripId:"cs",kind:"fare",amountMinor:45000,currency:"INR",occurredAt:"2026-11-04T20:30:00.000Z"},
   {id:"fee",tripId:"xs",kind:"cancellation_fee",amountMinor:5000,currency:"INR",occurredAt:"2026-11-04T21:05:00.000Z"},
   {id:"toll",tripId:"cs",kind:"toll",amountMinor:2500,currency:"INR",occurredAt:"2026-11-04T20:25:00.000Z"},
   {id:"parking",tripId:"cs",kind:"parking",amountMinor:1000,currency:"INR",occurredAt:"2026-11-04T20:26:00.000Z"}];
  const p=buildTimelineProjection({events,financial:{status:"available",records}}),m=p.logicalShifts[0].metrics;
  expect(m.total_fare).toEqual({status:"available",value:50000,unit:"minor_currency_units",currency:"INR"});
  expect(m.toll_total).toEqual({status:"available",value:2500,unit:"minor_currency_units",currency:"INR"});
  expect(m.parking_total).toEqual({status:"available",value:1000,unit:"minor_currency_units",currency:"INR"});
 });
 it("calculates business kilometres from a valid odometer pair",()=>{
  const readings:TimelineOdometerReading[]=[{id:"os",kind:"start",readingKm:1200.5,recordedAt:shiftStart},{id:"oe",kind:"end",readingKm:1234.75,recordedAt:shiftEnd}];
  const p=buildTimelineProjection({events:[event("ss",1,"shift_start",shiftStart,"idle"),event("se",2,"shift_end",shiftEnd)],odometer:{status:"available",records:readings}});
  expect(p.logicalShifts[0].metrics.business_km).toEqual({status:"available",value:34.25,unit:"km"});
 });
 it("keeps open shift and trip values pending without a stable as-of instant",()=>{
  const p=buildTimelineProjection({events:[event("ss",1,"shift_start",shiftStart,"idle"),event("ts",2,"trip_start","2026-11-04T19:00:00.000Z")]});
  expect(p.logicalShifts[0].metrics.shift_duration.status).toBe("pending");expect(p.logicalShifts[0].metrics.passenger_trip_time.status).toBe("pending");
 });
 it("marks malformed financial evidence invalid instead of coercing it to zero",()=>{
  const p=buildTimelineProjection({events:[event("ts",1,"trip_start","2026-11-04T20:00:00.000Z"),event("te",2,"trip_end","2026-11-04T20:10:00.000Z","trip_active")],
   financial:{status:"available",records:[{id:"bad",tripId:"ts",kind:"fare",amountMinor:-1,currency:"INR",occurredAt:"2026-11-04T20:10:00.000Z"}]}});
  expect(p.logicalShifts[0].metrics.total_fare.status).toBe("invalid");
 });
 it("does not count an orphan close as completed or cancelled",()=>{
  const p=buildTimelineProjection({events:[event("orphan",1,"trip_end","2026-11-04T20:10:00.000Z","trip_active")]});
  expect(p.logicalShifts[0].metrics.completed_ride_count.status).toBe("invalid");expect(p.integrityIssues[0].code).toBe("unmatched_trip_close");
 });
});
