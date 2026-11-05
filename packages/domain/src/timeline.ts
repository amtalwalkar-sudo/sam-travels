import type { DriverEvent } from "./driver-workflow";
export const TIMELINE_PROJECTION_VERSION = 1 as const;
export const TIMELINE_TIME_ZONE = "Asia/Kolkata" as const;
export const LOGICAL_SHIFT_BOUNDARY_MINUTES = 240 as const;
export const TIMELINE_V1_METRIC_IDS = ["shift_duration","pickup_time","passenger_trip_time","idle_time","total_fare","toll_total","parking_total","business_km","completed_ride_count","cancelled_attempt_count"] as const;
export type TimelineMetricId = typeof TIMELINE_V1_METRIC_IDS[number];
export type TimelineMetricStatus = "available" | "pending" | "unavailable" | "invalid";
export type TimelineMetricUnit = "minutes" | "count" | "minor_currency_units" | "km";
export type TimelineMetric =
  | { status:"available"; value:number; unit:TimelineMetricUnit; currency?:string }
  | { status:"pending"|"unavailable"|"invalid"; reason:string; unit:TimelineMetricUnit };
export type TimelineSourceSnapshot<T> =
  | { status:"available"; records:readonly T[] }
  | { status:"pending"; reason?:string }
  | { status:"unavailable"|"invalid"; reason:string };
/** Finance-owned records; amounts are integer minor units (paise for INR). */
export type TimelineFinancialRecord = { id:string; tripId:string; kind:"fare"|"cancellation_fee"|"toll"|"parking"; amountMinor:number; currency:string; occurredAt:string };
/** Vehicle-owned odometer evidence. */
export type TimelineOdometerReading = { id:string; kind:"start"|"end"; readingKm:number; recordedAt:string };
export type TimelineProjectionInput = {
  events:readonly DriverEvent[];
  asOf?:string;
  financial?:TimelineSourceSnapshot<TimelineFinancialRecord>;
  odometer?:TimelineSourceSnapshot<TimelineOdometerReading>;
};
export type TimelineIntegrityIssue = {
  code:"invalid_event"|"conflicting_duplicate_event_id"|"overlapping_shift_start"|"unmatched_shift_end"|"invalid_shift_interval"|"overlapping_trip_start"|"unmatched_trip_close"|"invalid_trip_interval";
  eventId?:string;
  logicalShiftId?:string;
};
export type TimelineShiftProjection = { id:string; anchorDate:string; eventIds:string[]; metrics:Readonly<Record<TimelineMetricId,TimelineMetric>> };
export type TimelineCalendarDay = { date:string; eventIds:string[]; logicalShiftIds:string[] };
export type TimelineProjection = { schemaVersion:1; timeZone:"Asia/Kolkata"; logicalShiftBoundary:"04:00"; calendarDays:TimelineCalendarDay[]; logicalShifts:TimelineShiftProjection[]; integrityIssues:TimelineIntegrityIssue[] };
type TripSpan = { id:string; endedAt:number; status:"completed"|"cancelled"; ownerShiftId:string };
type ShiftBuilder = {
  id:string; anchorDate:string; eventIds:Set<string>; shiftDurationMs:number; passengerTripMs:number;
  completedRideCount:number; cancelledAttemptCount:number; pendingShift:boolean; pendingTrip:boolean;
  invalidShift:boolean; invalidTrip:boolean;
};
const UNIT:Record<TimelineMetricId,TimelineMetricUnit> = {
  shift_duration:"minutes",pickup_time:"minutes",passenger_trip_time:"minutes",idle_time:"minutes",
  total_fare:"minor_currency_units",toll_total:"minor_currency_units",parking_total:"minor_currency_units",
  business_km:"km",completed_ride_count:"count",cancelled_attempt_count:"count",
};
const formatter = new Intl.DateTimeFormat("en-CA",{timeZone:TIMELINE_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function localParts(timestamp:number):{date:string;minuteOfDay:number} {
  const parts=formatter.formatToParts(new Date(timestamp));
  const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(p=>p.type===type)?.value??"";
  return {date:value("year")+"-"+value("month")+"-"+value("day"),minuteOfDay:Number(value("hour"))*60+Number(value("minute"))};
}
function shiftDate(date:string,delta:number):string {
  const [y,m,d]=date.split("-").map(Number);
  return new Date(Date.UTC(y,m-1,d+delta)).toISOString().slice(0,10);
}
function anchorDateAt(timestamp:number):string {
  const p=localParts(timestamp); return p.minuteOfDay<LOGICAL_SHIFT_BOUNDARY_MINUTES?shiftDate(p.date,-1):p.date;
}
function shiftIdAt(timestamp:number):string { return "logical-shift:"+anchorDateAt(timestamp); }
function nextBoundary(timestamp:number):number {
  const [y,m,d]=shiftDate(anchorDateAt(timestamp),1).split("-").map(Number);
  return Date.UTC(y,m-1,d,4,0,0)-330*60_000;
}
function dateAt(timestamp:number):string { return localParts(timestamp).date; }
function parseTime(value:string|undefined):number|undefined {
  if(typeof value!=="string")return undefined; const n=Date.parse(value); return Number.isFinite(n)?n:undefined;
}
function createShift(id:string):ShiftBuilder {
  return {id,anchorDate:id.slice(13),eventIds:new Set(),shiftDurationMs:0,passengerTripMs:0,completedRideCount:0,cancelledAttemptCount:0,pendingShift:false,pendingTrip:false,invalidShift:false,invalidTrip:false};
}
function addInterval(shifts:Map<string,ShiftBuilder>,start:number,end:number,target:"shiftDurationMs"|"passengerTripMs"):void {
  let cursor=start;
  while(cursor<end) {
    const id=shiftIdAt(cursor),until=Math.min(end,nextBoundary(cursor));
    if(until<=cursor)throw new Error("Timeline interval boundary did not advance");
    const shift=shifts.get(id)??createShift(id); shift[target]+=until-cursor; shifts.set(id,shift); cursor=until;
  }
}
function available(value:number,unit:TimelineMetricUnit,currency?:string):TimelineMetric {
  return currency?{status:"available",value,unit,currency}:{status:"available",value,unit};
}
function unavailable(unit:TimelineMetricUnit,reason:string):TimelineMetric { return {status:"unavailable",unit,reason}; }
function sourceMetric<T>(source:TimelineSourceSnapshot<T>|undefined,unit:TimelineMetricUnit,missing:string):{status:"available";records:readonly T[]}|TimelineMetric {
  if(!source)return unavailable(unit,missing);
  if(source.status==="available")return source;
  if(source.status==="pending")return {status:"pending",unit,reason:source.reason??"source_pending"};
  return {status:source.status,unit,reason:source.reason};
}
function minutes(ms:number):number { return Math.round((ms/60_000+Number.EPSILON)*100)/100; }
function eventSignature(e:DriverEvent):string {
  return [e.eventId,e.revision,e.committedAt,e.command.eventType,e.command.transitionAt,e.command.expectedPriorState,e.command.idempotencyKey].join("|");
}
/**
 * Pure, disposable Timeline projection. Work events remain authoritative.
 * Finance/Vehicle evidence is accepted only through typed source snapshots;
 * absent upstream contracts remain explicitly unavailable, never fabricated as zero.
 */
export function buildTimelineProjection(input:TimelineProjectionInput):TimelineProjection {
  const shifts=new Map<string,ShiftBuilder>(),issues:TimelineIntegrityIssue[]=[];
  const calendarEvents=new Map<string,Set<string>>(),unique=new Map<string,DriverEvent>();
  const ensure=(id:string):ShiftBuilder=>{const found=shifts.get(id);if(found)return found;const created=createShift(id);shifts.set(id,created);return created;};
  for(const event of input.events) {
    const at=parseTime(event?.command?.transitionAt);
    if(!event?.eventId||!Number.isSafeInteger(event.revision)||event.revision<1||at===undefined||!event.command?.eventType) {
      issues.push({code:"invalid_event",eventId:event?.eventId});continue;
    }
    const previous=unique.get(event.eventId);
    if(previous) {
      if(eventSignature(previous)!==eventSignature(event)) {
        const id=shiftIdAt(at);ensure(id).invalidTrip=true;ensure(id).invalidShift=true;
        issues.push({code:"conflicting_duplicate_event_id",eventId:event.eventId,logicalShiftId:id});
      }
      continue;
    }
    unique.set(event.eventId,event);
  }
  const events=[...unique.values()].sort((a,b)=>
    Date.parse(a.command.transitionAt)-Date.parse(b.command.transitionAt)||a.revision-b.revision||a.eventId.localeCompare(b.eventId));
  for(const e of events) {
    const at=Date.parse(e.command.transitionAt),id=shiftIdAt(at),day=dateAt(at);
    ensure(id).eventIds.add(e.eventId);
    const ids=calendarEvents.get(day)??new Set<string>();ids.add(e.eventId);calendarEvents.set(day,ids);
  }
  const asOf=parseTime(input.asOf);
  let openShift:DriverEvent|undefined;
  for(const e of events) {
    const kind=e.command.eventType,at=Date.parse(e.command.transitionAt),id=shiftIdAt(at);
    if(kind==="shift_start") {
      if(openShift) {
        const prior=shiftIdAt(Date.parse(openShift.command.transitionAt));ensure(prior).invalidShift=true;ensure(id).invalidShift=true;
        issues.push({code:"overlapping_shift_start",eventId:e.eventId,logicalShiftId:id});
      } else openShift=e;
    } else if(kind==="shift_end") {
      if(!openShift) {ensure(id).invalidShift=true;issues.push({code:"unmatched_shift_end",eventId:e.eventId,logicalShiftId:id});}
      else {
        const start=Date.parse(openShift.command.transitionAt);
        if(at<start) {ensure(shiftIdAt(start)).invalidShift=true;ensure(id).invalidShift=true;issues.push({code:"invalid_shift_interval",eventId:e.eventId,logicalShiftId:id});}
        else addInterval(shifts,start,at,"shiftDurationMs");
        openShift=undefined;
      }
    }
  }
  if(openShift) {
    const start=Date.parse(openShift.command.transitionAt),s=ensure(shiftIdAt(start));
    if(asOf===undefined)s.pendingShift=true;
    else if(asOf<start){s.invalidShift=true;issues.push({code:"invalid_shift_interval",eventId:openShift.eventId,logicalShiftId:s.id});}
    else addInterval(shifts,start,asOf,"shiftDurationMs");
  }

  const trips:TripSpan[]=[],openTrip: {event:DriverEvent}|undefined;
  let activeTrip=openTrip;
  for(const e of events) {
    const kind=e.command.eventType,at=Date.parse(e.command.transitionAt),id=shiftIdAt(at);
    if(kind==="trip_start") {
      if(activeTrip) {
        const prior=shiftIdAt(Date.parse(activeTrip.event.command.transitionAt));ensure(prior).invalidTrip=true;ensure(id).invalidTrip=true;
        issues.push({code:"overlapping_trip_start",eventId:e.eventId,logicalShiftId:id});
      } else activeTrip={event:e};
    } else if(kind==="trip_end"||kind==="ride_cancel") {
      if(activeTrip) {
        const start=Date.parse(activeTrip.event.command.transitionAt),ownerId=shiftIdAt(start);
        if(at<start){ensure(ownerId).invalidTrip=true;ensure(id).invalidTrip=true;issues.push({code:"invalid_trip_interval",eventId:e.eventId,logicalShiftId:ownerId});}
        else {
          const cancelled=kind==="ride_cancel";
          trips.push({id:activeTrip.event.eventId,endedAt:at,status:cancelled?"cancelled":"completed",ownerShiftId:ownerId});
          const owner=ensure(ownerId);
          if(cancelled)owner.cancelledAttemptCount+=1;
          else {owner.completedRideCount+=1;addInterval(shifts,start,at,"passengerTripMs");}
        }
        activeTrip=undefined;
      } else if(kind==="ride_cancel"&&e.command.expectedPriorState==="approach_active") {
        trips.push({id:"cancelled-before-start:"+e.eventId,endedAt:at,status:"cancelled",ownerShiftId:id});
        ensure(id).cancelledAttemptCount+=1;
      } else {ensure(id).invalidTrip=true;issues.push({code:"unmatched_trip_close",eventId:e.eventId,logicalShiftId:id});}
    }
  }
  if(activeTrip) {
    const start=Date.parse(activeTrip.event.command.transitionAt),s=ensure(shiftIdAt(start));
    if(asOf===undefined)s.pendingTrip=true;
    else if(asOf<start){s.invalidTrip=true;issues.push({code:"invalid_trip_interval",eventId:activeTrip.event.eventId,logicalShiftId:s.id});}
    else {addInterval(shifts,start,asOf,"passengerTripMs");for(const shift of shifts.values())if(shift.passengerTripMs>0)shift.pendingTrip=true;}
  }

  const tripById=new Map(trips.map(t=>[t.id,t]));
  const financial=sourceMetric(input.financial,"minor_currency_units","finance_source_not_registered");
  const totals=new Map<string,Record<"total_fare"|"toll_total"|"parking_total",number>>();
  const currencies=new Map<"total_fare"|"toll_total"|"parking_total",Set<string>>();
  const financialInvalid=new Map<"total_fare"|"toll_total"|"parking_total",string>();
  if("records" in financial)for(const record of financial.records) {
    const metric=record.kind==="fare"||record.kind==="cancellation_fee"?"total_fare":record.kind==="toll"?"toll_total":"parking_total";
    const trip=tripById.get(record.tripId);
    if(!record.id||!Number.isSafeInteger(record.amountMinor)||record.amountMinor<0||!/^[A-Z]{3}$/.test(record.currency)||parseTime(record.occurredAt)===undefined||!trip||
      (record.kind==="fare"&&trip.status!=="completed")||(record.kind==="cancellation_fee"&&trip.status!=="cancelled")) {
      financialInvalid.set(metric,"financial_record_invalid_or_unowned");continue;
    }
    const sum=totals.get(trip.ownerShiftId)??{total_fare:0,toll_total:0,parking_total:0};
    sum[metric]+=record.amountMinor;totals.set(trip.ownerShiftId,sum);
    const set=currencies.get(metric)??new Set<string>();set.add(record.currency);currencies.set(metric,set);
  }

  const odometer=sourceMetric(input.odometer,"km","odometer_source_not_registered");
  const odometerGroups=new Map<string,{start:TimelineOdometerReading[];end:TimelineOdometerReading[]}>();
  let odometerInvalid:string|undefined;
  if("records" in odometer)for(const reading of odometer.records) {
    if(!reading.id||!Number.isFinite(reading.readingKm)||reading.readingKm<0||parseTime(reading.recordedAt)===undefined) {odometerInvalid="odometer_reading_invalid";continue;}
    const id=shiftIdAt(Date.parse(reading.recordedAt)),group=odometerGroups.get(id)??{start:[],end:[]};
    group[reading.kind].push(reading);odometerGroups.set(id,group);ensure(id);
  }

  const logicalShifts=[...shifts.values()].sort((a,b)=>a.anchorDate.localeCompare(b.anchorDate)).map((s):TimelineShiftProjection=>{
    const financialMetric=(id:"total_fare"|"toll_total"|"parking_total"):TimelineMetric=>{
      if(!("records" in financial))return financial;
      const bad=financialInvalid.get(id);if(bad)return {status:"invalid",unit:UNIT[id],reason:bad};
      const set=currencies.get(id)??new Set<string>();if(set.size>1)return {status:"invalid",unit:UNIT[id],reason:"mixed_currency_not_comparable"};
      return available(totals.get(s.id)?.[id]??0,UNIT[id],[...set][0]);
    };
    let businessKm:TimelineMetric;
    if(!("records" in odometer))businessKm=odometer;
    else if(odometerInvalid)businessKm={status:"invalid",unit:"km",reason:odometerInvalid};
    else {
      const pair=odometerGroups.get(s.id);
      if(!pair||pair.start.length===0&&pair.end.length===0)businessKm=unavailable("km","odometer_readings_missing");
      else if(pair.start.length!==1||pair.end.length!==1)businessKm=pair.start.length>1||pair.end.length>1
        ?{status:"invalid",unit:"km",reason:"duplicate_odometer_boundary_reading"}:{status:"pending",unit:"km",reason:"odometer_pair_incomplete"};
      else if(pair.end[0].readingKm<pair.start[0].readingKm)businessKm={status:"invalid",unit:"km",reason:"odometer_decreased"};
      else businessKm=available(pair.end[0].readingKm-pair.start[0].readingKm,"km");
    }
    const duration:TimelineMetric=s.invalidShift?{status:"invalid",unit:"minutes",reason:"shift_event_sequence_invalid"}:
      s.pendingShift?{status:"pending",unit:"minutes",reason:"shift_end_not_recorded"}:available(minutes(s.shiftDurationMs),"minutes");
    const passenger:TimelineMetric=s.invalidTrip?{status:"invalid",unit:"minutes",reason:"trip_event_sequence_invalid"}:
      s.pendingTrip?{status:"pending",unit:"minutes",reason:"trip_end_not_recorded"}:available(minutes(s.passengerTripMs),"minutes");
    const completed:TimelineMetric=s.invalidTrip?{status:"invalid",unit:"count",reason:"trip_event_sequence_invalid"}:available(s.completedRideCount,"count");
    const cancelled:TimelineMetric=s.invalidTrip?{status:"invalid",unit:"count",reason:"trip_event_sequence_invalid"}:available(s.cancelledAttemptCount,"count");
    return {id:s.id,anchorDate:s.anchorDate,eventIds:[...s.eventIds].sort(),metrics:{
      shift_duration:duration,pickup_time:unavailable("minutes","pickup_initiation_event_not_persisted"),
      passenger_trip_time:passenger,idle_time:unavailable("minutes","pickup_time_unavailable"),
      total_fare:financialMetric("total_fare"),toll_total:financialMetric("toll_total"),
      parking_total:financialMetric("parking_total"),business_km:businessKm,
      completed_ride_count:completed,cancelled_attempt_count:cancelled,
    }};
  });
  const calendarDays=[...calendarEvents.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,ids])=>{
    const shiftIds=new Set<string>();for(const eventId of ids){const e=unique.get(eventId)!;shiftIds.add(shiftIdAt(Date.parse(e.command.transitionAt)));}
    return {date,eventIds:[...ids].sort(),logicalShiftIds:[...shiftIds].sort()};
  });
  return {schemaVersion:TIMELINE_PROJECTION_VERSION,timeZone:TIMELINE_TIME_ZONE,logicalShiftBoundary:"04:00",calendarDays,logicalShifts,integrityIssues:issues};
}
