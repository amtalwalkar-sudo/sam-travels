import { describe, expect, it } from "vitest";
import type { AtomicRecordRepository } from "../packages/core/src/repositories";
import type { RecordEnvelope } from "../packages/core/src/types";
import { calculateTripFinancialSummary, submitCompletedTripFinancials, type CompletedTripFinancialObligation } from "../packages/application/src/trip-financial-service";
class Records implements AtomicRecordRepository {
 private rows=new Map<string,RecordEnvelope<unknown>>();
 async get<T>(id:string){return this.rows.get(id) as RecordEnvelope<T>|undefined;}
 async put<T>(row:RecordEnvelope<T>){this.rows.set(row.id,row as RecordEnvelope<unknown>);}
 async list<T>(){return [...this.rows.values()] as RecordEnvelope<T>[];}
 async remove(id:string){this.rows.delete(id);}
 async compareAndSet<T>(id:string,revision:number|null,next:RecordEnvelope<T>){if((this.rows.get(id)?.revision??null)!==revision)return false;this.rows.set(id,next as RecordEnvelope<unknown>);return true;}
}
function obligation(tripId:string):RecordEnvelope<CompletedTripFinancialObligation>{const now="2026-11-10T00:00:00.000Z";return{id:"work:trip-financial-obligation:"+tripId,schemaVersion:1,createdAt:now,updatedAt:now,source:"integration",revision:1,data:{schemaVersion:1,tripId,kind:"completed_ride_financials",status:"pending",endRideEventId:"end-event-1",createdAt:now}};}
describe("completed trip financial closeout",()=>{
 it("accepts explicit zero Fare and idempotently submits the same operation",async()=>{const records=new Records();await records.put(obligation("trip-1"));const submit=(values:{farePaise:number;tollPaise?:number;tollPayer?:"driver"|"customer";parkingPaise?:number;parkingPayer?:"driver"|"customer"},op:string)=>submitCompletedTripFinancials(records,"web","trip-1",values,op,()=>"2026-11-10T01:00:00.000Z");const first=await submit({farePaise:0},"fare-op-1"),replay=await submit({farePaise:0},"fare-op-1");expect(first.data).toMatchObject({status:"submitted",farePaise:0,operationId:"fare-op-1"});expect(replay.revision).toBe(first.revision);});
 it("requires Fare and independent payer selection for each entered optional amount",async()=>{const records=new Records();await records.put(obligation("trip-2"));await expect(submitCompletedTripFinancials(records,"web","trip-2",{} as never,"op-2")).rejects.toThrow("fare_required_non_negative_integer_paise");await expect(submitCompletedTripFinancials(records,"web","trip-2",{farePaise:100,tollPaise:10},"op-2")).rejects.toThrow("toll_payer_required");await expect(submitCompletedTripFinancials(records,"web","trip-2",{farePaise:100,parkingPayer:"driver"} as never,"op-2")).rejects.toThrow("parking_payer_without_amount");});
 it("rejects a conflicting replay after a completed trip is submitted",async()=>{
  const records=new Records();await records.put(obligation("trip-3"));
  await submitCompletedTripFinancials(records,"web","trip-3",{farePaise:25000},"same-op");
  await expect(submitCompletedTripFinancials(records,"web","trip-3",{farePaise:30000},"other-op"))
   .rejects.toThrow("completed_trip_financials_already_submitted");
 });
 it("rejects a concurrent payload conflict that reuses the same operation identity",async()=>{
  const records=new Records();await records.put(obligation("trip-race"));
  const results=await Promise.allSettled([
   submitCompletedTripFinancials(records,"web","trip-race",{farePaise:1000},"same-operation"),
   submitCompletedTripFinancials(records,"android","trip-race",{farePaise:2000},"same-operation"),
  ]);
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
  const saved=await records.get<CompletedTripFinancialObligation>("work:trip-financial-obligation:trip-race");
  expect(saved?.data.status).toBe("submitted");
  expect([1000,2000]).toContain(saved?.data.farePaise);
 });
 it("computes the approved customer charge, driver expenses and net earnings",()=>{expect(calculateTripFinancialSummary({farePaise:252000,tollPaise:32000,tollPayer:"driver",parkingPaise:25000,parkingPayer:"driver"})).toEqual({customerChargePaise:252000,driverExpensesPaise:57000,netTripEarningsBeforeFuelPaise:195000});expect(calculateTripFinancialSummary({farePaise:185000,tollPaise:32000,tollPayer:"customer"})).toEqual({customerChargePaise:217000,driverExpensesPaise:0,netTripEarningsBeforeFuelPaise:185000});});
});
