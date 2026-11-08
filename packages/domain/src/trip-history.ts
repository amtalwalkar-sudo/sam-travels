import type { DriverEvent } from "./driver-workflow";
export type TripHistoryStatus = "active" | "completed" | "cancelled" | "needs_attention";
export interface TripHistoryRecord {
 id:string; creationEventId?:string; createdAt?:string; startEventId?:string; startedAt?:string;
 startGps?:DriverEvent["gps"]; endEventId?:string; endedAt?:string; endGps?:DriverEvent["gps"];
 status:TripHistoryStatus; reason?:string; driverContext?:DriverEvent["command"]["driverContext"];
 tripContext?:DriverEvent["command"]["tripContext"];
}
/** Rebuild from immutable revision-ordered events; legacy v1 events remain readable. */
export function buildTripHistory(events:readonly DriverEvent[]):TripHistoryRecord[]{
 const ordered=[...events].sort((a,b)=>a.revision-b.revision||Date.parse(a.committedAt)-Date.parse(b.committedAt)||a.eventId.localeCompare(b.eventId));
 const trips:TripHistoryRecord[]=[];let active:TripHistoryRecord|undefined;
 for(const event of ordered){
  const kind=event.command.eventType;
  if(kind==="trip_create"){
   if(active){active.status="needs_attention";active.reason="overlapping_trip_creation";}
   active={id:event.eventId,creationEventId:event.eventId,createdAt:event.command.transitionAt,tripContext:event.command.tripContext,status:"active"};
   trips.push(active);continue;
  }
  if(kind==="trip_start"){
   if(active){active.status="needs_attention";active.reason="overlapping_trip_start";}
   active={id:event.eventId,startEventId:event.eventId,startedAt:event.command.transitionAt,startGps:event.gps,
    ...(event.command.driverContext?{driverContext:event.command.driverContext}:{}),status:"active"};
   trips.push(active);continue;
  }
  if(kind==="start_ride"){
   if(!active||active.startedAt){trips.push({id:"unmatched:"+event.eventId,startEventId:event.eventId,startedAt:event.command.transitionAt,startGps:event.gps,status:"needs_attention",reason:"ride_start_without_trip_creation"});}
   else{active.startEventId=event.eventId;active.startedAt=event.command.transitionAt;active.startGps=event.gps;}
   continue;
  }
  if(kind!=="trip_end"&&kind!=="ride_cancel"&&kind!=="end_ride"&&kind!=="cancel_ride")continue;
  if(active && kind==="end_ride" && !active.startedAt){
   active.status="needs_attention";active.reason="end_ride_without_start_ride";active.endEventId=event.eventId;active.endedAt=event.command.transitionAt;active.endGps=event.gps;active=undefined;continue;
  }
  if(active && kind==="cancel_ride" && active.startedAt){
   active.status="needs_attention";active.reason="cancel_after_start_ride";active.endEventId=event.eventId;active.endedAt=event.command.transitionAt;active.endGps=event.gps;active=undefined;continue;
  }
  if(!active){
   const cancelled=(kind==="ride_cancel"&&event.command.expectedPriorState==="approach_active")||kind==="cancel_ride";
   trips.push({id:(cancelled?"cancelled-before-start:":"unmatched:")+event.eventId,endEventId:event.eventId,endedAt:event.command.transitionAt,endGps:event.gps,
    status:cancelled?"cancelled":"needs_attention",reason:cancelled?"cancelled_before_ride_start":"trip_close_without_start"});
   continue;
  }
  active.endEventId=event.eventId;active.endedAt=event.command.transitionAt;active.endGps=event.gps;
  active.status=kind==="ride_cancel"||kind==="cancel_ride"?"cancelled":"completed";active=undefined;
 }
 return trips.sort((a,b)=>Date.parse(b.createdAt??b.startedAt??b.endedAt??"")-Date.parse(a.createdAt??a.startedAt??a.endedAt??""));
}
