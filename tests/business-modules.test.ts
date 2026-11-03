import{describe,it,expect}from"vitest";
import{calculateMonthlyEmi,buildLoanSchedule,calculatePerformance,validateBusinessRecord,type TripRecord,type FinanceRecord}from"../packages/domain/src/business-modules";
import{BusinessModuleService}from"../packages/application/src/business-module-service";
import type{RecordEnvelope}from"../packages/core/src/types";
import type{RecordRepository}from"../packages/core/src/repositories";
class MemoryRepository implements RecordRepository{
 rows=new Map<string,RecordEnvelope<unknown>>();
 async get<T>(id:string){return this.rows.get(id) as RecordEnvelope<T>|undefined}
 async put<T>(r:RecordEnvelope<T>){this.rows.set(r.id,r as RecordEnvelope<unknown>)}
 async list<T>(){return[...this.rows.values()] as Array<RecordEnvelope<T>>}
 async remove(id:string){this.rows.delete(id)}
}
describe("Phase 4 business domain",()=>{
 it("accepts historical business dates without coupling them to setup dates",()=>{const record:TripRecord={kind:"trip",businessDate:"2022-01-04",origin:"Mumbai",destination:"Pune",status:"completed",farePaise:125000,distanceMetres:148000,cancellationFeePaise:0};expect(validateBusinessRecord(record)).toEqual([])});
 it("validates compliance expiry ordering and finance amounts",()=>{expect(validateBusinessRecord({kind:"compliance",documentType:"Permit",issueDate:"2026-10-01",expiryDate:"2026-09-30"}).some(x=>x.code==="invalid_range")).toBe(true);expect(validateBusinessRecord({kind:"finance",businessDate:"2026-11-01",direction:"expense",category:"fuel",amountPaise:0,description:"Fuel"}).length).toBe(1)});
 it("calculates a reducing-balance EMI schedule to zero",()=>{const emi=calculateMonthlyEmi(10000000,1200,12);expect(emi).toBeGreaterThan(0);const rows=buildLoanSchedule({principalPaise:10000000,annualInterestRateBps:1200,tenureMonths:12});expect(rows.at(-1)?.closingPaise).toBe(0);expect(rows.length).toBe(12);const reduced=buildLoanSchedule({principalPaise:10000000,annualInterestRateBps:1200,tenureMonths:12,prepayments:[{month:1,amountPaise:1000000}]});expect(reduced.length).toBeLessThan(rows.length);expect(reduced[0].prepaymentPaise).toBe(1000000)});
 it("includes cancellation fees in gross income and income after fuel",()=>{const trips:TripRecord[]=[{kind:"trip",businessDate:"2026-11-02",origin:"A",destination:"B",status:"completed",farePaise:10000,cancellationFeePaise:0,distanceMetres:1000},{kind:"trip",businessDate:"2026-11-03",origin:"A",destination:"C",status:"cancelled",farePaise:0,cancellationFeePaise:2500,distanceMetres:0}];const expenses:FinanceRecord[]=[{kind:"finance",businessDate:"2026-11-03",direction:"expense",category:"fuel",amountPaise:1000,description:"Fuel"}];const result=calculatePerformance({trips,expenses,from:"2026-11-01",to:"2026-11-30"});expect(result.grossIncomePaise).toBe(12500);expect(result.incomeAfterFuelPaise).toBe(11500)});
});
describe("business module persistence service",()=>{
 it("stores records by module, validates updates and archives without deleting history",async()=>{const repo=new MemoryRepository(),service=new BusinessModuleService(repo,"web",()=>"fixed-id");const created=await service.create<TripRecord>({kind:"trip",businessDate:"2020-01-01",origin:"Mumbai",destination:"Nashik",status:"completed",farePaise:50000,cancellationFeePaise:0,distanceMetres:165000},"2026-11-03T10:00:00Z");expect((await service.list("logbook")).length).toBe(1);await service.archive(created.id,"2026-11-03T11:00:00Z");expect((await service.list("logbook")).length).toBe(0);expect((await repo.get(created.id))?.deletedAt).toBe("2026-11-03T11:00:00Z")});
});
